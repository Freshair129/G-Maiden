import { type ReactNode, useEffect, useRef } from 'react'

const DESKTOP_ART = '/assets/hero/gmaiden-2-5d-hero-desktop-v1.webp'
const MOBILE_ART = '/assets/hero/gmaiden-2-5d-hero-mobile-v1.webp'

export const HERO_SCENE_LAYER_ORDER = [
  'background-backdrop',
  'mid-depth-b',
  'mid-depth-a',
  'cave-wall-left',
  'cave-wall-right',
  'character-layer',
  'atmosphere-overlay',
] as const

export const HERO_CHARACTER_COMPONENT_ORDER = [
  'character-core',
  'character-hair-rig',
  'character-arm-rig-left',
  'character-arm-rig-right',
  'character-cloth-rig',
  'character-held-object',
] as const

export const HERO_CHARACTER_PIVOTS = [
  'root',
  'neck',
  'head',
  'shoulder_left',
  'elbow_left',
  'wrist_left',
  'shoulder_right',
  'elbow_right',
  'wrist_right',
  'chest',
  'pelvis',
  'hair_root_front',
  'hair_root_side_left',
  'hair_root_side_right',
  'cape_root_left',
  'cape_root_right',
  'object_anchor',
] as const

type HeroWindSample = {
  frost: number
  shimmer: number
  turn: number
  x: number
  y: number
}

type HeroRigMotionSample = {
  armLeftTurn: number
  armRightTurn: number
  auraPulse: number
  clothFrontSway: number
  clothHemLift: number
  clothSideLeft: number
  clothSideRight: number
  crystalFloatX: number
  crystalFloatY: number
  crystalTurn: number
  hairBackShift: number
  hairFrontSway: number
  hairTailLeftTurn: number
  hairTailRightTurn: number
  headLift: number
  headTurn: number
}

export const sampleHeroWind = (timeMs: number): HeroWindSample => {
  const time = timeMs * 0.001

  return {
    x: Math.sin(time * 0.92) * 7.4 + Math.sin(time * 1.51 + 0.62) * 2.2,
    y: Math.cos(time * 0.58 + 0.44) * 4.2 + Math.sin(time * 1.07 + 0.18) * 1.15,
    turn: Math.sin(time * 0.73 + 0.92) * 1.5 + Math.cos(time * 0.49 + 0.2) * 0.48,
    shimmer: (Math.sin(time * 1.19 + 0.14) + 1) * 0.5,
    frost: (Math.cos(time * 0.52 - 0.38) + 1) * 0.5,
  }
}

export const sampleHeroRigMotion = (timeMs: number): HeroRigMotionSample => {
  const time = timeMs * 0.001

  return {
    headTurn: Math.sin(time * 0.54 + 0.42) * 1.2,
    headLift: Math.cos(time * 0.78 + 0.11) * 2.8,
    hairFrontSway: Math.sin(time * 1.22 + 0.36) * 5.2,
    hairBackShift: Math.cos(time * 0.82 + 0.58) * 3.4,
    hairTailLeftTurn: Math.sin(time * 1.34 + 1.08) * 4.6,
    hairTailRightTurn: Math.cos(time * 1.28 + 0.84) * 4.2,
    armLeftTurn: Math.sin(time * 0.64 + 0.74) * 1.6,
    armRightTurn: Math.cos(time * 0.59 + 0.18) * 1.4,
    clothFrontSway: Math.sin(time * 0.92 + 0.34) * 4.8,
    clothSideLeft: Math.cos(time * 0.88 + 0.96) * 4.2,
    clothSideRight: Math.sin(time * 0.86 + 1.34) * 4,
    clothHemLift: (Math.sin(time * 1.04 + 0.25) + 1) * 2.4,
    crystalFloatX: Math.sin(time * 1.16 + 0.44) * 3.2,
    crystalFloatY: Math.cos(time * 1.04 + 0.67) * 4.2,
    crystalTurn: Math.sin(time * 0.72 + 0.91) * 3.4,
    auraPulse: (Math.sin(time * 1.42 + 0.26) + 1) * 0.5,
  }
}

function HeroLayerPicture({ className }: { className: string }) {
  return (
    <picture className={className}>
      <source media="(max-width: 767px)" srcSet={MOBILE_ART} />
      <img src={DESKTOP_ART} alt="" decoding="async" />
    </picture>
  )
}

function HeroSceneLayer({
  layerClassName,
  pictureClassName,
}: {
  layerClassName: string
  pictureClassName: string
}) {
  return (
    <div className={`hero-scene-layer ${layerClassName}`}>
      <HeroLayerPicture className={`hero-media-picture hero-scene-picture ${pictureClassName}`} />
    </div>
  )
}

function HeroCharacterNode({
  className,
  pictureClassName,
  nodeId,
  pivot,
  children,
}: {
  className: string
  pictureClassName: string
  nodeId: string
  pivot: (typeof HERO_CHARACTER_PIVOTS)[number]
  children?: ReactNode
}) {
  return (
    <div className={`hero-character-node ${className}`} data-node={nodeId} data-pivot={pivot}>
      <HeroLayerPicture className={`hero-media-picture hero-character-picture ${pictureClassName}`} />
      {children}
    </div>
  )
}

function HeroCharacterLayer() {
  return (
    <div className="hero-scene-layer hero-scene-layer-character-layer" data-layer="character-layer">
      <div className="hero-character-shell">
        <div className="hero-character-component hero-character-core" data-component={HERO_CHARACTER_COMPONENT_ORDER[0]}>
          <HeroCharacterNode className="hero-character-node-neck" pictureClassName="hero-character-picture-neck" nodeId="neck" pivot="neck" />
          <HeroCharacterNode className="hero-character-node-head" pictureClassName="hero-character-picture-head" nodeId="head" pivot="head" />
          <HeroCharacterNode className="hero-character-node-face" pictureClassName="hero-character-picture-face" nodeId="face" pivot="head" />
          <HeroCharacterNode className="hero-character-node-chest" pictureClassName="hero-character-picture-chest" nodeId="chest" pivot="chest" />
          <HeroCharacterNode className="hero-character-node-torso" pictureClassName="hero-character-picture-torso" nodeId="torso" pivot="chest" />
          <HeroCharacterNode className="hero-character-node-hip-base" pictureClassName="hero-character-picture-hip-base" nodeId="hip-base" pivot="pelvis" />
        </div>

        <div className="hero-character-component hero-character-hair-rig" data-component={HERO_CHARACTER_COMPONENT_ORDER[1]}>
          <HeroCharacterNode className="hero-character-node-hair-crown" pictureClassName="hero-character-picture-hair-crown" nodeId="hair-crown" pivot="head" />
          <HeroCharacterNode className="hero-character-node-hair-front-a" pictureClassName="hero-character-picture-hair-front-a" nodeId="hair-front-a" pivot="hair_root_front" />
          <HeroCharacterNode className="hero-character-node-hair-front-b" pictureClassName="hero-character-picture-hair-front-b" nodeId="hair-front-b" pivot="hair_root_front" />
          <HeroCharacterNode className="hero-character-node-hair-side-left" pictureClassName="hero-character-picture-hair-side-left" nodeId="hair-side-left" pivot="hair_root_side_left" />
          <HeroCharacterNode className="hero-character-node-hair-side-right" pictureClassName="hero-character-picture-hair-side-right" nodeId="hair-side-right" pivot="hair_root_side_right" />
          <HeroCharacterNode className="hero-character-node-hair-tail-left" pictureClassName="hero-character-picture-hair-tail-left" nodeId="hair-tail-left" pivot="hair_root_side_left" />
          <HeroCharacterNode className="hero-character-node-hair-tail-right" pictureClassName="hero-character-picture-hair-tail-right" nodeId="hair-tail-right" pivot="hair_root_side_right" />
          <HeroCharacterNode className="hero-character-node-hair-back-mass" pictureClassName="hero-character-picture-hair-back-mass" nodeId="hair-back-mass" pivot="hair_root_front" />
        </div>

        <div className="hero-character-component hero-character-arm-rig-left" data-component={HERO_CHARACTER_COMPONENT_ORDER[2]}>
          <HeroCharacterNode className="hero-character-node-left-shoulder" pictureClassName="hero-character-picture-left-shoulder" nodeId="left-shoulder" pivot="shoulder_left" />
          <HeroCharacterNode className="hero-character-node-left-upper-arm" pictureClassName="hero-character-picture-left-upper-arm" nodeId="left-upper-arm" pivot="shoulder_left" />
          <HeroCharacterNode className="hero-character-node-left-forearm" pictureClassName="hero-character-picture-left-forearm" nodeId="left-forearm" pivot="elbow_left" />
          <HeroCharacterNode className="hero-character-node-left-hand" pictureClassName="hero-character-picture-left-hand" nodeId="left-hand" pivot="wrist_left" />
        </div>

        <div className="hero-character-component hero-character-arm-rig-right" data-component={HERO_CHARACTER_COMPONENT_ORDER[3]}>
          <HeroCharacterNode className="hero-character-node-right-shoulder" pictureClassName="hero-character-picture-right-shoulder" nodeId="right-shoulder" pivot="shoulder_right" />
          <HeroCharacterNode className="hero-character-node-right-upper-arm" pictureClassName="hero-character-picture-right-upper-arm" nodeId="right-upper-arm" pivot="shoulder_right" />
          <HeroCharacterNode className="hero-character-node-right-forearm" pictureClassName="hero-character-picture-right-forearm" nodeId="right-forearm" pivot="elbow_right" />
          <HeroCharacterNode className="hero-character-node-right-hand" pictureClassName="hero-character-picture-right-hand" nodeId="right-hand" pivot="wrist_right" />
        </div>

        <div className="hero-character-component hero-character-cloth-rig" data-component={HERO_CHARACTER_COMPONENT_ORDER[4]}>
          <HeroCharacterNode className="hero-character-node-shoulder-cape-left" pictureClassName="hero-character-picture-shoulder-cape-left" nodeId="shoulder-cape-left" pivot="cape_root_left" />
          <HeroCharacterNode className="hero-character-node-shoulder-cape-right" pictureClassName="hero-character-picture-shoulder-cape-right" nodeId="shoulder-cape-right" pivot="cape_root_right" />
          <HeroCharacterNode className="hero-character-node-collar-drape" pictureClassName="hero-character-picture-collar-drape" nodeId="collar-drape" pivot="chest" />
          <HeroCharacterNode className="hero-character-node-front-cloth-panel-a" pictureClassName="hero-character-picture-front-cloth-panel-a" nodeId="front-cloth-panel-a" pivot="pelvis" />
          <HeroCharacterNode className="hero-character-node-front-cloth-panel-b" pictureClassName="hero-character-picture-front-cloth-panel-b" nodeId="front-cloth-panel-b" pivot="pelvis" />
          <HeroCharacterNode className="hero-character-node-side-cloth-left" pictureClassName="hero-character-picture-side-cloth-left" nodeId="side-cloth-left" pivot="cape_root_left" />
          <HeroCharacterNode className="hero-character-node-side-cloth-right" pictureClassName="hero-character-picture-side-cloth-right" nodeId="side-cloth-right" pivot="cape_root_right" />
          <HeroCharacterNode className="hero-character-node-lower-hem" pictureClassName="hero-character-picture-lower-hem" nodeId="lower-hem" pivot="pelvis" />
        </div>

        <div className="hero-character-component hero-character-held-object" data-component={HERO_CHARACTER_COMPONENT_ORDER[5]}>
          <HeroCharacterNode className="hero-character-node-held-crystal-core" pictureClassName="hero-character-picture-held-crystal-core" nodeId="held-crystal-core" pivot="object_anchor" />
          <HeroCharacterNode className="hero-character-node-held-crystal-ring" pictureClassName="hero-character-picture-held-crystal-ring" nodeId="held-crystal-ring" pivot="object_anchor" />
          <HeroCharacterNode className="hero-character-node-held-crystal-glow" pictureClassName="hero-character-picture-held-crystal-glow" nodeId="held-crystal-glow" pivot="object_anchor">
            <span className="hero-character-held-crystal-aura hero-character-held-crystal-aura-a" />
            <span className="hero-character-held-crystal-aura hero-character-held-crystal-aura-b" />
          </HeroCharacterNode>
        </div>
      </div>
    </div>
  )
}

function HeroAtmosphereLayer() {
  return (
    <div className="hero-scene-layer hero-scene-layer-atmosphere-overlay" data-layer="atmosphere-overlay">
      <span className="hero-media-frost-plume hero-media-frost-plume-a" />
      <span className="hero-media-frost-plume hero-media-frost-plume-b" />
      <span className="hero-media-frost-trace hero-media-frost-trace-a" />
      <span className="hero-media-frost-trace hero-media-frost-trace-b" />
    </div>
  )
}

export default function HeroMedia25D() {
  const shellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const coarsePointer = window.matchMedia('(pointer: coarse)')

    const setStatic = () => {
      shell.style.setProperty('--hero-media-x', '0px')
      shell.style.setProperty('--hero-media-y', '0px')
      shell.style.setProperty('--hero-media-tilt', '0deg')
      shell.style.setProperty('--hero-base-x', '0px')
      shell.style.setProperty('--hero-base-y', '0px')
      shell.style.setProperty('--hero-base-turn', '0deg')
      shell.style.setProperty('--hero-hair-x', '0px')
      shell.style.setProperty('--hero-hair-y', '0px')
      shell.style.setProperty('--hero-hair-turn', '0deg')
      shell.style.setProperty('--hero-cloak-x', '0px')
      shell.style.setProperty('--hero-cloak-y', '0px')
      shell.style.setProperty('--hero-cloak-turn', '0deg')
      shell.style.setProperty('--hero-frost-x', '0px')
      shell.style.setProperty('--hero-frost-y', '0px')
      shell.style.setProperty('--hero-glint', '0.5')
      shell.style.setProperty('--hero-frost-pulse', '0.5')
      shell.style.setProperty('--hero-head-turn', '0deg')
      shell.style.setProperty('--hero-head-lift', '0px')
      shell.style.setProperty('--hero-hair-front-sway', '0px')
      shell.style.setProperty('--hero-hair-back-shift', '0px')
      shell.style.setProperty('--hero-hair-tail-left-turn', '0deg')
      shell.style.setProperty('--hero-hair-tail-right-turn', '0deg')
      shell.style.setProperty('--hero-arm-left-turn', '0deg')
      shell.style.setProperty('--hero-arm-right-turn', '0deg')
      shell.style.setProperty('--hero-cloth-front-sway', '0px')
      shell.style.setProperty('--hero-cloth-side-left', '0px')
      shell.style.setProperty('--hero-cloth-side-right', '0px')
      shell.style.setProperty('--hero-cloth-hem-lift', '0px')
      shell.style.setProperty('--hero-object-x', '0px')
      shell.style.setProperty('--hero-object-y', '0px')
      shell.style.setProperty('--hero-object-turn', '0deg')
      shell.style.setProperty('--hero-aura-pulse', '0.5')
    }

    if (reducedMotion.matches || coarsePointer.matches) {
      setStatic()
      return
    }

    let frame = 0
    let currentX = 0
    let currentY = 0
    let targetX = 0
    let targetY = 0

    const onPointerMove = (event: PointerEvent) => {
      targetX = (event.clientX / window.innerWidth - 0.5) * 2
      targetY = (event.clientY / window.innerHeight - 0.5) * 2
    }

    const render = (time: number) => {
      const wind = sampleHeroWind(time)
      const rigMotion = sampleHeroRigMotion(time)

      currentX += (targetX - currentX) * 0.055
      currentY += (targetY - currentY) * 0.055

      const shellX = currentX * 10.5
      const shellY = currentY * 7.1
      const shellTilt = currentX * 0.35

      shell.style.setProperty('--hero-media-x', `${shellX.toFixed(2)}px`)
      shell.style.setProperty('--hero-media-y', `${shellY.toFixed(2)}px`)
      shell.style.setProperty('--hero-media-tilt', `${shellTilt.toFixed(3)}deg`)

      shell.style.setProperty('--hero-base-x', `${(currentX * 5.4).toFixed(2)}px`)
      shell.style.setProperty('--hero-base-y', `${(currentY * 3.7).toFixed(2)}px`)
      shell.style.setProperty('--hero-base-turn', `${(currentX * 0.14 + wind.turn * 0.04).toFixed(3)}deg`)

      shell.style.setProperty('--hero-hair-x', `${(currentX * 8.8 + wind.x * 0.72).toFixed(2)}px`)
      shell.style.setProperty('--hero-hair-y', `${(currentY * 4.8 - wind.y * 0.88).toFixed(2)}px`)
      shell.style.setProperty('--hero-hair-turn', `${(currentX * 0.29 + wind.turn * 0.64).toFixed(3)}deg`)

      shell.style.setProperty('--hero-cloak-x', `${(currentX * 7.1 + wind.x * 0.34).toFixed(2)}px`)
      shell.style.setProperty('--hero-cloak-y', `${(currentY * 6.2 + wind.y * 0.56).toFixed(2)}px`)
      shell.style.setProperty('--hero-cloak-turn', `${(currentX * 0.18 + wind.turn * 0.31).toFixed(3)}deg`)

      shell.style.setProperty('--hero-frost-x', `${(currentX * 4.1 + wind.x * 0.22).toFixed(2)}px`)
      shell.style.setProperty('--hero-frost-y', `${(currentY * 2.5 - wind.y * 0.35).toFixed(2)}px`)
      shell.style.setProperty('--hero-glint', wind.shimmer.toFixed(3))
      shell.style.setProperty('--hero-frost-pulse', wind.frost.toFixed(3))
      shell.style.setProperty('--hero-head-turn', `${(currentX * 0.52 + rigMotion.headTurn).toFixed(3)}deg`)
      shell.style.setProperty('--hero-head-lift', `${(rigMotion.headLift - currentY * 1.25).toFixed(2)}px`)
      shell.style.setProperty('--hero-hair-front-sway', `${(currentX * 2.2 + rigMotion.hairFrontSway).toFixed(2)}px`)
      shell.style.setProperty('--hero-hair-back-shift', `${(currentY * 0.9 + rigMotion.hairBackShift).toFixed(2)}px`)
      shell.style.setProperty('--hero-hair-tail-left-turn', `${(currentX * 1.8 + rigMotion.hairTailLeftTurn).toFixed(3)}deg`)
      shell.style.setProperty('--hero-hair-tail-right-turn', `${(-currentX * 1.6 + rigMotion.hairTailRightTurn).toFixed(3)}deg`)
      shell.style.setProperty('--hero-arm-left-turn', `${(currentX * 0.8 + rigMotion.armLeftTurn).toFixed(3)}deg`)
      shell.style.setProperty('--hero-arm-right-turn', `${(-currentX * 0.74 + rigMotion.armRightTurn).toFixed(3)}deg`)
      shell.style.setProperty('--hero-cloth-front-sway', `${(currentX * 1.8 + rigMotion.clothFrontSway).toFixed(2)}px`)
      shell.style.setProperty('--hero-cloth-side-left', `${(currentX * 1.3 + rigMotion.clothSideLeft).toFixed(2)}px`)
      shell.style.setProperty('--hero-cloth-side-right', `${(-currentX * 1.24 + rigMotion.clothSideRight).toFixed(2)}px`)
      shell.style.setProperty('--hero-cloth-hem-lift', `${(rigMotion.clothHemLift + Math.abs(currentY) * 1.3).toFixed(2)}px`)
      shell.style.setProperty('--hero-object-x', `${(currentX * 1.1 + rigMotion.crystalFloatX).toFixed(2)}px`)
      shell.style.setProperty('--hero-object-y', `${(-currentY * 1.2 + rigMotion.crystalFloatY).toFixed(2)}px`)
      shell.style.setProperty('--hero-object-turn', `${(currentX * 1.1 + rigMotion.crystalTurn).toFixed(3)}deg`)
      shell.style.setProperty('--hero-aura-pulse', rigMotion.auraPulse.toFixed(3))

      frame = window.requestAnimationFrame(render)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    frame = window.requestAnimationFrame(render)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [])

  return (
    <div ref={shellRef} className="hero-media-shell" aria-hidden="true">
      <HeroSceneLayer layerClassName="hero-scene-layer-background-backdrop" pictureClassName="hero-scene-picture-background-backdrop" />
      <HeroSceneLayer layerClassName="hero-scene-layer-mid-depth-b" pictureClassName="hero-scene-picture-mid-depth-b" />
      <HeroSceneLayer layerClassName="hero-scene-layer-mid-depth-a" pictureClassName="hero-scene-picture-mid-depth-a" />
      <HeroSceneLayer layerClassName="hero-scene-layer-cave-wall-left" pictureClassName="hero-scene-picture-cave-wall-left" />
      <HeroSceneLayer layerClassName="hero-scene-layer-cave-wall-right" pictureClassName="hero-scene-picture-cave-wall-right" />
      <HeroCharacterLayer />
      <HeroAtmosphereLayer />
    </div>
  )
}
