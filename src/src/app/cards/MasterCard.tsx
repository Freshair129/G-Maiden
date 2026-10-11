import React, { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { C } from '../theme'
import { Card, Row, Toggle } from '../primitives'
import type { GameTick, Advice, MasterBackend, MasterReadiness } from '../types'

// ─────────────────────────────── G-MASTER (local-first advisor) ──────────────────────────────
export const MasterCard: React.FC<{ tick: GameTick | null; voice: string; rate: number; enabled: boolean; onEnabledChange: (v: boolean) => void; autoAdvice: boolean; onAutoAdviceChange: (v: boolean) => void; backend: MasterBackend; onBackendChange: (b: MasterBackend) => void; cloudContextOptIn: boolean; onCloudContextOptInChange: (v: boolean) => void; auth: 'plan' | 'apikey'; onAuthChange: (a: 'plan' | 'apikey') => void; apiKeyPresent: boolean; onApiKeySave: (k: string) => void; ollamaModel: string; onOllamaModelChange: (m: string) => void; onUsageChanged?: () => void }> = ({ tick, voice, rate, enabled, onEnabledChange, autoAdvice, onAutoAdviceChange, backend, onBackendChange, cloudContextOptIn, onCloudContextOptInChange, auth, onAuthChange, apiKeyPresent, onApiKeySave, ollamaModel, onOllamaModelChange, onUsageChanged }) => {
  const [advice, setAdvice] = useState<Advice | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [readiness, setReadiness] = useState<MasterReadiness | null>(null)
  const [readinessError, setReadinessError] = useState<string | null>(null)
  const [readinessBusy, setReadinessBusy] = useState(false)
  const readinessRequest = useRef(0)
  // CR-008 WP-2: the key never round-trips back to the webview. We keep only a
  // transient draft; on save it goes straight to the DPAPI store via the backend
  // and is cleared here. `apiKeyPresent` reflects stored state (has_master_api_key).
  const [keyDraft, setKeyDraft] = useState('')
  const canAsk = enabled && !!tick && tick.in_game && !busy
  const usesClaude = backend === 'claude' || backend === 'auto'
  const refreshReadiness = useCallback(async () => {
    const requestId = ++readinessRequest.current
    setReadinessBusy(true)
    setReadinessError(null)
    try {
      const result = await invoke<MasterReadiness>('get_master_readiness')
      if (requestId === readinessRequest.current) setReadiness(result)
    } catch (e: unknown) {
      if (requestId === readinessRequest.current) {
        setReadiness(null)
        setReadinessError(typeof e === 'string' ? e : (e instanceof Error ? e.message : String(e)))
      }
    } finally {
      if (requestId === readinessRequest.current) setReadinessBusy(false)
    }
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => void refreshReadiness(), 250)
    return () => window.clearTimeout(timer)
  }, [refreshReadiness, backend, cloudContextOptIn, ollamaModel, auth, apiKeyPresent])
  const ask = async () => {
    if (!tick) return
    setBusy(true); setError(null); setAdvice(null)
    try {
      const a = await invoke<Advice>('request_advice', { tick })
      setAdvice(a)
      if (!a.cached) onUsageChanged?.()
    } catch (e: unknown) {
      setError(typeof e === 'string' ? e : (e instanceof Error ? e.message : String(e)))
    } finally { setBusy(false) }
  }
  const speakAdvice = () => {
    if (!advice) return
    // Go through speak_event so a user-supplied advice/ WAV pool is used when present.
    void invoke('speak_event', { event: 'advice', fallback: advice.text, voice: voice || null, rate }).catch(() => {})
  }
  const backendLabel: Record<MasterBackend, string> = {
    auto: cloudContextOptIn ? 'อัตโนมัติ (Claude → Ollama)' : 'อัตโนมัติ (Ollama local · cloud ปิด)',
    claude: 'Claude CLI (Plan quota)',
    ollama: `Ollama local${ollamaModel ? ` (${ollamaModel})` : ''}`,
  }
  return (
    <Card title="G-Master (advisor)">
      <Row label="เปิดใช้งาน G-Master"><Toggle on={enabled} onChange={onEnabledChange} /></Row>
      <Row label="Backend">
        <div style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 9, overflow: 'hidden' }}>
          {(['auto','claude','ollama'] as MasterBackend[]).map((b) => (
            <button key={b} onClick={() => onBackendChange(b)}
              style={{ background: backend === b ? 'rgba(143,212,255,0.16)' : 'transparent', color: backend === b ? C.ice : C.mut, border: 'none', padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
              {b === 'auto' ? 'Auto' : b === 'claude' ? 'Claude' : 'Ollama'}
            </button>
          ))}
        </div>
      </Row>
      <Row label="อนุญาตบริบท own-stat ไปยัง Claude">
        <Toggle on={cloudContextOptIn} onChange={onCloudContextOptInChange} />
      </Row>
      <div style={{ margin: '-2px 0 10px', fontSize: 11.5, lineHeight: 1.5, color: C.mut }}>
        ปิดไว้เป็นค่าเริ่มต้น · เมื่อเปิด จะส่งเฉพาะช่วงเกม ฮีโร่/เลเวล/KDA/net worth/gold/HP%/mana% และคะแนนทีม. การเลือก Backend, API key หรือกดขอคำแนะนำไม่ถือเป็นการยินยอม. CV, enemy identity, items, clock, burst, G-Log, Memory, เสียง และข้อความพูดคงอยู่ในเครื่อง.
      </div>
      {usesClaude && (
        <Row label="Login / Auth (Claude)">
          <select value={auth} onChange={(e) => onAuthChange(e.target.value as 'plan' | 'apikey')}
            style={{ background: 'rgba(18,20,28,0.86)', color: C.txt, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5 }}>
            <option value="plan">Plan — claude CLI (ล็อกอินอัตโนมัติ)</option>
            <option value="apikey">API key — Anthropic</option>
          </select>
        </Row>
      )}
      {usesClaude && auth === 'apikey' && (
        <Row label="Anthropic API key">
          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)}
              placeholder={apiKeyPresent ? '•••••• บันทึกไว้แล้ว — พิมพ์เพื่อแทนที่' : 'sk-ant-…'} autoComplete="off"
              style={{ background: 'rgba(18,20,28,0.86)', color: C.txt, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5, width: 260 }} />
            <button onClick={() => { const k = keyDraft.trim(); if (k) { onApiKeySave(k); setKeyDraft('') } }} disabled={!keyDraft.trim()}
              style={{ background: keyDraft.trim() ? 'rgba(143,212,255,0.16)' : 'transparent', color: keyDraft.trim() ? C.ice : C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: keyDraft.trim() ? 'pointer' : 'default' }}>บันทึก</button>
            {apiKeyPresent && (
              <button onClick={() => { onApiKeySave(''); setKeyDraft('') }}
                style={{ background: 'transparent', color: C.bad, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>ลบคีย์</button>
            )}
          </div>
        </Row>
      )}
      {(backend === 'ollama' || backend === 'auto') && (
        <Row label="Ollama model">
          <input value={ollamaModel} onChange={(e) => onOllamaModelChange(e.target.value)}
            placeholder="qwen3.5:4b"
            style={{ background: 'rgba(18,20,28,0.86)', color: C.txt, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5, width: 220 }} />
        </Row>
      )}
      <div style={{ marginTop: 9, padding: '10px 12px', background: 'rgba(255,255,255,0.025)', border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 11.5, lineHeight: 1.55 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
          <strong style={{ color: C.txt }}>ความพร้อม Backend</strong>
          <button onClick={() => void refreshReadiness()} disabled={readinessBusy}
            style={{ background: 'transparent', color: readinessBusy ? C.mut : C.ice, border: `1px solid ${C.line}`, borderRadius: 7, padding: '4px 9px', fontSize: 11, cursor: readinessBusy ? 'wait' : 'pointer' }}>
            {readinessBusy ? 'กำลังตรวจ…' : 'ตรวจใหม่'}
          </button>
        </div>
        {readinessError ? (
          <div style={{ color: C.warn }}>สถานะยังไม่ทราบ: {readinessError}</div>
        ) : readiness ? (
          <>
            <div style={{ color: readiness.ollama.state === 'available' ? C.ok : C.warn }}>
              Ollama {readiness.ollama.model || '(ชื่อ model ไม่ถูกต้อง)'}: {
                readiness.ollama.state === 'available' ? 'พบ model ในเครื่อง; ยังไม่ได้ทดสอบการสร้างคำตอบ' :
                readiness.ollama.state === 'missing-model' ? 'ยังไม่ติดตั้ง model ที่เลือก' :
                readiness.ollama.state === 'invalid-model' ? 'ชื่อ model ใช้ไม่ได้' : 'ติดต่อ Ollama ในเครื่องไม่ได้'
              }
            </div>
            {readiness.ollama.detail && <div style={{ color: C.mut }}>{readiness.ollama.detail}</div>}
            <div style={{ color: C.mut }}>
              Claude CLI: {readiness.claudeCli.executableDetected ? 'พบโปรแกรม; ยังไม่ยืนยัน login/quota' : 'ไม่พบใน PATH'} · Anthropic API: {readiness.anthropicApi.apiKeySaved ? 'บันทึก key แล้ว; ยังไม่ยืนยัน key/network' : 'ยังไม่บันทึก key'}
            </div>
            <div style={{ color: C.mut }}>
              เส้นทางปัจจุบัน: {readiness.route === 'local-only' ? 'ใช้ Ollama ในเครื่อง' : readiness.route === 'cloud-only' ? 'ใช้ Claude หลัง opt-in' : readiness.route === 'cloud-then-local' ? 'Claude แล้วใช้ Ollama ภายในเวลาที่เหลือ' : 'Claude ถูกปิดกั้นเพราะยังไม่เปิด opt-in'}.
              {' '}ตรวจ Ollama ≤{readiness.ollama.probeTimeoutMs / 1000}s; Ollama ≤{readiness.ollamaRequestTimeoutMs / 1000}s; Auto ทั้งคำขอ ≤{readiness.maxAdviceRequestTimeoutMs / 1000}s (ช่วง Claude ≤{readiness.autoClaudeAttemptTimeoutMs / 1000}s).
            </div>
            <div style={{ color: C.mut }}>{readiness.costNote}</div>
            {readiness.deterministicLocalFallback && <div style={{ color: C.ok }}>G-Signal alerts และคำแนะนำ buyback แบบ deterministic ทำงานในเครื่องแยกจาก G-Master</div>}
          </>
        ) : <div style={{ color: C.mut }}>กำลังรอผลตรวจ backend</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, gap: 12 }}>
        <div style={{ fontSize: 12, color: C.mut }}>
          {backendLabel[backend]} · throttle 30s/คำขอ.
          {!canAsk && tick?.in_game === false && ' · เปิด Dota 2 ก่อน'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none', fontSize: 12, color: C.mut }}>
          พูดอัตโนมัติเมื่อเลเวล 6/12/18/25 หรือตาย 2 รอบติด
          <Toggle on={autoAdvice} onChange={onAutoAdviceChange} />
        </div>
        <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
          <button onClick={ask} disabled={!canAsk}
            style={{ background: canAsk ? 'rgba(143,212,255,0.18)' : 'rgba(255,255,255,0.06)', color: canAsk ? C.ice : C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '7px 15px', fontSize: 12.5, fontWeight: 600, cursor: canAsk ? 'pointer' : 'not-allowed' }}>
            {busy ? 'กำลังคิด…' : 'ขอคำแนะนำ'}
          </button>
          {advice && (
            <button onClick={speakAdvice}
              style={{ background: 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '7px 13px', fontSize: 12.5, cursor: 'pointer' }}>
              🔊 อ่าน
            </button>
          )}
        </div>
      </div>
      {advice && (
        <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(143,212,255,0.06)', border: `1px solid ${C.line}`, borderRadius: 10, lineHeight: 1.55, fontSize: 13.5 }}>
          {advice.text}
          {(advice.backend || advice.cached) && <div style={{ fontSize: 11, color: C.mut, marginTop: 6 }}>
            {advice.backend && `· ตอบโดย ${advice.backend === 'ollama' ? 'Ollama' : 'Claude'}`}
            {advice.elapsed_ms !== undefined && ` · ใช้เวลา ${(advice.elapsed_ms / 1000).toFixed(1)}s`}
            {advice.cached && ` · คำตอบแคช${advice.cached_age_ms !== undefined && advice.cached_age_ms !== null ? ` อายุ ${(advice.cached_age_ms / 1000).toFixed(1)}s` : ''}`}
          </div>}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 12, padding: '10px 13px', background: 'rgba(255,123,133,0.10)', border: '1px solid rgba(255,123,133,0.35)', borderRadius: 10, color: '#ffd6da', fontSize: 12.5 }}>
          {error}
          <div style={{ marginTop: 5, color: C.mut }}>G-Signal alerts และ buyback แบบ deterministic ยังทำงานในเครื่องตามข้อมูลและการตั้งค่าของโมดูล</div>
        </div>
      )}
    </Card>
  )
}
