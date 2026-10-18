import { useEffect, useId, useRef, useState } from 'react'
import {
  ArrowUpRight,
  BrainCircuit,
  Crown,
  HardDrive,
  Radio,
  ScanLine,
  ShieldCheck,
  X,
} from 'lucide-react'
import HeroMedia25D from './HeroMedia25D'
import { useScrollNarrative } from './scrollNarrative'

const NAV_ITEMS: Array<{ label: string; href: string; external?: boolean }> = [
  { label: 'สถานะการพัฒนา', href: '#roadmap' },
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

const PRODUCT_STATUS = [
  {
    label: 'LOCAL CORE',
    title: 'เริ่มใช้งานโดยไม่ต้องลงชื่อเข้าใช้',
    detail: 'GSI, capture และ overlay ทำงานแยกจากบัญชี ส่วนบัญชี Google เป็นตัวเลือกสำหรับฟังก์ชันบัญชีเท่านั้น',
  },
  {
    label: 'CURRENT',
    title: 'ตรวจความพร้อมจากหลักฐาน',
    detail: 'แยกผลทดสอบในเครื่อง การตรวจรับบน desktop และสถานะ release ออกจากกันอย่างชัดเจน',
  },
  {
    label: 'NEXT',
    title: 'พัฒนาฟีเจอร์และปิดงานตรวจรับ',
    detail: 'สถานะ release จะเปลี่ยนเมื่อ build, QA และเกณฑ์รับมอบที่เกี่ยวข้องผ่านครบ',
  },
] as const

const DEVELOPMENT_STEPS = [
  {
    step: '01',
    title: 'เริ่มจาก local core',
    body: 'GSI, capture และ overlay ทำงานได้โดยไม่ต้องมีบัญชีหรือการเชื่อมต่อเครือข่าย',
    status: 'บัญชีไม่บังคับ',
  },
  {
    step: '02',
    title: 'ใช้บัญชีเฉพาะงานที่ต้องใช้',
    body: 'Google sign-in ใช้กับฟังก์ชันบัญชี ส่วน GID และ Steam ไม่ใช่รหัสผ่านหรือช่องทางกู้คืน',
    status: 'แยกจาก local core',
  },
  {
    step: '03',
    title: 'ปล่อยเมื่อผ่านเกณฑ์ตรวจรับ',
    body: 'สถานะความพร้อมอิงผล build, QA และ acceptance evidence ของแต่ละแพลตฟอร์ม',
    status: 'ต้องมีหลักฐาน',
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

function LandingPage() {
  const landingRootRef = useScrollNarrative()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
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

          <a
            href="/demo"
            className="group hidden min-h-11 items-center gap-3 border border-white/30 px-6 py-3 font-inter text-xs uppercase tracking-widest transition-colors hover:border-white/60 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice md:flex"
          >
            ลองดูเดโม
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </a>

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

            <a
              href="/demo"
              className={`group mt-5 flex min-h-12 items-center gap-3 border border-white/30 px-7 py-3 font-inter text-xs uppercase tracking-widest transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice ${
                menuOpen ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'
              }`}
              style={{ transitionDelay: `${NAV_ITEMS.length * 80 + 100}ms` }}
              onClick={closeMenu}
            >
              ลองดูเดโม
              <ArrowUpRight className="h-4 w-4" />
            </a>
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
                <strong className="font-semibold text-white"> จังหวะตรงหน้า</strong>
              </p>

              <div className="hero-actions animate-fade-up-delay-3 mt-6 flex flex-wrap items-center gap-3 sm:mt-8 sm:gap-4">
                <a
                  href="/demo"
                  className="group flex min-h-11 items-center gap-3 bg-action px-5 py-3 font-inter text-[11px] font-semibold uppercase tracking-widest text-white transition-colors hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice focus-visible:ring-offset-2 focus-visible:ring-offset-void sm:min-h-12 sm:px-7 sm:py-4 sm:text-xs"
                >
                  ลองดู Public Demo
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </a>

                <a
                  href="#features"
                  className="secondary-cta group flex min-h-11 items-center gap-3 border border-white/25 px-5 py-3 font-inter text-[11px] font-semibold uppercase tracking-widest text-white/80 transition-colors hover:border-white/50 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice sm:min-h-12 sm:px-6 sm:py-4 sm:text-xs"
                >
                  ดูฟีเจอร์
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </a>
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
                  <h2 className="thai-display">ดูการทำงานของ G-Maiden</h2>
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

          </div>
        </section>
      </div>

      <section className="demo-section" aria-labelledby="demo-title">
        <div className="demo-shell">
          <div className="demo-intro">
            <p className="features-kicker"><span aria-hidden="true">//</span> VDO DEMO</p>
            <h2 id="demo-title" className="thai-display">ดูตัวอย่างการทำงานจากคลิปเดโม</h2>
            <p>
              ใช้คลิปเดโมชุดนี้เพื่อดูจังหวะการเตือนและบรรยากาศการใช้งานของ G-Maiden
              โดยไม่ต้องติดตั้งแอป
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
            <p className="features-kicker"><span aria-hidden="true">//</span> CURRENT PLAN</p>
            <h2 id="roadmap-title" className="thai-display">สถานะการพัฒนา</h2>
            <p>
              แสดงขอบเขตการใช้งานและความพร้อมตามหลักฐาน โดย local core ใช้งานได้โดยไม่ต้องผูกกับบัญชี
            </p>
          </div>

          <div className="roadmap-grid">
            <div className="roadmap-track">
              {DEVELOPMENT_STEPS.map((item) => (
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
                <p className="roadmap-panel-label">ขอบเขตบัญชี</p>
                <div className="roadmap-account roadmap-account-ready">
                  <ShieldCheck aria-hidden="true" />
                  <div>
                    <strong>บัญชีเป็นตัวเลือก</strong>
                    <p>Google ใช้กับการทำงานที่เกี่ยวกับบัญชีเท่านั้น</p>
                    <small>ไม่มี login, Terms หรือ entitlement มากั้นการเริ่ม local core</small>
                  </div>
                </div>
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
