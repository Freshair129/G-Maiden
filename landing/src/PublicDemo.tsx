import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Captions,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useBetaEnrollment } from './beta'
import './public-demo.css'

type FeatureState = 'Shipped' | 'Partial' | 'Preview' | 'Planned'

type DemoBeat = {
  at: number
  eyebrow: string
  title: string
  detail: string
  missing: number
  danger: number
  signal: 'Watching' | 'Elevated' | 'Interrupt'
  transcript: string
  revision?: string
}

const DURATION = 36
const TICK_MS = 100

const BEATS: DemoBeat[] = [
  {
    at: 0,
    eyebrow: '00:00 · Baseline',
    title: 'เลนกลางยังอยู่ในวิสัยทัศน์',
    detail: 'G-Sentry เริ่มจากข้อมูลสังเคราะห์ชุดเดิมทุกครั้ง เพื่อให้การสาธิตตรวจซ้ำได้',
    missing: 0,
    danger: 12,
    signal: 'Watching',
    transcript: 'สถานการณ์ปกติ กำลังติดตามตำแหน่งศัตรู',
  },
  {
    at: 7,
    eyebrow: '00:07 · Missing',
    title: 'ศัตรูหายจากเลนกลาง',
    detail: 'ระบบเริ่มจับ missing duration โดยไม่อ้างว่ารู้ตำแหน่งที่มองไม่เห็น',
    missing: 7,
    danger: 35,
    signal: 'Watching',
    transcript: 'มิดหายเจ็ดวินาที ยังไม่ต้องเปลี่ยนแผน',
  },
  {
    at: 15,
    eyebrow: '00:15 · Risk rising',
    title: 'เส้นทางเข้าหาเลนล่างเป็นไปได้',
    detail: 'Danger score เพิ่มจากเวลา ระยะ และบริบทจำลอง ไม่ใช่ข้อมูลแมตช์สด',
    missing: 15,
    danger: 68,
    signal: 'Elevated',
    transcript: 'ความเสี่ยงเพิ่มขึ้น เตรียมถอยจากแนวแม่น้ำ',
  },
  {
    at: 23,
    eyebrow: '00:23 · G-Signal',
    title: 'แจ้งเตือนก่อนจังหวะปะทะ',
    detail: 'เมื่อคะแนนผ่าน threshold ระบบส่ง interrupt สั้น ๆ พร้อมเหตุผลที่ตรวจสอบได้',
    missing: 23,
    danger: 91,
    signal: 'Interrupt',
    transcript: 'ถอยตอนนี้ มิดหายยี่สิบสามวินาทีและแนวแม่น้ำไม่มีวิสัยทัศน์',
  },
  {
    at: 30,
    eyebrow: '00:30 · Belief revision',
    title: 'ข้อมูลใหม่ลดระดับความเสี่ยง',
    detail: 'ศัตรูปรากฏอีกฝั่งของแผนที่ ระบบแก้คำแนะนำเดิมแทนการยืนยันผิด ๆ ต่อไป',
    missing: 0,
    danger: 18,
    signal: 'Watching',
    transcript: 'ยกเลิกคำเตือน พบมิดที่เลนบนแล้ว',
    revision: 'แก้ความเชื่อ: จาก “incoming gank” เป็น “ไม่มีภัยทันที” เพราะพบหลักฐานใหม่',
  },
]

const FEATURES: Array<{ state: FeatureState; name: string; detail: string }> = [
  { state: 'Shipped', name: 'Overlay baseline', detail: 'โครง overlay และ local-first runtime มีหลักฐานในผลิตภัณฑ์รุ่นปัจจุบัน' },
  { state: 'Partial', name: 'G-Sentry / G-Motion', detail: 'แสดง last-seen และสัญญาณบางส่วน แต่ยังไม่อ้างความแม่นยำระดับ production ทุกสถานการณ์' },
  { state: 'Preview', name: 'G-Signal voice', detail: 'หน้านี้ใช้ transcript และเสียงจำลองแบบ deterministic ไม่ใช่ voice runtime สด' },
  { state: 'Planned', name: 'G-Memory / G-Coach', detail: 'แสดงแนวคิด belief revision เท่านั้น ยังไม่ถือว่าเป็นฟีเจอร์ที่ส่งมอบแล้ว' },
]

function emitDemoEvent(name: string, detail: Record<string, string | number | boolean> = {}) {
  window.dispatchEvent(new CustomEvent('gmaiden:demo', { detail: { name, ...detail } }))
}

function getBeat(time: number) {
  return [...BEATS].reverse().find((beat) => time >= beat.at) ?? BEATS[0]
}

function formatTime(value: number) {
  return `00:${Math.floor(value).toString().padStart(2, '0')}`
}

export default function PublicDemo() {
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [captions, setCaptions] = useState(true)
  const startedRef = useRef(false)
  const beta = useBetaEnrollment()
  const beat = useMemo(() => getBeat(time), [time])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setTime((current) => {
        const next = Math.min(DURATION, current + TICK_MS / 1000)
        if (next >= DURATION) {
          setPlaying(false)
          emitDemoEvent('demo_complete', { duration: DURATION })
        }
        return next
      })
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [playing])

  const togglePlayback = () => {
    if (!startedRef.current) {
      startedRef.current = true
      emitDemoEvent('demo_start')
    }
    if (time >= DURATION) setTime(0)
    setPlaying((value) => !value)
  }

  const restart = () => {
    setPlaying(false)
    setTime(0)
    emitDemoEvent('demo_restart')
  }

  const jumpTo = (at: number) => {
    setTime(at)
    emitDemoEvent('demo_jump', { at })
  }

  const apply = async () => {
    emitDemoEvent('beta_cta_click', { completed_demo: time >= 30 })
    await beta.register()
  }

  return (
    <main className="public-demo-shell">
      <header className="public-demo-header">
        <a href="/" className="public-demo-back"><ArrowLeft size={16} /> กลับหน้าแรก</a>
        <div className="public-demo-brand">G-MAIDEN / PUBLIC DEMO</div>
        <div className="public-demo-safe"><ShieldCheck size={16} /> SYNTHETIC DATA</div>
      </header>

      <section className="public-demo-intro">
        <p className="public-demo-kicker">Incoming-gank scenario · deterministic playback</p>
        <h1>เข้าใจ G-Maiden ภายใน 60 วินาที โดยไม่ต้องติดตั้งอะไร</h1>
        <p>นี่คือสถานการณ์จำลองที่เล่นซ้ำได้ทุกครั้ง ไม่มีการอ่านหน้าจอ ไฟล์ หรือ Dota process ของคุณ โลกยังไม่พังเพราะหน้าเดโมหนึ่งหน้า ถือเป็นชัยชนะเล็ก ๆ</p>
      </section>

      <section className="public-demo-stage" aria-label="G-Maiden deterministic scenario">
        <div className="public-demo-map">
          <div className="lane lane-top" />
          <div className="lane lane-mid" />
          <div className="lane lane-bottom" />
          <div className="river" />
          <div className="hero hero-player"><span>YOU</span></div>
          <div className={`hero hero-enemy beat-${beat.signal.toLowerCase()}`} style={{ opacity: time < 7 || time >= 30 ? 1 : 0.12 }}><span>MID</span></div>
          <div className={`danger-cone danger-${beat.signal.toLowerCase()}`} />
          <div className="overlay-card">
            <span>ENEMY MISSING</span>
            <strong>{beat.missing.toString().padStart(2, '0')}s</strong>
          </div>
          <div className="danger-card">
            <span>DANGER SCORE</span>
            <strong>{beat.danger}</strong>
            <div><i style={{ width: `${beat.danger}%` }} /></div>
          </div>
          <div className={`signal-card signal-${beat.signal.toLowerCase()}`}>
            <span>G-SIGNAL</span>
            <strong>{beat.signal}</strong>
          </div>
        </div>

        <div className="public-demo-explainer" aria-live="polite">
          <p>{beat.eyebrow}</p>
          <h2>{beat.title}</h2>
          <div>{beat.detail}</div>
          {beat.revision ? <aside>{beat.revision}</aside> : null}
        </div>

        {captions ? (
          <div className="public-demo-captions" aria-live="polite">
            <Captions size={18} />
            <span>{muted ? '[เสียงปิด] ' : ''}{beat.transcript}</span>
          </div>
        ) : null}

        <div className="public-demo-controls">
          <button type="button" onClick={togglePlayback} aria-label={playing ? 'Pause demo' : 'Play demo'}>
            {playing ? <Pause /> : <Play />}
          </button>
          <button type="button" onClick={restart} aria-label="Restart demo"><RotateCcw /></button>
          <button type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <VolumeX /> : <Volume2 />}
          </button>
          <button type="button" onClick={() => setCaptions((value) => !value)} aria-pressed={captions}><Captions /></button>
          <div className="public-demo-timeline">
            <input
              aria-label="Demo timeline"
              type="range"
              min="0"
              max={DURATION}
              step="0.1"
              value={time}
              onChange={(event) => setTime(Number(event.target.value))}
            />
            <div><span>{formatTime(time)}</span><span>{formatTime(DURATION)}</span></div>
          </div>
        </div>

        <div className="public-demo-jumps" aria-label="Jump to event">
          {BEATS.map((item) => (
            <button key={item.at} type="button" onClick={() => jumpTo(item.at)} className={beat.at === item.at ? 'active' : ''}>
              {formatTime(item.at)} <span>{item.title}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="public-demo-status" aria-labelledby="feature-status-title">
        <p className="public-demo-kicker">Evidence, not marketing fog</p>
        <h2 id="feature-status-title">สถานะฟีเจอร์แบบไม่แอบเอา roadmap มาปลอมเป็นของที่ส่งแล้ว</h2>
        <div className="feature-state-grid">
          {FEATURES.map((feature) => (
            <article key={feature.name}>
              <span className={`feature-state state-${feature.state.toLowerCase()}`}>{feature.state}</span>
              <h3>{feature.name}</h3>
              <p>{feature.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-demo-privacy">
        <div>
          <p className="public-demo-kicker">Privacy boundary</p>
          <h2>เดโมนี้ไม่แตะข้อมูลในเครื่องคุณ</h2>
        </div>
        <ul>
          <li>ไม่มี screen capture, GSI connection หรือ microphone input</li>
          <li>ไม่มี client secret และไม่ส่ง raw match, credential หรือ device identifier</li>
          <li>analytics event เก็บเพียงจังหวะเริ่ม จบ กระโดด และกดสมัคร</li>
        </ul>
      </section>

      <section className="public-demo-cta" id="closed-beta">
        <p className="public-demo-kicker">Closed Beta</p>
        <h2>พร้อมทดสอบของจริงในขอบเขตที่ระบุชัดเจน</h2>
        <p>สมัครด้วย G-Maiden ID เดิม ระบบจะเก็บเฉพาะข้อมูลที่จำเป็นต่อการเข้าร่วม beta และแยก consent ด้านการตลาดออกจาก diagnostics</p>
        <button type="button" onClick={() => void apply()} disabled={beta.status === 'loading' || beta.status === 'enrolling'}>
          {beta.gid ? `สมัครแล้ว · ${beta.gid}` : beta.status === 'enrolling' ? 'กำลังสมัคร…' : 'สมัคร Closed Beta'}
          <ChevronRight size={18} />
        </button>
        {beta.error ? <div className="public-demo-error" role="alert">{beta.error}</div> : null}
      </section>
    </main>
  )
}
