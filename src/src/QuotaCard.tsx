// Quota monitor — Claude usage card (5h session + 7d weekly windows).
// Standalone so both the command deck (Settings tab) and the legacy Control
// panel can mount it without importing each other (App ↔ CommandDeck cycle).
import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

// Ice palette — mirrors App.tsx `C` (kept local to avoid the import cycle).
const C = { ice: '#8fd4ff', txt: '#e7eef6', mut: '#8794a6', ok: '#5be3a7', warn: '#ffcf6b', bad: '#ff7b85', line: 'rgba(143,212,255,0.16)' }

const Bar: React.FC<{ pct: number; color: string }> = ({ pct, color }) => (
  <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
    <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: color, borderRadius: 99, transition: 'width .25s' }} />
  </div>
)

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ background: 'rgba(18,20,28,0.86)', border: `1px solid ${C.line}`, borderRadius: 14, padding: '16px 20px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', fontFamily: '"Segoe UI", system-ui, sans-serif' }}>
    <div style={{ fontSize: 12, color: C.ice, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 4 }}>Quota monitor</div>
    {children}
  </div>
)

interface WindowAgg { calls: number; in_tok: number; out_tok: number; cost_usd: number }
interface UsageStats { plan: string; session_window_h: number; weekly_window_d: number; session: WindowAgg; weekly: WindowAgg; log_path: string }
interface Budget { sessionUsd: number | null; weeklyUsd: number | null }
const BUDGET_DEFAULT: Budget = { sessionUsd: null, weeklyUsd: null }
const loadBudget = (): Budget => {
  try {
    const raw = JSON.parse(localStorage.getItem('gm-quota-budget') ?? '{}') as Partial<Budget>
    return {
      sessionUsd: typeof raw.sessionUsd === 'number' && raw.sessionUsd > 0 ? raw.sessionUsd : null,
      weeklyUsd: typeof raw.weeklyUsd === 'number' && raw.weeklyUsd > 0 ? raw.weeklyUsd : null,
    }
  } catch { return BUDGET_DEFAULT }
}
const saveBudget = (b: Budget) => { localStorage.setItem('gm-quota-budget', JSON.stringify(b)) }
const fmtUsd = (n: number) => n < 0.01 ? `<$0.01` : `$${n.toFixed(2)}`
const fmtTok = (n: number) => n < 1000 ? `${n}` : n < 1_000_000 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1_000_000).toFixed(2)}M`
// Stoplight palette for budget bar: clear → caution → warn → over-budget.
const budgetColor = (pct: number): string => pct >= 100 ? C.bad : pct >= 80 ? C.warn : pct >= 60 ? '#e6b85c' : C.ice

const QuotaCard: React.FC<{ refreshTrigger?: number }> = ({ refreshTrigger = 0 }) => {
  const [st, setSt] = useState<UsageStats | null>(null)
  const [budget, setBudget] = useState<Budget>(loadBudget)
  const [editing, setEditing] = useState(false)
  const [draftSess, setDraftSess] = useState<string>(() => budget.sessionUsd?.toString() ?? '')
  const [draftWeek, setDraftWeek] = useState<string>(() => budget.weeklyUsd?.toString() ?? '')
  const refresh = () => { void invoke<UsageStats>('read_usage').then(setSt).catch(() => {}) }
  useEffect(refresh, [refreshTrigger])
  // Refresh every minute so the rolling 5h window decays visibly even with no clicks.
  useEffect(() => { const id = setInterval(refresh, 60_000); return () => clearInterval(id) }, [])
  const reset = async () => {
    if (!st || (st.session.calls === 0 && st.weekly.calls === 0)) return
    if (!confirm('ล้างประวัติการใช้ quota ทั้งหมด? หลังจากนั้นนับใหม่จากศูนย์.')) return
    try { await invoke('clear_usage_log'); refresh() } catch { /* swallow */ }
  }
  const saveBudgetEdit = () => {
    const parse = (str: string): number | null => {
      const n = parseFloat(str.replace(',', '.'))
      return Number.isFinite(n) && n > 0 ? n : null
    }
    const next: Budget = { sessionUsd: parse(draftSess), weeklyUsd: parse(draftWeek) }
    saveBudget(next); setBudget(next); setEditing(false)
  }
  const clearBudget = () => {
    saveBudget(BUDGET_DEFAULT); setBudget(BUDGET_DEFAULT); setDraftSess(''); setDraftWeek(''); setEditing(false)
  }
  if (!st) return <Shell><div style={{ fontSize: 12.5, color: C.mut, paddingTop: 8 }}>กำลังโหลด…</div></Shell>
  const planLabel = st.plan === 'apikey' ? 'API key (จ่ายต่อ token)' : 'Plan (subscription)'
  const planColor = st.plan === 'apikey' ? C.warn : C.ok
  const Window: React.FC<{ title: string; agg: WindowAgg; budgetUsd: number | null }> = ({ title, agg, budgetUsd }) => {
    const pct = budgetUsd ? (agg.cost_usd / budgetUsd) * 100 : 0
    const color = budgetColor(pct)
    return (
      <div style={{ flex: 1, padding: '12px 14px', background: 'rgba(143,212,255,0.05)', border: `1px solid ${C.line}`, borderRadius: 10 }}>
        <div style={{ fontSize: 11, color: C.mut, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.ice, lineHeight: 1 }}>{agg.calls}</div>
        <div style={{ fontSize: 11, color: C.mut, marginTop: 4 }}>เรียก G-Master</div>
        <div style={{ fontSize: 11.5, color: C.txt, marginTop: 10, lineHeight: 1.5 }}>
          <div>~ {fmtUsd(agg.cost_usd)} โดยประมาณ{budgetUsd ? <span style={{ color: C.mut }}> / งบ {fmtUsd(budgetUsd)}</span> : null}</div>
          <div style={{ color: C.mut }}>in {fmtTok(agg.in_tok)} · out {fmtTok(agg.out_tok)} tokens</div>
        </div>
        {budgetUsd && (
          <div style={{ marginTop: 10 }}>
            <Bar pct={Math.min(100, pct)} color={color} />
            <div style={{ fontSize: 11, marginTop: 4, color: pct >= 80 ? color : C.mut, fontWeight: pct >= 80 ? 600 : 400 }}>
              {pct >= 100
                ? `เกินงบแล้ว (${pct.toFixed(0)}%) — Maiden หยุด auto-advice แล้ว (กดปุ่ม "ขอคำแนะนำ" ยังใช้ได้)`
                : pct >= 80
                  ? `ใกล้งบ ${pct.toFixed(0)}%`
                  : `${pct.toFixed(0)}% ของงบ`}
            </div>
          </div>
        )}
      </div>
    )
  }
  return (
    <Shell>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13 }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: planColor }} />
          <span style={{ color: C.txt }}>โหมด: <b style={{ color: planColor }}>{planLabel}</b></span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setDraftSess(budget.sessionUsd?.toString() ?? ''); setDraftWeek(budget.weeklyUsd?.toString() ?? ''); setEditing((v) => !v) }}
            style={{ background: editing ? 'rgba(143,212,255,0.16)' : 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
            🎯 ตั้งงบ
          </button>
          <button onClick={reset}
            style={{ background: 'transparent', color: C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
            ล้างประวัติ
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <Window title={`Session (${st.session_window_h} ชม.)`} agg={st.session} budgetUsd={budget.sessionUsd} />
        <Window title={`Weekly (${st.weekly_window_d} วัน)`} agg={st.weekly} budgetUsd={budget.weeklyUsd} />
      </div>

      {editing && (
        <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(143,212,255,0.06)', border: `1px solid ${C.line}`, borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: C.mut, marginBottom: 8 }}>
            ตั้งงบสำหรับแต่ละ window (USD โดยประมาณ). ปล่อยว่าง = ไม่จำกัด.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: C.mut }}>
              Session ({st.session_window_h} ชม.) — USD
              <input value={draftSess} onChange={(e) => setDraftSess(e.target.value)} placeholder="เช่น 1.50" inputMode="decimal"
                style={{ background: 'rgba(18,20,28,0.86)', color: C.txt, border: `1px solid ${C.line}`, borderRadius: 7, padding: '6px 10px', fontSize: 13, width: 120 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: C.mut }}>
              Weekly ({st.weekly_window_d} วัน) — USD
              <input value={draftWeek} onChange={(e) => setDraftWeek(e.target.value)} placeholder="เช่น 12.00" inputMode="decimal"
                style={{ background: 'rgba(18,20,28,0.86)', color: C.txt, border: `1px solid ${C.line}`, borderRadius: 7, padding: '6px 10px', fontSize: 13, width: 120 }} />
            </label>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              {(budget.sessionUsd != null || budget.weeklyUsd != null) && (
                <button onClick={clearBudget}
                  style={{ background: 'transparent', color: C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '7px 13px', fontSize: 12.5, cursor: 'pointer' }}>
                  ยกเลิกงบ
                </button>
              )}
              <button onClick={saveBudgetEdit}
                style={{ background: C.ice, color: '#0c1018', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, color: C.mut, marginTop: 10, lineHeight: 1.55 }}>
        ตัวเลขนี้ประมาณการจากความยาว prompt/response × ราคา Sonnet — ไม่ใช่ % คงเหลือทางการของ Anthropic.
        นับเฉพาะคำตอบจาก Claude — Ollama และ cached responses ไม่นับ.
      </div>
    </Shell>
  )
}

export default QuotaCard
