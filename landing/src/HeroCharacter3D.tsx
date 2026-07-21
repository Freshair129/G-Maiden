import { useEffect, useRef, useState } from 'react'

const MODEL_URL = '/assets/hero/gmaiden-ice-mage-landing-hero-v1.glb'
const FALLBACK_URL = '/assets/hero/gmaiden-ice-mage-landing-fallback-v1.webp'

function canUseInteractiveScene() {
  if (!window.matchMedia('(pointer: fine)').matches) return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false

  const probe = document.createElement('canvas')
  return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'))
}

export default function HeroCharacter3D() {
  const mountRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || !canUseInteractiveScene()) return

    let disposed = false
    let frame = 0
    let removeSceneListeners = () => undefined

    void (async () => {
      const THREE = await import('three')
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      if (disposed) return

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100)
      camera.position.set(0, 1.03, 4.35)

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.05
      renderer.domElement.className = 'hero-character-canvas'
      renderer.domElement.setAttribute('aria-hidden', 'true')
      mount.appendChild(renderer.domElement)

      scene.add(new THREE.HemisphereLight(0xb9e8ff, 0x06111f, 2.3))
      const key = new THREE.DirectionalLight(0xffdcc7, 4.2)
      key.position.set(2.4, 3.6, 4.2)
      scene.add(key)
      const rim = new THREE.DirectionalLight(0x3c9dff, 5.0)
      rim.position.set(-3.2, 2.3, -2.0)
      scene.add(rim)

      const loader = new GLTFLoader()
      const gltf = await loader.loadAsync(MODEL_URL)
      if (disposed) {
        renderer.dispose()
        return
      }

      const character = gltf.scene
      const bounds = new THREE.Box3().setFromObject(character)
      const size = bounds.getSize(new THREE.Vector3())
      const center = bounds.getCenter(new THREE.Vector3())
      const fitScale = 2.08 / Math.max(size.y, 0.01)
      character.scale.setScalar(fitScale)
      character.position.set(-center.x * fitScale, -center.y * fitScale + 1.03, -center.z * fitScale)
      character.rotation.y = -0.08
      scene.add(character)

      const mixer = gltf.animations.length > 0 ? new THREE.AnimationMixer(character) : null
      if (mixer) mixer.clipAction(gltf.animations[0]).play()

      const timer = new THREE.Timer()
      timer.connect(document)
      const pointer = new THREE.Vector2()
      const pointerTarget = new THREE.Vector2()
      let scrollProgress = 0
      let visible = true

      const resize = () => {
        const rect = mount.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return
        camera.aspect = rect.width / rect.height
        camera.updateProjectionMatrix()
        renderer.setSize(rect.width, rect.height, false)
      }
      const onPointerMove = (event: PointerEvent) => {
        pointerTarget.x = (event.clientX / window.innerWidth - 0.5) * 2
        pointerTarget.y = (event.clientY / window.innerHeight - 0.5) * 2
      }
      const onScroll = () => {
        scrollProgress = Math.min(window.scrollY / Math.max(window.innerHeight, 1), 1)
      }
      const resizeObserver = new ResizeObserver(resize)
      const visibilityObserver = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting
      })
      resizeObserver.observe(mount)
      visibilityObserver.observe(mount)
      window.addEventListener('pointermove', onPointerMove, { passive: true })
      window.addEventListener('scroll', onScroll, { passive: true })
      resize()
      onScroll()

      removeSceneListeners = () => {
        resizeObserver.disconnect()
        visibilityObserver.disconnect()
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('scroll', onScroll)
      }

      const render = (timestamp: number) => {
        frame = window.requestAnimationFrame(render)
        if (!visible) return
        timer.update(timestamp)
        const delta = Math.min(timer.getDelta(), 0.05)
        mixer?.update(delta)
        pointer.lerp(pointerTarget, 0.055)
        character.rotation.y = -0.08 + pointer.x * 0.12 + scrollProgress * 0.18
        character.rotation.x = pointer.y * 0.025
        character.position.y = -center.y * fitScale + 1.03 + pointer.y * -0.025 - scrollProgress * 0.18
        camera.position.x = pointer.x * 0.08
        camera.lookAt(0, 1.03, 0)
        renderer.render(scene, camera)
      }
      render(performance.now())
      setReady(true)

      removeSceneListeners = (() => {
        const removeListeners = removeSceneListeners
        return () => {
          removeListeners()
          timer.dispose()
          mixer?.stopAllAction()
          character.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return
            object.geometry.dispose()
            const materials = Array.isArray(object.material) ? object.material : [object.material]
            for (const material of materials) material.dispose()
          })
          renderer.dispose()
          renderer.domElement.remove()
        }
      })()
    })().catch(() => {
      if (!disposed) setReady(false)
    })

    return () => {
      disposed = true
      window.cancelAnimationFrame(frame)
      removeSceneListeners()
    }
  }, [])

  return (
    <div ref={mountRef} className="hero-character-shell" data-model-ready={ready ? 'true' : 'false'} aria-hidden="true">
      <img
        className={`hero-character-fallback ${ready ? 'is-hidden' : ''}`}
        src={FALLBACK_URL}
        alt=""
        decoding="async"
        fetchPriority="high"
      />
      <div className="hero-character-aura" />
    </div>
  )
}
