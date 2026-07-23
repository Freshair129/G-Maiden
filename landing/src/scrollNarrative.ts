import { useEffect, useRef } from 'react'

export const clampUnit = (value: number) => Math.min(1, Math.max(0, value))

export const heroExitProgress = (scrollY: number, viewportHeight: number) => {
  if (viewportHeight <= 0) return 0
  return clampUnit(scrollY / viewportHeight)
}

export function useScrollNarrative() {
  const rootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const coarsePointer = window.matchMedia('(pointer: coarse)')

    const setStatic = () => {
      root?.style.setProperty('--landing-hero-progress', '0')
      root?.style.setProperty('--landing-beacon-progress', '0')
    }

    if (!root || reducedMotion.matches || coarsePointer.matches) {
      setStatic()
      return
    }

    let frame = 0
    const update = () => {
      frame = 0
      const progress = heroExitProgress(window.scrollY, window.innerHeight)
      root.style.setProperty('--landing-hero-progress', progress.toFixed(3))
      root.style.setProperty('--landing-beacon-progress', progress.toFixed(3))
    }

    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-scroll-revealed')
          observer.unobserve(entry.target)
        })
      },
      { rootMargin: '0px 0px -14% 0px', threshold: 0.18 },
    )

    root.querySelectorAll<HTMLElement>('[data-scroll-reveal]').forEach((element) => observer.observe(element))
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })

    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return rootRef
}
