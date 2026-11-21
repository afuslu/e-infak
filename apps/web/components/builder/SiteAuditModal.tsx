'use client'

import { useMemo } from 'react'
import type { Block, BuilderCatalog } from '../../lib/blocks'

export interface AuditIssue {
  id: string
  blockId: string
  blockLabel: string
  severity: 'error' | 'warn' | 'info'
  title: string
  detail: string
}

function runAudit(blocks: Block[], catalog: BuilderCatalog, pageKind: string): AuditIssue[] {
  const issues: AuditIssue[] = []
  let hasH1 = false
  let hasDonateLink = false

  const walk = (list: Block[]) => {
    for (const b of list) {
      const label = catalog.blocks[b.type]?.label || b.type
      const p = b.props || {}
      const adv = b.advanced || {}

      if (adv.hide_desktop && adv.hide_tablet && adv.hide_mobile) {
        issues.push({
          id: `${b.id}-hidden-all`,
          blockId: b.id,
          blockLabel: label,
          severity: 'warn',
          title: 'Blok tüm cihazlarda gizli',
          detail: 'Masaüstü, tablet ve telefonda gizlendiği için ziyaretçiler bu bloğu hiç göremez.',
        })
      }

      if (b.type === 'heading' && p.level === 'h1') hasH1 = true
      if ((b.type === 'hero' || b.type === 'slider' || b.type === 'banner') && (p.title || (Array.isArray(p.slides) && p.slides.some((s: any) => s?.title)))) {
        hasH1 = true
      }

      // Check title length
      if (typeof p.title === 'string' && p.title.length > 95) {
        issues.push({
          id: `${b.id}-long-title`,
          blockId: b.id,
          blockLabel: label,
          severity: 'info',
          title: 'Başlık çok uzun',
          detail: `Başlık ${p.title.length} karakter. Mobilde ve SEO'da 80 karakter altı önerilir.`,
        })
      }

      // Check image alt
      if ((b.type === 'image' || b.type === 'image_text') && p.image_url && !String(p.alt || '').trim()) {
        issues.push({
          id: `${b.id}-alt`,
          blockId: b.id,
          blockLabel: label,
          severity: 'warn',
          title: 'Görsel alt metni eksik',
          detail: 'SEO ve erişilebilirlik için görsele açıklayıcı bir alt metin ekleyin.',
        })
      }

      // Check broken/empty button URLs
      const urlFields: Array<[string, unknown, unknown]> = [
        ['Ana buton', p.button_label, p.button_url],
        ['İkinci buton', p.button2_label, p.button2_url],
        ['CTA butonu', p.cta_label, p.cta_url],
      ]
      for (const [name, lbl, url] of urlFields) {
        if (lbl) {
          const u = String(url || '').trim()
          if (!u || u === '#') {
            issues.push({
              id: `${b.id}-url-${name}`,
              blockId: b.id,
              blockLabel: label,
              severity: 'error',
              title: `${name} bağlantısı boş veya "#"`,
              detail: `"${String(lbl)}" butonunun geçerli bir hedef bağlantısı yok.`,
            })
          } else if (/kampanya|bagis|donate/i.test(u)) {
            hasDonateLink = true
          }
        }
      }

      if (b.type === 'buttons' && Array.isArray(p.items)) {
        p.items.forEach((it: any, idx: number) => {
          const u = String(it?.url || '').trim()
          if (it?.label && (!u || u === '#')) {
            issues.push({
              id: `${b.id}-btn-${idx}`,
              blockId: b.id,
              blockLabel: label,
              severity: 'error',
              title: `Buton #${idx + 1} bağlantısı eksik`,
              detail: `"${it.label}" butonu için geçerli bir URL girin.`,
            })
          }
          if (/kampanya|bagis|donate/i.test(u)) hasDonateLink = true
        })
      }

      if (b.type === 'donation_cards' || b.type === 'quick_donation' || b.type === 'campaigns' || b.type === 'donate_button') {
        hasDonateLink = true
      }

      if (b.type === 'richtext' && !String(p.text || '').replace(/<[^>]+>/g, '').trim()) {
        issues.push({
          id: `${b.id}-empty-text`,
          blockId: b.id,
          blockLabel: label,
          severity: 'warn',
          title: 'Boş metin bloğu',
          detail: 'İçeriği boş kalan metin bloğunu doldurun veya silin.',
        })
      }

      if (b.children?.length) walk(b.children)
    }
  }

  walk(blocks)

  if ((pageKind === 'home' || pageKind === 'page') && blocks.length > 0 && !hasH1) {
    issues.unshift({
      id: 'page-no-h1',
      blockId: blocks[0].id,
      blockLabel: 'Sayfa Geneli',
      severity: 'warn',
      title: 'Ana başlık (H1 / Kapak) bulunamadı',
      detail: 'SEO açısından her sayfada en az bir ana başlık veya kapak bloğu bulunması önerilir.',
    })
  }
  if (pageKind === 'home' && blocks.length > 0 && !hasDonateLink) {
    issues.push({
      id: 'home-no-donate',
      blockId: blocks[0].id,
      blockLabel: 'Ana Sayfa',
      severity: 'info',
      title: 'Doğrudan bağış çağrısı tespit edilmedi',
      detail: 'Ana sayfada en az bir bağış kartı, kampanya listesi veya bağış butonu bulunması dönüşümü artırır.',
    })
  }

  return issues
}

export function SiteAuditModal({
  blocks,
  catalog,
  pageKind,
  onSelectBlock,
  onClose,
  onPublish,
}: {
  blocks: Block[]
  catalog: BuilderCatalog
  pageKind: string
  onSelectBlock: (id: string) => void
  onClose: () => void
  onPublish?: () => void
}) {
  const issues = useMemo(() => runAudit(blocks, catalog, pageKind), [blocks, catalog, pageKind])
  const errCount = issues.filter((i) => i.severity === 'error').length
  const warnCount = issues.filter((i) => i.severity === 'warn').length
  const score = Math.max(0, 100 - errCount * 15 - warnCount * 7 - (issues.length - errCount - warnCount) * 3)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-gray-900">Yayın Öncesi Kalite & SEO Kontrolü</h3>
            <p className="text-xs text-gray-500">Bağlantılar, erişilebilirlik, SEO ve görünürlük taraması</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">✕</button>
        </div>

        <div className="p-5">
          <div className="mb-4 flex items-center justify-between rounded-xl border bg-gray-50 p-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sayfa Kalite Skoru</div>
              <div className="mt-0.5 text-xs text-gray-600">
                {issues.length === 0 ? 'Harika! Hiçbir sorun bulunamadı.' : `${errCount} kritik, ${warnCount} uyarı, ${issues.length - errCount - warnCount} öneri`}
              </div>
            </div>
            <div className={`flex h-14 w-14 items-center justify-center rounded-full text-lg font-extrabold ${
              score >= 90 ? 'bg-emerald-100 text-emerald-800' : score >= 70 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
            }`}>
              {score}
            </div>
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto pe-1">
            {issues.length === 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm font-medium text-emerald-800">
                ✓ Tüm bağlantılar, başlıklar ve görseller yayına hazır görünüyor.
              </div>
            ) : issues.map((issue) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => { onSelectBlock(issue.blockId); onClose() }}
                className="flex w-full items-start gap-2.5 rounded-xl border bg-white p-3 text-left transition hover:border-blue-400 hover:bg-blue-50/50"
              >
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  issue.severity === 'error' ? 'bg-red-100 text-red-700' : issue.severity === 'warn' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-700'
                }`}>
                  {issue.severity === 'error' ? 'Kritik' : issue.severity === 'warn' ? 'Uyarı' : 'Öneri'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-gray-900">{issue.title}</span>
                    <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{issue.blockLabel}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-gray-600">{issue.detail}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t bg-gray-50 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100">
            Kapat
          </button>
          {onPublish && (
            <button
              type="button"
              onClick={() => { onClose(); onPublish() }}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Yine de Yayınla
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
