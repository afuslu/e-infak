'use client'

import { useState } from 'react'
import type { DemoOptions, LibraryDemo } from './LibraryPanel'

const GOALS: Array<{ key: string; icon: string; title: string; subtitle: string; match: RegExp }> = [
  { key: 'water', icon: '💧', title: 'Su Kuyusu & Kalıcı Eser', subtitle: 'Afrika/Asya su kuyuları, mescid ve kalıcı eserler', match: /su|kuyu|zeytin|endulus/i },
  { key: 'urgent', icon: '🚑', title: 'Acil İnsani Yardım & Kriz', subtitle: 'Gazze, afet, gıda kolisi ve hızlı acil bağış', match: /acil|kriz|gazze|kudus|kis/i },
  { key: 'ramadan', icon: '🕌', title: 'Ramazan, Kurban & Vakıf', subtitle: 'İftar, fitre, zekat, adak ve akika organizasyonu', match: /ramazan|kurban|altin|osmanli|ilim/i },
  { key: 'orphan', icon: '🎓', title: 'Yetim Hâmiliği & Eğitim', subtitle: 'Yetim sponsorluğu, burs ve hafızlık desteği', match: /yetim|egitim|vefa/i },
  { key: 'corporate', icon: '🏛️', title: 'Kurumsal & Şeffaf Vakıf', subtitle: 'Mali şeffaflık, denetim raporları ve KSS iş birlikleri', match: /kurumsal|safir|seffaf|minimal|uluslararasi/i },
]

export function QuickSetupWizard({
  demos,
  onApplyDemo,
  onClose,
}: {
  demos: LibraryDemo[]
  onApplyDemo: (demo: LibraryDemo, options: DemoOptions) => Promise<void>
  onClose: () => void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [goalKey, setGoalKey] = useState<string>('water')
  const [selectedDemo, setSelectedDemo] = useState<LibraryDemo | null>(null)
  const [options, setOptions] = useState<DemoOptions>({ apply_theme: true, include_pages: true, publish: false })
  const [busy, setBusy] = useState(false)

  const goal = GOALS.find((g) => g.key === goalKey) || GOALS[0]
  const matchingDemos = demos.filter((d) => goal.match.test(`${d.key} ${d.label} ${d.description}`))
  const candidates = matchingDemos.length ? matchingDemos : demos.slice(0, 6)
  const chosen = selectedDemo && candidates.some((d) => d.key === selectedDemo.key) ? selectedDemo : candidates[0] || demos[0]

  const finish = async () => {
    if (!chosen || busy) return
    setBusy(true)
    try {
      await onApplyDemo(chosen, options)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs" onClick={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4 text-white">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-100">Adım {step} / 3</div>
            <h3 className="text-base font-bold">Hızlı Site Kurulum Sihirbazı</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white">✕</button>
        </div>

        <div className="p-6">
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-800">1. Kurumunuzun ana odak alanını seçin:</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {GOALS.map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => { setGoalKey(g.key); setSelectedDemo(null) }}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                      goalKey === g.key ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-100' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-2xl">{g.icon}</span>
                    <div>
                      <div className="text-xs font-bold text-gray-900">{g.title}</div>
                      <div className="mt-0.5 text-[11px] text-gray-500">{g.subtitle}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-800">2. Size özel önerilen site tasarımını seçin:</p>
              <div className="grid max-h-80 grid-cols-1 gap-2.5 overflow-y-auto pe-1 sm:grid-cols-2">
                {candidates.map((d) => {
                  const active = chosen?.key === d.key
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => setSelectedDemo(d)}
                      className={`overflow-hidden rounded-xl border text-left transition ${
                        active ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-100' : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      {d.image && (
                        <div className="h-24 w-full overflow-hidden bg-gray-100">
                          <img src={d.image} alt={d.label} className="h-full w-full object-cover" />
                        </div>
                      )}
                      <div className="p-2.5">
                        <div className="text-xs font-bold text-gray-900">{d.label}</div>
                        <div className="mt-0.5 line-clamp-2 text-[11px] text-gray-500">{d.description}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {step === 3 && chosen && (
            <div className="space-y-4">
              <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-blue-700">Seçilen Tasarım</div>
                <div className="mt-1 text-base font-bold text-gray-900">{chosen.label}</div>
                <p className="mt-1 text-xs text-gray-600">{chosen.description}</p>
                {chosen.pages.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {chosen.pages.map((p) => (
                      <span key={p} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-700 shadow-2xs">+ {p}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2 rounded-xl border p-4 text-xs text-gray-700">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={options.apply_theme} onChange={(e) => setOptions((o) => ({ ...o, apply_theme: e.target.checked }))} />
                  <span>Tema renklerini ve yazı tiplerini uygula</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={options.include_pages} onChange={(e) => setOptions((o) => ({ ...o, include_pages: e.target.checked }))} />
                  <span>Önerilen alt sayfaları otomatik oluştur (mevcut sayfalara dokunmaz)</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={options.publish} onChange={(e) => setOptions((o) => ({ ...o, publish: e.target.checked }))} />
                  <span>Kurulumdan sonra hemen canlıya yayınla (işaretlenmezse taslak kalır)</span>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t bg-gray-50 px-6 py-3.5">
          <button
            type="button"
            onClick={() => (step > 1 ? setStep((s) => (s - 1) as 1 | 2 | 3) : onClose())}
            className="rounded-lg border bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
          >
            {step === 1 ? 'Vazgeç' : '← Geri'}
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Devam →
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !chosen}
              onClick={finish}
              className="rounded-lg bg-emerald-600 px-5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? 'Kuruluyor…' : '✨ Siteyi Tek Tıkla Kur'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
