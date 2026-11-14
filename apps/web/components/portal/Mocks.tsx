import type { ReactNode } from 'react'
import { GripVertical } from 'lucide-react'

/**
 * Small replicas of real panel screens for the landing page. They are drawn in HTML so they are
 * sharp on every screen and follow the day / night theme. All names and figures are made up.
 */

export function Frame({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div aria-hidden="true" className={`overflow-hidden rounded-2xl border border-pt-line bg-pt-card pt-shadow ${className}`}>
      <div className="flex items-center gap-2 border-b border-pt-line bg-pt-soft px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-pt-line" /><span className="h-2.5 w-2.5 rounded-full bg-pt-line" /><span className="h-2.5 w-2.5 rounded-full bg-pt-line" />
        <span className="ml-2 truncate text-[11px] font-semibold text-pt-faint">{title}</span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  )
}


export function MockBuilder() {
  return (
    <Frame title="panel · Site Yapıcı">
      <div className="grid grid-cols-5 gap-3">
        <div className="col-span-2 space-y-1.5">
          {['Slider', 'Bağış kartları', 'Sayılarla biz', 'Kurban hisse', 'Haberler'].map((block, index) => (
            <div key={block} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${index === 1 ? 'border-pt-brand bg-pt-brand-soft text-pt-brand' : 'border-pt-line bg-pt-bg text-pt-text'}`}>
              <GripVertical className="h-3 w-3 text-pt-faint" />{block}
            </div>
          ))}
        </div>
        <div className="col-span-3 space-y-2 rounded-xl border border-pt-line bg-pt-bg p-2.5">
          <div className="h-12 rounded-lg bg-pt-brand" style={{ opacity: 0.85 }} />
          <div className="grid grid-cols-3 gap-1.5">
            {[0, 1, 2].map((card) => (
              <div key={card} className="rounded-lg border border-pt-line bg-pt-card p-1.5">
                <div className="mb-1 h-6 rounded bg-pt-soft" />
                <div className="h-1.5 w-3/4 rounded bg-pt-line" />
                <div className="mt-1 h-3 rounded bg-pt-brand-soft" />
              </div>
            ))}
          </div>
          <div className="h-1.5 w-1/2 rounded bg-pt-line" /><div className="h-1.5 w-2/3 rounded bg-pt-line" />
        </div>
      </div>
    </Frame>
  )
}

/** A real panel screenshot (made-up demo data) in the day and night theme. */
export function Screenshot({ name, title, alt, priority }: { name: string; title: string; alt: string; priority?: boolean }) {
  const img = (theme: 'light' | 'dark') => (
    <img src={`/images/e-infak/screens/${name}-${theme}.webp`} alt={theme === 'light' ? alt : ''} aria-hidden={theme === 'dark' ? true : undefined}
      width={1280} height={800} loading={priority ? 'eager' : 'lazy'} decoding="async"
      className={`${theme === 'light' ? 'pt-light-only' : 'pt-dark-only'} block h-auto w-full`} />
  )
  return (
    <figure className="overflow-hidden rounded-2xl border border-pt-line bg-pt-card pt-shadow">
      <div className="flex items-center gap-2 border-b border-pt-line bg-pt-soft px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-pt-line" /><span className="h-2.5 w-2.5 rounded-full bg-pt-line" /><span className="h-2.5 w-2.5 rounded-full bg-pt-line" />
        <span className="ml-2 truncate text-[11px] font-semibold text-pt-faint">{title}</span>
      </div>
      {img('light')}
      {img('dark')}
    </figure>
  )
}
