'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'

/** STK PRO "Floating Logo": once the page is scrolled, the sticky header swaps to this logo. */
export function FloatingLogo({ src, children }: { src?: string | null; children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    if (!src) return
    const onScroll = () => setScrolled(window.scrollY > 80)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [src])
  if (!src || !scrolled) return <>{children}</>
  return (
    <Link href="/" className="flex min-w-0 items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-11 max-w-[200px] object-contain" />
    </Link>
  )
}
