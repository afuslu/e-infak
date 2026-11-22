'use client'

/** STK PRO Destek → "Yenilikler": release notes with a filter and a per-user "faydalı" reaction. */
import { useEffect, useState } from 'react'
import { Sparkles, ThumbsUp } from 'lucide-react'
import { Modal } from '../../../../components/admin/ui'
import { RELEASES, type Release } from '../../../../components/admin/changelog'

const LIKES = 'einfak-yenilikler-begeni'
const AREAS = ['Tümü', 'Panel', 'Entegrasyonlar', 'Web Sitesi'] as const

export default function ReleaseNotesPage() {
  const [area, setArea] = useState<(typeof AREAS)[number]>('Tümü')
  const [open, setOpen] = useState<Release | null>(null)
  const [likes, setLikes] = useState<string[]>([])
  useEffect(() => { try { setLikes(JSON.parse(localStorage.getItem(LIKES) || '[]')) } catch { /* ignore */ } }, [])
  const toggle = (id: string) => setLikes((cur) => {
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    try { localStorage.setItem(LIKES, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })
  const shown = RELEASES.filter((r) => area === 'Tümü' || r.area === area)
  const day = (iso: string) => new Date(`${iso}T12:00:00`)
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Sparkles className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Yenilikler</h1>
      </div>
      <p className="text-center text-[14px] text-gray-500">Panelde yapılan son güncellemeler, iyileştirmeler ve düzeltmeler.</p>
      <div className="flex justify-center gap-1.5">
        {AREAS.map((a) => (
          <button key={a} type="button" onClick={() => setArea(a)} aria-pressed={area === a}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold ${area === a ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{a}</button>
        ))}
      </div>
      <ol className="mx-auto max-w-4xl space-y-5">
        {shown.map((r) => (
          <li key={r.id} className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <div className="pt-4 text-right max-sm:text-left">
              <div className="text-[15px] font-bold text-gray-800">{day(r.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              <div className="text-[12.5px] text-gray-400">{day(r.date).toLocaleDateString('tr-TR', { weekday: 'long' })}</div>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5">
              <span className="rounded-md bg-primary-50 px-2 py-0.5 text-[12px] font-semibold text-primary-700">{r.area}</span>
              <h2 className="mt-2 text-[18px] font-bold text-gray-900">{r.title}</h2>
              <p className="mt-1 text-[14px] text-gray-600">{r.summary}</p>
              <div className="mt-3 flex items-center">
                <button type="button" onClick={() => setOpen(r)} className="text-[13.5px] font-semibold text-gray-900 hover:text-primary-700">Detayları oku →</button>
                <button type="button" onClick={() => toggle(r.id)} aria-pressed={likes.includes(r.id)} title="Faydalı buldum"
                  className={`ms-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12.5px] ${likes.includes(r.id) ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  <ThumbsUp className="h-3.5 w-3.5" /> Faydalı
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {open && (
        <Modal title={open.title} description={open.summary} size="lg" onClose={() => setOpen(null)}>
          <div className="space-y-5">
            {open.items.map((it) => (
              <section key={it.heading}>
                <h3 className="text-[16px] font-bold text-gray-900">{it.heading}</h3>
                <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-gray-400">{it.path}</div>
                <ul className="list-disc space-y-1 ps-5 text-[14px] text-gray-700">{it.points.map((p) => <li key={p}>{p}</li>)}</ul>
              </section>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
