import { useEffect, useRef, useState } from 'react'

const DESKTOP_ART = '/assets/hero/gmaiden-2-5d-hero-desktop-v1.webp'
const MOBILE_ART = '/assets/hero/gmaiden-2-5d-hero-mobile-v1.webp'

type HeroVariableMap = Record<string, string>

type HeroNodeSpec = {
  key: string
  nodeClass: string
  pictureClass: string
  pivot: string
}

const SCENE_LAYERS = [
  {
    key: 'background-backdrop',
    layerClass: 'hero-scene-layer hero-scene-layer-background-backdrop',
    pictureClass: 'hero-scene-picture hero-scene-picture-background-backdrop',
  },
  {
    key: 'mid-depth-b',
    layerClass: 'hero-scene-layer hero-scene-layer-mid-depth-b',
    pictureClass: 'hero-scene-picture hero-scene-picture-mid-depth-b',
  },
  {
    key: 'mid-depth-a',
    layerClass: 'hero-scene-layer hero-scene-layer-mid-depth-a',
    pictureClass: 'hero-scene-picture hero-scene-picture-mid-depth-a',
  },
  {
    key: 'cave-wall-left',
    layerClass: 'hero-scene-layer hero-scene-layer-cave-wall-left',
    pictureClass: 'hero-scene-picture hero-scene-picture-cave-wall-left',
  },
  {
    key: 'cave-wall-right',
    layerClass: 'hero-scene-layer hero-scene-layer-cave-wall-right',
    pictureClass: 'hero-scene-picture hero-scene-picture-cave-wall-right',
  },
] as const

const CHARACTER_CORE_NODES: HeroNodeSpec[] = [
  { key: 'neck', nodeClass: 'hero-character-node hero-character-node-neck', pictureClass: 'hero-character-picture hero-character-picture-neck', pivot: 'neck' },
  { key: 'head', nodeClass: 'hero-character-node hero-character-node-head', pictureClass: 'hero-character-picture hero-character-picture-head', pivot: 'head' },
  { key: 'face', nodeClass: 'hero-character-node hero-character-node-face', pictureClass: 'hero-character-picture hero-character-picture-face', pivot: 'head' },
  { key: 'chest', nodeClass: 'hero-character-node hero-character-node-chest', pictureClass: 'hero-character-picture hero-character-picture-chest', pivot: 'chest' },
  { key: 'torso', nodeClass: 'hero-character-node hero-character-node-torso', pictureClass: 'hero-character-picture hero-character-picture-torso', pivot: 'chest' },
  { key: 'hip-base', nodeClass: 'hero-character-node hero-character-node-hip-base', pictureClass: 'hero-character-picture hero-character-picture-hip-base', pivot: 'pelvis' },
]

const CHARACTER_HAIR_NODES: HeroNodeSpec[] = [
  { key: 'hair-crown', nodeClass: 'hero-character-node hero-character-node-hair-crown', pictureClass: 'hero-character-picture hero-character-picture-hair-crown', pivot: 'hair_root_front' },
  { key: 'hair-front-a', nodeClass: 'hero-character-node hero-character-node-hair-front-a', pictureClass: 'hero-character-picture hero-character-picture-hair-front-a', pivot: 'hair_root_front' },
  { key: 'hair-front-b', nodeClass: 'hero-character-node hero-character-node-hair-front-b', pictureClass: 'hero-character-picture hero-character-picture-hair-front-b', pivot: 'hair_root_front' },
  { key: 'hair-side-left', nodeClass: 'hero-character-node hero-character-node-hair-side-left', pictureClass: 'hero-character-picture hero-character-picture-hair-side-left', pivot: 'hair_root_side_left' },
  { key: 'hair-side-right', nodeClass: 'hero-character-node hero-character-node-hair-side-right', pictureClass: 'hero-character-picture hero-character-picture-hair-side-right', pivot: 'hair_root_side_right' },
  { key: 'hair-tail-left', nodeClass: 'hero-character-node hero-character-node-hair-tail-left', pictureClass: 'hero-character-picture hero-character-picture-hair-tail-left', pivot: 'hair_root_side_left' },
  { key: 'hair-tail-right', nodeClass: 'hero-character-node hero-character-node-hair-tail-right', pictureClass: 'hero-character-picture hero-character-picture-hair-tail-right', pivot: 'hair_root_side_right' },
  { key: 'hair-back-mass', nodeClass: 'hero-character-node hero-character-node-hair-back-mass', pictureClass: 'hero-character-picture hero-character-picture-hair-back-mass', pivot: 'hair_root_front' },
]

const CHARACTER_LEFT_ARM_NODES: HeroNodeSpec[] = [
  { key: 'left-shoulder', nodeClass: 'hero-character-node hero-character-node-left-shoulder', pictureClass: 'hero-character-picture hero-character-picture-left-shoulder', pivot: 'shoulder_left' },
  { key: 'left-upper-arm', nodeClass: 'hero-character-node hero-character-node-left-upper-arm', pictureClass: 'hero-character-picture hero-character-picture-left-upper-arm', pivot: 'shoulder_left' },
  { key: 'left-forearm', nodeClass: 'hero-character-node hero-character-node-left-forearm', pictureClass: 'hero-character-picture hero-character-picture-left-forearm', pivot: 'elbow_left' },
  { key: 'left-hand', nodeClass: 'hero-character-node hero-character-node-left-hand', pictureClass: 'hero-character-picture hero-character-picture-left-hand', pivot: 'wrist_left' },
]

const CHARACTER_RIGHT_ARM_NODES: HeroNodeSpec[] = [
  { key: 'right-shoulder', nodeClass: 'hero-character-node hero-character-node-right-shoulder', pictureClass: 'hero-character-picture hero-character-picture-right-shoulder', pivot: 'shoulder_right' },
  { key: 'right-upper-arm', nodeClass: 'hero-character-node hero-character-node-right-upper-arm', pictureClass: 'hero-character-picture hero-character-picture-right-upper-arm', pivot: 'shoulder_right' },
  { key: 'right-forearm', nodeClass: 'hero-character-node hero-character-node-right-forearm', pictureClass: 'hero-character-picture hero-character-picture-right-forearm', pivot: 'elbow_right' },
  { key: 'right-hand', nodeClass: 'hero-character-node hero-character-node-right-hand', pictureClass: 'hero-character-picture hero-character-picture-right-hand', pivot: 'wrist_right' },
]

const CHARACTER_CLOTH_NODES: HeroNodeSpec[] = [
  { key: 'shoulder-cape-left', nodeClass: 'hero-character-node hero-character-node-shoulder-cape-left', pictureClass: 'hero-character-picture hero-character-picture-shoulder-cape-left', pivot: 'cape_root_left' },
  { key: 'shoulder-cape-right', nodeClass: 'hero-character-node hero-character-node-shoulder-cape-right', pictureClass: 'hero-character-picture hero-character-picture-shoulder-cape-right', pivot: 'cape_root_right' },
  { key: 'collar-drape', nodeClass: 'hero-character-node hero-character-node-collar-drape', pictureClass: 'hero-character-picture hero-character-picture-collar-drape', pivot: 'chest' },
  { key: 'front-cloth-panel-a', nodeClass: 'hero-character-node hero-character-node-front-cloth-panel-a', pictureClass: 'hero-character-picture hero-character-picture-front-cloth-panel-a', pivot: 'pelvis' },
  { key: 'front-cloth-panel-b', nodeClass: 'hero-character-node hero-character-node-front-cloth-panel-b', pictureClass: 'hero-character-picture hero-character-picture-front-cloth-panel-b', pivot: 'pelvis' },
  { key: 'side-cloth-left', nodeClass: 'hero-character-node hero-character-node-side-cloth-left', pictureClass: 'hero-character-picture hero-character-picture-side-cloth-left', pivot: 'cape_root_left' },
  { key: 'side-cloth-right', nodeClass: 'hero-character-node hero-character-node-side-cloth-right', pictureClass: 'hero-character-picture hero-character-picture-side-cloth-right', pivot: 'cape_root_right' },
  { key: 'lower-hem', nodeClass: 'hero-character-node hero-character-node-lower-hem', pictureClass: 'hero-character-picture hero-character-picture-lower-hem', pivot: 'pelvis' },
]

const CHARACTER_OBJECT_NODES: HeroNodeSpec[] = [
  { key: 'held-crystal-core', nodeClass: 'hero-character-node hero-character-node-held-crystal-core', pictureClass: 'hero-character-picture hero-character-picture-held-crystal-core', pivot: 'object_anchor' },
  { key: 'held-crystal-ring', nodeClass: 'hero-character-node hero-character-node-held-crystal-ring', pictureClass: 'hero-character-picture hero-character-picture-held-crystal-ring', pivot: 'object_anchor' },
  { key: 'held-crystal-glow', nodeClass: 'hero-character-node hero-character-node-held-crystal-glow', pictureClass: 'hero-character-picture hero-character-picture-held-crystal-glow', pivot: 'object_anchor' },
]

const STATIC_HERO_SAMPLE: HeroVariableMap = {
  '--hero-media-x': '0px',
  '--hero-media-y': '0px',
  '--hero-media-tilt': '0deg',
  '--hero-media-scale': '1.035',
  '--hero-media-glow': '0.42',
  '--hero-base-x': '0px',
  '--hero-base-y': '0px',
  '--hero-base-turn': '0deg',
  '--hero-head-lift': '0px',
  '--hero-head-turn': '0deg',
  '--hero-hair-x': '0px',
  '--hero-hair-y': '0px',
  '--hero-hair-turn': '0deg',
  '--hero-hair-back-shift': '0px',
  '--hero-hair-front-sway': '0px',
  '--hero-hair-tail-left-turn': '0deg',
  '--hero-hair-tail-right-turn': '0deg',
  '--hero-arm-left-turn': '0deg',
  '--hero-arm-right-turn': '0deg',
  '--hero-cloak-x': '0px',
  '--hero-cloak-y': '0px',
  '--hero-cloak-turn': '0deg',
  '--hero-cloth-front-sway': '0px',
  '--hero-cloth-side-left': '0px',
  '--hero-cloth-side-right': '0px',
  '--hero-cloth-hem-lift': '0px',
  '--hero-frost-x': '0px',
  '--hero-frost-y': '0px',
  '--hero-frost-pulse': '0.18',
  '--hero-glint': '0.26',
  '--hero-aura-pulse': '0.18',
  '--hero-object-x': '0px',
  '--hero-object-y': '0px',
  '--hero-object-turn': '0deg',
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function px(value: number) {
  return `${value.toFixed(3)}px`
}

function deg(value: number) {
  return `${value.toFixed(3)}deg`
}

function unit(value: number) {
  return value.toFixed(4)
}

export function sampleHeroWind(timeMs: number, pointerX: number, pointerY: number): HeroVariableMap {
  const pxNorm = clamp(pointerX, -1, 1)
  const pyNorm = clamp(pointerY, -1, 1)
  const time = timeMs * 0.001

  const driftX = Math.sin(time * 0.34) * 3.1
  const driftY = Math.cos(time * 0.28) * 2.2
  const breath = (Math.sin(time * 0.32) + 1) * 0.5
  const windA = Math.sin(time * 0.92)
  const windB = Math.cos(time * 0.76)
  const windC = Math.sin(time * 1.18 + 0.8)

  const mediaX = pxNorm * 7.6 + driftX
  const mediaY = pyNorm * 5.6 + driftY
  const baseX = pxNorm * 4.8 + windA * 1.6
  const baseY = pyNorm * 3.1 + windB * 1.2
  const hairX = pxNorm * 6.2 + windA * 3.4
  const hairY = pyNorm * 2.8 + windB * 1.9
  const cloakX = pxNorm * 4.5 + windC * 2.6
  const cloakY = pyNorm * 2.5 + windA * 1.8
  const frostX = pxNorm * 3.2 + windB * 3
  const frostY = pyNorm * 1.8 + windC * 2.2
  const objectX = pxNorm * 1.1 + windB * 0.8
  const objectY = pyNorm * 0.9 + windA * 0.8
  const frontSway = windA * 2.2 + pxNorm * 1.2
  const hemLift = (Math.sin(time * 1.28 + 1.2) + 1) * 1.2
  const sideLeft = windB * 1.6 + pxNorm * 0.8
  const sideRight = windC * 1.5 + pxNorm * 0.7
  const glint = 0.26 + breath * 0.44
  const frostPulse = 0.16 + ((windB + 1) * 0.5) * 0.32
  const auraPulse = 0.14 + ((windC + 1) * 0.5) * 0.38

  return {
    '--hero-media-x': px(mediaX),
    '--hero-media-y': px(mediaY),
    '--hero-media-tilt': deg(pxNorm * 0.52),
    '--hero-media-scale': unit(1.032 + breath * 0.016),
    '--hero-media-glow': unit(0.28 + breath * 0.34),
    '--hero-base-x': px(baseX),
    '--hero-base-y': px(baseY),
    '--hero-base-turn': deg(pxNorm * 0.42 + windA * 0.24),
    '--hero-head-lift': px(windB * 1.25 + pyNorm * -0.8),
    '--hero-head-turn': deg(pxNorm * 0.62 + windA * 0.3),
    '--hero-hair-x': px(hairX),
    '--hero-hair-y': px(hairY),
    '--hero-hair-turn': deg(pxNorm * 0.76 + windA * 0.58),
    '--hero-hair-back-shift': px(windC * 2.2),
    '--hero-hair-front-sway': px(frontSway),
    '--hero-hair-tail-left-turn': deg(windB * 1.18),
    '--hero-hair-tail-right-turn': deg(windC * -1.06),
    '--hero-arm-left-turn': deg(pxNorm * 0.18 + windA * 0.38),
    '--hero-arm-right-turn': deg(pxNorm * -0.16 + windB * 0.34),
    '--hero-cloak-x': px(cloakX),
    '--hero-cloak-y': px(cloakY),
    '--hero-cloak-turn': deg(pxNorm * 0.58 + windC * 0.64),
    '--hero-cloth-front-sway': px(frontSway * 0.9),
    '--hero-cloth-side-left': px(sideLeft),
    '--hero-cloth-side-right': px(sideRight),
    '--hero-cloth-hem-lift': px(hemLift),
    '--hero-frost-x': px(frostX),
    '--hero-frost-y': px(frostY),
    '--hero-frost-pulse': unit(frostPulse),
    '--hero-glint': unit(glint),
    '--hero-aura-pulse': unit(auraPulse),
    '--hero-object-x': px(objectX),
    '--hero-object-y': px(objectY),
    '--hero-object-turn': deg(pxNorm * 0.3 + windA * 0.42),
  }
}

function applyHeroVariables(shell: HTMLDivElement, sample: HeroVariableMap) {
  Object.entries(sample).forEach(([key, value]) => {
    shell.style.setProperty(key, value)
  })
}

function HeroPicture({ className }: { className: string }) {
  return (
    <picture className={className}>
      <source media="(max-width: 767px)" srcSet={MOBILE_ART} />
      <img src={DESKTOP_ART} alt="" decoding="async" />
    </picture>
  )
}

function HeroNode({ nodeClass, pictureClass, pivot }: HeroNodeSpec) {
  return (
    <div className={nodeClass} data-pivot={pivot}>
      <HeroPicture className={pictureClass} />
    </div>
  )
}

export default function HeroMedia25D() {
  const shellRef = useRef<HTMLDivElement>(null)
  const [staticMode, setStaticMode] = useState(false)

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const coarsePointer = window.matchMedia('(pointer: coarse)')

    const syncStaticMode = () => {
      setStaticMode(reducedMotion.matches || coarsePointer.matches)
    }

    syncStaticMode()
    reducedMotion.addEventListener('change', syncStaticMode)
    coarsePointer.addEventListener('change', syncStaticMode)

    return () => {
      reducedMotion.removeEventListener('change', syncStaticMode)
      coarsePointer.removeEventListener('change', syncStaticMode)
    }
  }, [])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return

    applyHeroVariables(shell, STATIC_HERO_SAMPLE)

    if (staticMode) return

    let frame = 0
    let currentX = 0
    let currentY = 0
    let targetX = 0
    let targetY = 0

    const onPointerMove = (event: PointerEvent) => {
      targetX = (event.clientX / window.innerWidth - 0.5) * 2
      targetY = (event.clientY / window.innerHeight - 0.5) * 2
    }

    const render = (timeMs: number) => {
      currentX += (targetX - currentX) * 0.055
      currentY += (targetY - currentY) * 0.055

      applyHeroVariables(shell, sampleHeroWind(timeMs, currentX, currentY))
      frame = window.requestAnimationFrame(render)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    frame = window.requestAnimationFrame(render)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [staticMode])

  return (
    <div ref={shellRef} className="hero-media-shell" data-static-mode={staticMode ? 'true' : 'false'} aria-hidden="true">
      <div className="hero-image-frame hero-scene-shell">
        {SCENE_LAYERS.map((layer) => (
          <div key={layer.key} className={layer.layerClass}>
            <HeroPicture className={layer.pictureClass} />
          </div>
        ))}

        <div className="hero-scene-layer hero-scene-layer-character-layer">
          <div className="hero-character-shell">
            <div className="hero-character-component hero-character-core">
              {CHARACTER_CORE_NODES.map((node) => (
                <HeroNode key={node.key} nodeClass={node.nodeClass} pictureClass={node.pictureClass} pivot={node.pivot} />
              ))}
            </div>

            <div className="hero-character-component hero-character-hair-rig">
              {CHARACTER_HAIR_NODES.map((node) => (
                <HeroNode key={node.key} nodeClass={node.nodeClass} pictureClass={node.pictureClass} pivot={node.pivot} />
              ))}
            </div>

            <div className="hero-character-component hero-character-arm-rig-left">
              {CHARACTER_LEFT_ARM_NODES.map((node) => (
                <HeroNode key={node.key} nodeClass={node.nodeClass} pictureClass={node.pictureClass} pivot={node.pivot} />
              ))}
            </div>

            <div className="hero-character-component hero-character-arm-rig-right">
              {CHARACTER_RIGHT_ARM_NODES.map((node) => (
                <HeroNode key={node.key} nodeClass={node.nodeClass} pictureClass={node.pictureClass} pivot={node.pivot} />
              ))}
            </div>

            <div className="hero-character-component hero-character-cloth-rig">
              {CHARACTER_CLOTH_NODES.map((node) => (
                <HeroNode key={node.key} nodeClass={node.nodeClass} pictureClass={node.pictureClass} pivot={node.pivot} />
              ))}
            </div>

            <div className="hero-character-component hero-character-held-object">
              {CHARACTER_OBJECT_NODES.map((node) => (
                <HeroNode key={node.key} nodeClass={node.nodeClass} pictureClass={node.pictureClass} pivot={node.pivot} />
              ))}
              <span className="hero-character-held-crystal-aura hero-character-held-crystal-aura-a" />
              <span className="hero-character-held-crystal-aura hero-character-held-crystal-aura-b" />
            </div>
          </div>
        </div>

        <div className="hero-scene-layer hero-scene-layer-atmosphere-overlay">
          <span className="hero-media-frost-plume hero-media-frost-plume-a" />
          <span className="hero-media-frost-plume hero-media-frost-plume-b" />
          <span className="hero-media-frost-trace hero-media-frost-trace-a" />
          <span className="hero-media-frost-trace hero-media-frost-trace-b" />
        </div>
      </div>
    </div>
  )
}
