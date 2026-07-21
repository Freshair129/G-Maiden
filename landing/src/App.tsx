import { useEffect, useId, useRef, useState } from 'react'
import {
  ArrowUpRight,
  BrainCircuit,
  Crown,
  Fingerprint,
  HardDrive,
  LoaderCircle,
  LogOut,
  Radio,
  ScanLine,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useBetaEnrollment } from './beta'
import { useGmadAccess } from './gmad'
import HeroCharacter3D from './HeroCharacter3D'
import OpsPage from './OpsPage'

const NAV_ITEMS = [
  { label: 'ฟีเจอร์', href: '#features' },
  {
    label: 'วิธีทำงาน',
    href: 'https://github.com/Freshair129/G-Maiden/blob/main/docs/architecture/technical-design-document.md',
    external: true,
  },
  {
    label: 'ความเป็นส่วนตัว',
    href: 'https://github.com/Freshair129/G-Maiden/blob/main/docs/product/software-requirements-specification.md',
    external: true,
  },
  { label: 'คำถามที่พบบ่อย', href: 'https://github.com/Freshair129/G-Maiden/issues', external: true },
]

const METRICS = [
  { value: '≤300MS', label: 'เป้าหมายสัญญาณ', signal: true },
  { value: '≤2.5%', label: 'งบ CPU เบื้องหลัง' },
  { value: 'LOCAL', label: 'ข้อมูลดิบของแมตช์' },
]

const FEATURES = [
  {
    number: '01',
    name: 'G-SENTRY + G-MOTION',
    icon: ScanLine,
    description: 'ติดตามฮีโร่ศัตรูที่หายจากวิสัยทัศน์ และเตือนเมื่อหายจากตำแหน่งล่าสุดนานผิดปกติ',
    proof: 'อิง last-seen และสัญญาณที่ตรวจพบในเครื่อง',
    diagnostic: (
      <div className="diagnostic-list" aria-label="ตัวอย่างเวลาที่ศัตรูหายจากวิสัยทัศน์">
        <div><span>ศัตรูหายจากจอ</span><strong>00:08</strong></div>
        <div><span>ตำแหน่งล่าสุด</span><strong>เลนกลาง</strong></div>
        <div><span>สถานะ</span><strong className="text-signal">กำลังติดตาม</strong></div>
      </div>
    ),
  },
  {
    number: '02',
    name: 'G-SIGNAL',
    icon: Radio,
    description: 'เตือนด้วยเสียงเมื่อสัญญาณความเสี่ยงถึงระดับที่ตั้งไว้ พร้อมแก้คำแนะนำเมื่อสถานการณ์เปลี่ยน',
    proof: 'เป้าหมาย p50 ≤250ms · เพดาน 300ms',
    diagnostic: (
      <div className="signal-threshold" aria-label="ตัวอย่างระดับการแจ้งเตือน">
        <div className="diagnostic-kicker">ระดับแจ้งเตือน · ปรับได้</div>
        <div className="threshold-track"><span /></div>
        <div className="threshold-labels"><span>LOW</span><strong>MED</strong><span>HIGH</span></div>
      </div>
    ),
  },
  {
    number: '03',
    name: 'G-MASTER',
    icon: BrainCircuit,
    description: 'ช่วยทบทวนจังหวะเล่นและไอเทมจากบริบทของแมตช์ โดยไม่ตัดสินใจหรือเล่นแทนคุณ',
    proof: 'Claude / Anthropic · Ollama สำรองเมื่อออฟไลน์',
    diagnostic: (
      <div className="advice-context" aria-label="ตัวอย่างบริบทคำแนะนำ">
        <span>บริบทล่าสุด</span>
        <strong>ศัตรูหลักมีเวทระเบิดสูง</strong>
        <p>ลองตรวจไอเทมป้องกันก่อนเข้าทีมไฟต์</p>
      </div>
    ),
  },
  {
    number: '04',
    name: 'G-SENSORY + G-LOG',
    icon: HardDrive,
    description: 'Overlay โปร่งใสช่วยเก็บรายละเอียดสำคัญ โดยบันทึกข้อมูลดิบของแมตช์ไว้ในเครื่องเป็นหลัก',
    proof: 'งบ CPU ≤2.5% · RAM ≤400MB · raw match/CV local-only',
    diagnostic: (
      <div className="local-diagnostic" aria-label="สถานะข้อมูลภายในเครื่อง">
        <div><span className="status-dot" />LOCAL SESSION</div>
        <div className="local-bars"><span /><span /><span /><span /><span /><span /><span /></div>
        <strong>ไม่มี raw match data ออกจากเครื่อง</strong>
      </div>
    ),
  },
]

const PRIMARY_URL =
  'https://github.com/Freshair129/G-Maiden/blob/main/docs/architecture/technical-design-document.md'

const OPEN_BETA_AT = new Date('2026-07-24T18:00:00+07:00').getTime()

function getOpenBetaCountdown(now: number) {
  const remaining = Math.max(0, OPEN_BETA_AT - now)
  const totalSeconds = Math.floor(remaining / 1000)

  return {
    isOpen: remaining === 0,
    totalHours: Math.floor(totalSeconds / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  }
}

function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const beta = useBetaEnrollment()
  const gmad = useGmadAccess()
  const [queueGid, setQueueGid] = useState('')
  const [openBetaCountdown, setOpenBetaCountdown] = useState(() => getOpenBetaCountdown(Date.now()))

  const betaBusy = beta.status === 'loading' || beta.status === 'enrolling'
  const betaLabel = beta.gid
    ? beta.gid
    : betaBusy
      ? 'กำลังเชื่อมต่อ'
      : 'ลงทะเบียน Closed Beta'

  useEffect(() => {
    const timer = window.setInterval(() => setOpenBetaCountdown(getOpenBetaCountdown(Date.now())), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!menuOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }

    window.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  return (
    <main className="bg-void text-white">
      <div id="hero" className="relative min-h-[100svh] overflow-hidden">
      <div className="hero-art-stage absolute inset-0" aria-hidden="true">
        <HeroCharacter3D />
        <div className="hero-depth-haze absolute inset-0" />
        <div className="hero-particles absolute inset-0" />
      </div>

      <div className="hero-scrim absolute inset-0" aria-hidden="true" />

      <header className="absolute inset-x-0 top-0 z-40 flex items-center justify-between px-6 py-5 sm:px-10 lg:px-16 lg:py-7">
        <a
          href="#hero"
          className="font-podium text-2xl font-bold uppercase tracking-wider text-white transition-colors hover:text-ice focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice sm:text-3xl"
        >
          G-Maiden
        </a>

        <nav className="hidden items-center gap-8 md:flex lg:gap-12" aria-label="เมนูหลัก">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noreferrer' : undefined}
              className="font-inter text-sm uppercase tracking-widest text-white/80 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <button
          type="button"
          disabled={betaBusy}
          onClick={() => void beta.register()}
          className="group hidden min-h-11 items-center gap-3 border border-white/30 px-6 py-3 font-inter text-xs uppercase tracking-widest transition-colors hover:border-white/60 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice disabled:cursor-wait disabled:opacity-60 md:flex"
        >
          {betaLabel}
          {betaBusy ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          )}
        </button>

        <button
          ref={menuButtonRef}
          type="button"
          className="flex min-h-11 min-w-11 flex-col items-end justify-center space-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice md:hidden"
          aria-label="เปิดเมนูนำทาง"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen(true)}
        >
          <span className="h-0.5 w-6 bg-white" />
          <span className="h-0.5 w-6 bg-white" />
          <span className="h-0.5 w-4 bg-white" />
        </button>
      </header>

      <div
        id={menuId}
        className={`fixed inset-0 z-50 bg-black/95 backdrop-blur-sm transition-all duration-500 md:hidden ${
          menuOpen ? 'visible opacity-100' : 'invisible opacity-0'
        }`}
        aria-hidden={!menuOpen}
      >
        <div className="flex items-center justify-between px-6 py-5 sm:px-10">
          <a
            href="#hero"
            className="font-podium text-2xl font-bold uppercase tracking-wider text-white sm:text-3xl"
            onClick={closeMenu}
          >
            G-Maiden
          </a>
          <button
            type="button"
            className="flex min-h-11 min-w-11 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice"
            aria-label="ปิดเมนูนำทาง"
            onClick={() => {
              closeMenu()
              menuButtonRef.current?.focus()
            }}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <nav className="flex h-[calc(100svh-84px)] flex-col items-center justify-center gap-5 px-6" aria-label="เมนูบนมือถือ">
          {NAV_ITEMS.map((item, index) => (
            <a
              key={item.label}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noreferrer' : undefined}
              className={`thai-display text-4xl tracking-tight text-white transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice sm:text-5xl ${
                menuOpen ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'
              }`}
              style={{ transitionDelay: `${index * 80 + 100}ms` }}
              onClick={closeMenu}
            >
              {item.label}
            </a>
          ))}

          <button
            type="button"
            disabled={betaBusy}
            className={`group mt-5 flex min-h-12 items-center gap-3 border border-white/30 px-7 py-3 font-inter text-xs uppercase tracking-widest transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice disabled:cursor-wait disabled:opacity-60 ${
              menuOpen ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'
            }`}
            style={{ transitionDelay: `${NAV_ITEMS.length * 80 + 100}ms` }}
            onClick={() => {
              closeMenu()
              void beta.register()
            }}
          >
            {betaLabel}
            {betaBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
          </button>
        </nav>
      </div>

      <section className="hero-section relative z-20 flex min-h-[100svh] items-center px-6 pb-5 pt-24 sm:px-10 sm:pb-8 lg:px-16 lg:pb-10 lg:pt-28">
        <div className="hero-content w-full max-w-[46rem]">
          <div className="animate-fade-up mb-5 flex items-center gap-3 sm:mb-6 lg:mb-7">
            <Crown className="h-4 w-4 shrink-0 text-ice-bright/80" strokeWidth={1.75} />
            <p className="font-inter text-[10px] font-medium uppercase tracking-[0.23em] text-white/70 sm:text-sm sm:tracking-[0.3em]">
              AI Companion แบบเรียลไทม์สำหรับ Dota 2
            </p>
          </div>

          <h1 className="animate-fade-up-delay-1 thai-display tracking-tight text-white">
            <span className="block">โฟกัสกับเกม</span>
            <span className="block">ให้ Maiden</span>
            <span className="block">คอยระวังหลัง</span>
          </h1>

          <p className="animate-fade-up-delay-2 mt-5 max-w-md font-inter text-sm leading-relaxed text-white/70 sm:mt-6 sm:text-base lg:mt-7">
            Maiden คอยเก็บสัญญาณที่อาจหลุดสายตาระหว่างไฟต์ แจ้งเตือนด้วยเสียง
            <br className="hidden sm:block" /> และช่วยให้คุณจดจ่อกับ{' '}
            <strong className="font-semibold text-white">การเล่นตรงหน้า</strong>
          </p>

          <div className="animate-fade-up-delay-3 mt-6 flex flex-wrap items-center gap-3 sm:mt-8 sm:gap-4">
            <button
              type="button"
              disabled={betaBusy}
              onClick={() => void beta.register()}
              className="group flex min-h-11 items-center gap-3 bg-action px-5 py-3 font-inter text-[11px] font-semibold uppercase tracking-widest text-white transition-colors hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:cursor-wait disabled:opacity-70 sm:min-h-12 sm:px-7 sm:py-4 sm:text-xs"
            >
              {beta.gid ? `ลงทะเบียนแล้ว · ${beta.gid}` : betaBusy ? 'กำลังออก GID' : 'รับ GID สำหรับ Closed Beta'}
              {betaBusy ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Fingerprint className="h-4 w-4 transition-transform group-hover:scale-110" />
              )}
            </button>

            <a
              href={PRIMARY_URL}
              target="_blank"
              rel="noreferrer"
              className="secondary-cta group flex min-h-11 items-center gap-3 border border-white/25 px-5 py-3 font-inter text-[11px] font-semibold uppercase tracking-widest text-white/80 transition-colors hover:border-white/50 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice sm:min-h-12 sm:px-6 sm:py-4 sm:text-xs"
            >
              ดูการทำงาน
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          </div>

          <div className="animate-fade-up-delay-4 mt-4 min-h-5" aria-live="polite">
            {beta.gid && (
              <div className="beta-confirmation flex max-w-md items-center gap-3 border-l-2 border-signal bg-black/35 px-3 py-2.5 backdrop-blur-sm">
                <ShieldCheck className="h-5 w-5 shrink-0 text-signal" />
                <p className="font-inter text-[10px] uppercase leading-relaxed tracking-wider text-white/75 sm:text-xs">
                  GID เดียวกับ G-Maiden · {beta.email}
                  <span className="block text-white/45">เข้าสู่ระบบในแอปด้วย Google บัญชีเดียวกัน</span>
                </p>
                <button
                  type="button"
                  onClick={() => void beta.signOut()}
                  className="ml-auto flex min-h-11 min-w-11 items-center justify-center text-white/45 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice"
                  aria-label="ออกจากระบบ"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
            {beta.error && <p className="max-w-md font-inter text-xs text-red-300" role="alert">{beta.error}</p>}
          </div>

          <dl className="animate-fade-up-delay-4 mt-5 flex flex-wrap gap-x-5 gap-y-4 sm:mt-7 sm:gap-x-10 lg:mt-8 lg:gap-x-14">
            {METRICS.map((metric) => (
              <div key={metric.label} className="relative min-w-[5.75rem] sm:min-w-[7.5rem]">
                <dt className="flex items-center gap-2 font-inter text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
                  {metric.signal && <span className="h-2.5 w-2.5 rounded-full bg-signal" aria-hidden="true" />}
                  {metric.value}
                </dt>
                <dd className="mt-1 font-inter text-[9px] font-medium uppercase tracking-widest text-white/50 sm:text-[11px]">
                  {metric.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <aside className="open-beta-countdown animate-fade-up-delay-3 absolute bottom-8 left-6 right-6 z-30 overflow-hidden bg-[radial-gradient(ellipse_at_center,rgba(65,160,255,0.22),rgba(3,6,11,0.1)_68%)] px-6 py-6 sm:bottom-10 sm:left-10 sm:right-10 lg:bottom-auto lg:left-auto lg:right-12 lg:top-1/2 lg:w-[min(38vw,36rem)] lg:-translate-y-1/2 lg:px-9 lg:py-9" aria-live="polite">
        <i className="absolute left-0 top-0 h-14 w-14 border-l-2 border-t-2 border-ice-bright shadow-[-0.4rem_-0.4rem_1.5rem_rgba(143,212,255,0.4)]" aria-hidden="true" />
        <i className="absolute right-0 top-0 h-14 w-14 border-r-2 border-t-2 border-ice-bright shadow-[0.4rem_-0.4rem_1.5rem_rgba(143,212,255,0.4)]" aria-hidden="true" />
        <i className="absolute bottom-0 left-0 h-14 w-14 border-b-2 border-l-2 border-ice-bright" aria-hidden="true" />
        <i className="absolute bottom-0 right-0 h-14 w-14 border-b-2 border-r-2 border-ice-bright" aria-hidden="true" />
        <i className="absolute left-12 right-12 top-0 h-px bg-gradient-to-r from-transparent via-ice-bright to-transparent shadow-[0_0_1rem_rgba(143,212,255,1)]" aria-hidden="true" />
        <i className="absolute -left-1/4 top-1/2 h-px w-[150%] -rotate-12 bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-60" aria-hidden="true" />
        <div className="relative">
          {openBetaCountdown.isOpen ? (
            <p className="font-inter text-xl font-bold uppercase tracking-[0.2em] text-white sm:text-2xl">Open Beta เปิดแล้ว</p>
          ) : (
            <>
              <p className="font-inter text-xs font-bold uppercase tracking-[0.25em] text-ice-bright">Open Beta // 24 กรกฎาคม · 18:00 น.</p>
              <p className="mt-3 flex items-baseline justify-between font-inter text-5xl font-black leading-none tracking-[0.04em] text-white [text-shadow:0_0_1.5rem_rgba(143,212,255,0.85)] sm:text-6xl lg:text-7xl">
                <span>{String(openBetaCountdown.totalHours).padStart(3, '0')}</span><span className="animate-pulse text-ice-bright">:</span><span>{String(openBetaCountdown.minutes).padStart(2, '0')}</span><span className="animate-pulse text-ice-bright">:</span><span>{String(openBetaCountdown.seconds).padStart(2, '0')}</span>
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-ice-bright/60 pt-3 font-inter text-[9px] font-semibold uppercase tracking-[0.22em] text-white/70">
                <span>Time to launch</span><span className="flex items-center gap-2 text-ice-bright"><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-ice-bright shadow-[0_0_0.65rem_rgba(143,212,255,1)]" />Live clock</span>
              </div>
            </>
          )}
        </div>
      </aside>
      </div>

      <section id="gmad" className="gmad-section" aria-labelledby="gmad-title">
        <div className="gmad-shell">
          <div>
            <p className="features-kicker"><span aria-hidden="true">//</span> GMAD BETA ACCESS</p>
            <h2 id="gmad-title" className="thai-display">เช็กคิวดาวน์โหลด G‑Maiden Closed Beta</h2>
            <p>กรอก GID ของคุณเพื่อตรวจสถานะคิว เมื่อถึงรอบ ระบบจะยืนยัน Google account เดียวกันอีกครั้งก่อนออกลิงก์ดาวน์โหลดชั่วคราว</p>
          </div>
          <form className="gmad-card" onSubmit={(event) => { event.preventDefault(); void gmad.check(queueGid) }}>
            <label htmlFor="gmad-gid">GID</label>
            <div className="gmad-input-row"><input id="gmad-gid" value={queueGid} onChange={(event) => setQueueGid(event.target.value)} placeholder={beta.gid || 'G-B…'} autoCapitalize="characters" /><button type="submit" disabled={gmad.state === 'checking'}>{gmad.state === 'checking' ? 'กำลังเช็ก' : 'เช็กคิว'}</button></div>
            {beta.gid && <button className="gmad-use-own" type="button" onClick={() => setQueueGid(beta.gid)}>ใช้ GID ของฉัน · {beta.gid}</button>}
            {gmad.state === 'available' && <div className="gmad-result available"><strong>ถึงคิวดาวน์โหลดแล้ว</strong><span>{gmad.batchLabel}</span><label><input type="checkbox" checked={gmad.termsAccepted} onChange={(event) => gmad.setTermsAccepted(event.target.checked)} /> ฉันยอมรับ Closed Beta Terms of Use และรับทราบ Privacy Notice</label><a href="/terms" target="_blank" rel="noreferrer">อ่าน Closed Beta Terms</a><a href="/privacy" target="_blank" rel="noreferrer">อ่าน Privacy Notice</a><button type="button" onClick={() => void gmad.download(queueGid)}>ดาวน์โหลด GMAD</button></div>}
            {gmad.state === 'waiting' && <div className="gmad-result"><strong>ยังไม่ถึงคิวดาวน์โหลด</strong><span>GID ของคุณลงทะเบียนเรียบร้อยแล้ว เราจะแจ้งเมื่อ batch เปิด</span></div>}
            {gmad.state === 'paused' && <div className="gmad-result"><strong>Batch ถูกพักชั่วคราว</strong><span>{gmad.batchLabel}</span></div>}
            {gmad.state === 'signed_out' && <div className="gmad-result"><strong>กรุณาเข้าสู่ระบบ Google ก่อน</strong><button type="button" onClick={() => void beta.register()}>เข้าสู่ระบบ</button></div>}
            {gmad.state === 'not_registered' || gmad.state === 'revoked' ? <div className="gmad-result"><strong>ยังไม่มีสิทธิ์ดาวน์โหลดในขณะนี้</strong></div> : null}
            {gmad.error && <p className="gmad-error" role="alert">{gmad.error}</p>}
          </form>
        </div>
      </section>

      <section id="features" className="features-section" aria-labelledby="features-title">
        <div className="features-shell">
          <div className="features-intro">
            <p className="features-kicker"><span aria-hidden="true">//</span> WATCH YOUR BACK</p>
            <h2 id="features-title" className="thai-display">บัดดี้ที่คอยระวังหลังให้คุณ</h2>
            <p>
              ระหว่างที่คุณโฟกัสกับไฟต์ Maiden ช่วยติดตามสัญญาณจากเกมและเตือนสิ่งที่อาจพลาดไป
              <strong> โดยไม่เล่นแทนคุณ</strong>
            </p>
          </div>

          <div className="feature-rails">
            {FEATURES.map((feature) => {
              const Icon = feature.icon
              return (
                <article key={feature.number} className="feature-rail">
                  <div className="feature-index" aria-hidden="true">
                    <span>{feature.number}</span><i />
                  </div>
                  <div className="feature-copy">
                    <div className="feature-name"><Icon aria-hidden="true" /><h3>{feature.name}</h3></div>
                    <p>{feature.description}</p>
                    <small>{feature.proof}</small>
                  </div>
                  <div className="feature-diagnostic">{feature.diagnostic}</div>
                  <span className="feature-online"><i /> พร้อมทำงาน</span>
                </article>
              )
            })}
          </div>

          <div className="privacy-rail">
            <ShieldCheck aria-hidden="true" />
            <p><strong>ข้อมูลดิบอยู่กับคุณ</strong> — Landing เก็บเฉพาะสถานะบัญชี Closed Beta และ GID ส่วนข้อมูลแมตช์, CV และ G-Log ยังคงอยู่ในเครื่อง</p>
          </div>
        </div>
      </section>
    </main>
  )
}

function App() {
  if (window.location.pathname === '/ops') return <OpsPage />
  if (window.location.pathname === '/terms') return <LegalPage title="G-Maiden Closed Beta Terms of Use" document="closed-beta-terms-of-use-draft.md" />
  if (window.location.pathname === '/privacy') return <LegalPage title="G-Maiden Closed Beta Privacy Notice" document="closed-beta-privacy-notice-draft.md" />
  return <LandingPage />
}

function LegalPage({ title, document }: { title: string; document: string }) {
  const url = `https://github.com/Freshair129/G-Maiden/blob/main/docs/product/${document}`
  return <main className="ops-page"><section className="ops-shell"><p className="ops-kicker">G-MAIDEN CLOSED BETA</p><h1 className="thai-display">{title}</h1><p>Version 0.2.0-beta · Effective 2026-07-21 18:30:56 ICT</p><p>Data controller: G-Maiden · Contact: gmad.support01@gmail.com</p><p>Terms acceptance is required for GMAD download. Optional product, marketing, and post-match consents remain separate and are not required for access.</p><a className="ops-primary" href={url} target="_blank" rel="noreferrer">Read the approved document on GitHub</a><p><a href="/">Return to G-Maiden landing</a></p></section></main>
}

export default App
