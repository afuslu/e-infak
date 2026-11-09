'use client'

import { useEffect, useRef, useState } from 'react'

/** Entrance animation: content stays visible without JavaScript; with it, animates when scrolled into view. */
export function Reveal({ animation, delay, duration, children }: { animation: string; delay?: number; duration?: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'idle' | 'ready' | 'in'>('idle')
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setState('ready')
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setState('in')
        observer.disconnect()
      }
    }, { threshold: 0.12 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={ref} className={state === 'idle' ? '' : `b-anim b-anim-${animation} ${state === 'in' ? 'is-in' : ''}`}
      style={{ animationDelay: delay ? `${delay}ms` : undefined, animationDuration: duration ? `${duration}ms` : undefined }}>
      {children}
    </div>
  )
}

/** The slider lives with the site components; the builder's slider block uses the same one. */
export { Slider, type SlideView } from '../site/Slider'
