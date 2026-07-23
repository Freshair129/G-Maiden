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
import HeroMedia25D from './HeroMedia25D'
import { useScrollNarrative } from './scrollNarrative'

const NAV_ITEMS: Array<{ label: string; href: string; external?: boolean }> = [
  { label: 'ปล่อยรอบถัดไป', href: '#roadmap' },
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
] 

const METRICS: Array<{ value: string; label: string; signal?: boolean }> = [
  { value: '≤300MS', label: 'เป้าหมายสัญญาณ', signal: true },
  { value: '≤2.5%', label: 'งบ CPU เบื้องหลัง' },
  { value: 'LOCAL', label: 'ข้อมูลดิบของแมตช์' },
]

const FEATURES = [
  {
    number: '01',
    name: 'G-SENTRY + G-MOTION',
    icon: ScanLine,
    description:
      'ติดตามฮีโร่ศัตรูที่หายจากวิสัยทัศน์ และเตือนเมื่อหายจากตำแหน่งล่าสุดนานผิดปกติ เพื่อช่วยเก็บสิ่งที่คุณอาจพลาดไประหว่างไฟต์',
    proof: 'อิงข้อมูล last-seen และสัญญาณที่ตรวจพบในเครื่อง',
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
    description:
      'เตือนด้วยเสียงเมื่อสัญญาณความเสี่ยงถึงระดับที่ตั้งไว้ พร้อมแก้คำแนะนำเมื่อสถานการณ์เปลี่ยน โดยไม่ดึงโฟกัสของคุณเกินจำเป็น',
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
    description:
      'ช่วยทบทวนจังหวะเล่น ไอเท็ม และบริบทของแมตช์แบบเป็นผู้ช่วยร่วมคิด ไม่ใช่ระบบที่เข้ามาเล่นแทนคุณ',
    proof: 'Claude / Anthropic · Ollama สำรองเมื่อออฟไลน์',
    diagnostic: (
      <div className="advice-context" aria-label="ตัวอย่างบริบทคำแนะนำ">
        <span>บริบทล่าสุด</span>
        <strong>ศัตรูหลักมีเวทระเบิดสูง</strong>
        <p>ลองตรวจไอเท็มป้องกันก่อนเข้าทีมไฟต์</p>
      </div>
    ),
  },
  {
    number: '04',
    name: 'G-SENSORY + G-LOG',
    icon: HardDrive,
    description:
      'Overlay โปร่งใสช่วยเก็บรายละเอียดสำคัญ โดยคงข้อมูลดิบของแมตช์ไว้ในเครื่องเป็นหลัก เพื่อลดความเสี่ยงด้านข้อมูลและไม่รบกวนการเล่น',
    proof: 'งบ CPU ≤2.5% · RAM ≤400MB · raw match/CV local-only',
    diagnostic: (
      <div className="local-diagnostic" aria-label="สถานะข้อมูลภายในเครื่อง">
        <div><span className="status-dot" />LOCAL SESSION</div>
        <div className="local-bars"><span /><span /><span /><span /><span /><span /><span /></div>
        <strong>ไม่มี raw match data ออกจากเครื่อง</strong>
      </div>
    ),
  },
] as const

const PRIMARY_URL =
  'https://github.com/Freshair129/G-Maiden/blob/main/docs/architecture/technical-design-document.md'

const ROADMAP_URL =
  'https://github.com/Freshair129/G-Maiden/blob/main/docs/product/roadmap.md'

const RELEASE_PATH = [
  {
    step: '01',
    title: 'เปิดบัญชี G-Maiden ID',
    body: 'เข้าสู่ระบบด้วย Google เพื่อรับ GID ซึ่งจะเป็นบัญชีเดียวกันสำหรับหน้าเว็บและตัวแอปในรอบปล่อยถัดไป',
    status: 'พร้อมใช้งานตอนนี้',
  },
  {
    step: '02',
    title: 'รอหน้าต่าง Open Beta',
    body: 'นับถอยหลังสู่ 24 กรกฎาคม เวลา 18:00 น. โดยหน้าเว็บจะใช้เป็นจุดประกาศช่องทางเข้าใช้งานและอัปเดตสถานะรอบปล่อยใหม่',
    status: 'กำลังนับถอยหลัง',
  },
  {
    step: '03',
    title: 'ใช้ GID เดียวกันในแอป',
    body: 'เมื่อ release surface ใหม่พร้อม คุณจะใช้ GID เดิมเพื่อไปต่อกับ desktop onboarding และการตั้งค่าภายใน G-Maiden',
    status: 'ขั้นถัดไปของ funnel',
  },
] as const

const PRODUCT_STATUS = [
  {
    label: 'SHIPPED',
    title: 'v0.13.0 พร้อมแล้ว',
    detail: 'Overlay รุ่นปัจจุบัน, บัญชี Google OAuth และ GID ใช้งานได้จริงแล้วในโปรดักต์',
  },
  {
    label: 'NOW',
    title: 'โฟกัสงานพร้อมปล่อย',
    detail: 'งานหน้าบ้านตอนนี้คือเก็บ voice/persona, ปิด NFR ที่ค้าง และจัด release surface ชุดใหม่ให้พร้อมใช้งานจริง',
  },
  {
    label: 'NEXT',
    title: 'เปิด Open Beta ด้วย funnel ใหม่',
    detail: 'หน้าเว็บจะพาผู้ใช้จาก GID ไปสู่การเข้าใช้ G-Maiden รอบถัดไปโดยไม่ย้อนกลับไปใช้คิวดาวน์โหลดเดิม',
  },
] as const

const DEMO_VIDEOS = [
  {
    title: 'Demo 01',
    description: 'ตัวอย่างจังหวะการใช้งานระหว่างเกมในมุมภาพรวม',
    src: '/assets/hero/hero-demo-desktop-01.mp4',
  },
  {
    title: 'Demo 02',
    description: 'ตัวอย่างมุมโฟกัสอีกชุดสำหรับดู flow การเตือนและการตัดสินใจ',
    src: '/assets/hero/hero-demo-mobile-02.mp4',
  },
] as const

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
  const landingRootRef = useScrollNarrative()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const beta = useBetaEnrollment()
  const [openBetaCountdown, setOpenBetaCountdown] = useState(() => getOpenBetaCountdown(Date.now()))

  const betaBusy = beta.status === 'loading' || beta.status === 'enrolling'
  const betaLabel = beta.gid
    ? beta.gid
    : betaBusy
      ? 'กำลังเชื่อมต่อ'
      : 'รับ GID'
  const heroPrimaryLabel = beta.gid
    ? `พร้อมแล้ว · ${beta.gid}`
    : betaBusy
      ? 'กำลังออก GID'
      : 'เปิดบัญชี G-Maiden ID'

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
    <main ref={landingRootRef} className="scroll-narrative bg-void text-white">
      <div id="hero" className="relative min-h-[100svh] overflow-hidden">
        <div className="hero-art-stage absolute inset-0" aria-hidden="true">
          <HeroMedia25D />
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

        <section className="hero-section relative z-20 px-6 pb-5 pt-24 sm:px-10 sm:pb-8 lg:px-16 lg:pb-10 lg:pt-28">
          <div className="hero-grid">
            <div className="hero-content w-full">
              <div className="animate-fade-up mb-5 flex items-center gap-3 sm:mb-6 lg:mb-7">
                <Crown className="h-4 w-4 shrink-0 text-ice-bright/80" strokeWidth={1.75} />
                <p className="font-inter text-[10px] font-medium uppercase tracking-[0.23em] text-white/70 sm:text-sm sm:tracking-[0.3em]">
                  AI Voice Companion &amp; Tactical Co-pilot
                </p>
              </div>

              <h1 className="animate-fade-up-delay-1 thai-display tracking-tight text-white">
                <span className="block">โฟกัสกับเกม</span>
                <span className="block">ให้ Maiden คอย</span>
                <span className="block">ระวังหลังให้คุณ</span>
              </h1>

              <p className="animate-fade-up-delay-2 mt-5 max-w-md font-inter text-sm leading-relaxed text-white/70 sm:mt-6 sm:text-base lg:mt-7">
                Maiden คอยเก็บสัญญาณที่อาจหลุดสายตาระหว่างไฟต์ แจ้งเตือนด้วยเสียง และช่วยให้คุณจดจ่อกับ
                <strong className="font-semibold text-white"> จังหวะตรงหน้า</strong> พร้อมปูบัญชีสำหรับ release รอบถัดไปไว้ล่วงหน้า
              </p>

              <div className="hero-actions animate-fade-up-delay-3 mt-6 flex flex-wrap items-center gap-3 sm:mt-8 sm:gap-4">
                <button
                  type="button"
                  disabled={betaBusy}
                  onClick={() => void beta.register()}
                  className="group flex min-h-11 items-center gap-3 bg-action px-5 py-3 font-inter text-[11px] font-semibold uppercase tracking-widest text-white transition-colors hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:cursor-wait disabled:opacity-70 sm:min-h-12 sm:px-7 sm:py-4 sm:text-xs"
                >
                  {heroPrimaryLabel}
                  {betaBusy ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Fingerprint className="h-4 w-4 transition-transform group-hover:scale-110" />
                  )}
                </button>

                <a
                  href="#roadmap"
                  className="secondary-cta group flex min-h-11 items-center gap-3 border border-white/25 px-5 py-3 font-inter text-[11px] font-semibold uppercase tracking-widest text-white/80 transition-colors hover:border-white/50 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice sm:min-h-12 sm:px-6 sm:py-4 sm:text-xs"
                >
                  ดูแผนปล่อยรอบถัดไป
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </a>
              </div>

              <div className="animate-fade-up-delay-4 mt-4 min-h-5" aria-live="polite">
                {beta.gid && (
                  <div className="beta-confirmation flex max-w-md items-center gap-3 border-l-2 border-signal bg-black/35 px-3 py-2.5 backdrop-blur-sm">
                    <ShieldCheck className="h-5 w-5 shrink-0 text-signal" />
                    <p className="font-inter text-[10px] uppercase leading-relaxed tracking-wider text-white/75 sm:text-xs">
                      GID เดียวกับ G-Maiden · {beta.email}
                      <span className="block text-white/45">บัญชีนี้จะใช้ต่อบน desktop app และ release รอบถัดไป</span>
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

            <div className="hero-demo-stage animate-fade-up-delay-2">
              <div className="hero-demo-shell">
                <div className="hero-demo-copy">
                  <p className="hero-demo-kicker">VDO DEMO</p>
                  <h2 className="thai-display">ดู flow ก่อนถึงเวลา Open Beta</h2>
                </div>
                <div className="hero-demo-frame">
                  <video className="hero-demo-video" autoPlay loop muted playsInline preload="metadata" controls>
                    <source src={DEMO_VIDEOS[0].src} type="video/mp4" />
                  </video>
                </div>
                <div className="hero-demo-meta">
                  <span>ตัวอย่างเดโม 16:9</span>
                  <strong>{DEMO_VIDEOS[0].title}</strong>
                </div>
              </div>
            </div>

            <aside className="launch-beacon open-beta-countdown animate-fade-up-delay-3" aria-live="polite">
              <i className="absolute left-0 top-0 h-14 w-14 border-l-2 border-t-2 border-ice-bright shadow-[-0.4rem_-0.4rem_1.5rem_rgba(143,212,255,0.4)]" aria-hidden="true" />
              <i className="absolute right-0 top-0 h-14 w-14 border-r-2 border-t-2 border-ice-bright shadow-[0.4rem_-0.4rem_1.5rem_rgba(143,212,255,0.4)]" aria-hidden="true" />
              <i className="absolute bottom-0 left-0 h-14 w-14 border-b-2 border-l-2 border-ice-bright" aria-hidden="true" />
              <i className="absolute bottom-0 right-0 h-14 w-14 border-b-2 border-r-2 border-ice-bright" aria-hidden="true" />
              <i className="absolute left-12 right-12 top-0 h-px bg-gradient-to-r from-transparent via-ice-bright to-transparent shadow-[0_0_1rem_rgba(143,212,255,1)]" aria-hidden="true" />
              <i className="absolute -left-1/4 top-1/2 h-px w-[150%] -rotate-12 bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-60" aria-hidden="true" />
              <div className="relative">
                {openBetaCountdown.isOpen ? (
                  <>
                    <p className="launch-beacon-eyebrow">Open Beta</p>
                    <p className="mt-2 font-inter text-lg font-semibold tracking-[0.16em] text-white sm:text-xl">เปิดแล้ว</p>
                  </>
                ) : (
                  <>
                    <div className="launch-beacon-head">
                      <p className="launch-beacon-eyebrow">Open Beta</p>
                      <p className="launch-beacon-date">24 กรกฎาคม · 18:00 น.</p>
                    </div>
                    <p className="launch-clock mt-4 flex items-baseline justify-between font-inter font-black leading-none text-white [text-shadow:0_0_1.5rem_rgba(143,212,255,0.85)]">
                      <span>{String(openBetaCountdown.totalHours).padStart(2, '0')}</span>
                      <span className="animate-pulse text-ice-bright">:</span>
                      <span>{String(openBetaCountdown.minutes).padStart(2, '0')}</span>
                      <span className="animate-pulse text-ice-bright">:</span>
                      <span>{String(openBetaCountdown.seconds).padStart(2, '0')}</span>
                    </p>
                    <div className="mt-4 flex items-center justify-between border-t border-ice-bright/60 pt-3 font-inter text-[9px] font-semibold uppercase tracking-[0.22em] text-white/70">
                      <span>Hours to launch</span>
                      <span className="flex items-center gap-2 text-ice-bright">
                        <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-ice-bright shadow-[0_0_0.65rem_rgba(143,212,255,1)]" />
                        Live clock
                      </span>
                    </div>
                  </>
                )}
              </div>
              <a className="launch-beacon-cta" href="#roadmap">
                <span className="launch-beacon-cta-copy">
                  <strong>ดูแผนปล่อยและสถานะบัญชี</strong>
                  <small>สรุปว่า GID วันนี้จะพาคุณไปต่ออย่างไรในรอบปล่อยถัดไป</small>
                </span>
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </aside>
          </div>
        </section>
      </div>

      <section className="demo-section" aria-labelledby="demo-title">
        <div className="demo-shell">
          <div className="demo-intro">
            <p className="features-kicker"><span aria-hidden="true">//</span> VDO DEMO</p>
            <h2 id="demo-title" className="thai-display">ดู flow การใช้งานจากคลิปเดโมจริง</h2>
            <p>
              ใช้คลิปเดโมชุดนี้เพื่อดูจังหวะการเตือนและบรรยากาศการใช้งานของ G-Maiden
              ก่อนเปิด Open Beta โดยไม่แย่งสายตาจาก Hero section หลัก
            </p>
          </div>

          <div className="demo-grid">
            {DEMO_VIDEOS.map((video) => (
              <article key={video.title} className="demo-card">
                <div className="demo-card-head">
                  <strong>{video.title}</strong>
                  <span>LOCAL MP4</span>
                </div>
                <video className="demo-video" autoPlay loop muted playsInline preload="metadata" controls>
                  <source src={video.src} type="video/mp4" />
                </video>
                <p>{video.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="roadmap" className="roadmap-section" aria-labelledby="roadmap-title" data-scroll-reveal>
        <div className="roadmap-shell">
          <div className="roadmap-intro">
            <p className="features-kicker"><span aria-hidden="true">//</span> NEXT RELEASE</p>
            <h2 id="roadmap-title" className="thai-display">เส้นทางปล่อยรอบถัดไป</h2>
            <p>
              หน้าเว็บรอบนี้ไม่ใช้ flow คิวดาวน์โหลด Closed Beta แบบเดิมแล้ว
              แต่ใช้ funnel ที่โฟกัสบัญชี, สถานะการปล่อย และความพร้อมเข้าใช้งาน G-Maiden รอบใหม่แทน
            </p>
          </div>

          <div className="roadmap-grid">
            <div className="roadmap-track">
              {RELEASE_PATH.map((item) => (
                <article key={item.step} className="roadmap-step">
                  <div className="roadmap-step-index" aria-hidden="true">{item.step}</div>
                  <div className="roadmap-step-copy">
                    <div className="roadmap-step-topline">
                      <h3>{item.title}</h3>
                      <span>{item.status}</span>
                    </div>
                    <p>{item.body}</p>
                  </div>
                </article>
              ))}
            </div>

            <aside className="roadmap-panel">
              <div className="roadmap-panel-group">
                <p className="roadmap-panel-label">บัญชีของคุณ</p>
                {beta.gid ? (
                  <div className="roadmap-account roadmap-account-ready">
                    <ShieldCheck aria-hidden="true" />
                    <div>
                      <strong>{beta.gid}</strong>
                      <p>{beta.email}</p>
                      <small>บัญชีนี้พร้อมใช้ต่อบนเว็บและ desktop app ทันทีเมื่อ release surface ใหม่เปิดใช้งาน</small>
                    </div>
                  </div>
                ) : (
                  <div className="roadmap-account">
                    <Fingerprint aria-hidden="true" />
                    <div>
                      <strong>ยังไม่ได้ผูก GID</strong>
                      <p>เริ่มจาก Google sign-in เพื่อสร้างบัญชี G-Maiden ID ล่วงหน้า</p>
                    </div>
                    <button
                      type="button"
                      disabled={betaBusy}
                      className="roadmap-primary"
                      onClick={() => void beta.register()}
                    >
                      {betaBusy ? 'กำลังเชื่อมต่อ…' : 'รับ GID ตอนนี้'}
                    </button>
                  </div>
                )}
              </div>

              <div className="roadmap-panel-group">
                <p className="roadmap-panel-label">สถานะโปรดักต์</p>
                <div className="roadmap-status-list">
                  {PRODUCT_STATUS.map((item) => (
                    <article key={item.label} className="roadmap-status-card">
                      <span>{item.label}</span>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="roadmap-panel-actions">
                <a href={ROADMAP_URL} target="_blank" rel="noreferrer" className="roadmap-secondary">
                  ดู roadmap ล่าสุด
                  <ArrowUpRight className="h-4 w-4" />
                </a>
                <a href={PRIMARY_URL} target="_blank" rel="noreferrer" className="roadmap-secondary">
                  ดู technical design
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section id="features" className="features-section" aria-labelledby="features-title" data-scroll-reveal>
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
                <article key={feature.number} className="feature-rail" data-scroll-reveal>
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
            <p><strong>ข้อมูลดิบอยู่กับคุณ</strong> — Landing และระบบบัญชีเก็บเพียงข้อมูลยืนยันตัวตนที่จำเป็น ส่วนข้อมูลแมตช์, CV และ G-Log ยังคงอยู่ในเครื่อง</p>
          </div>
        </div>
      </section>
    </main>
  )
}

function App() {
  return <LandingPage />
}

export default App
