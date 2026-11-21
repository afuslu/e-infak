'use client'

/** STK PRO "Kampanya Sayfaları": each campaign's web address, whether it has its own page and when it last changed. */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Globe2, PencilLine, Eye } from 'lucide-react'
import { adminGet, apiErrorMessage } from '../../../../../lib/admin-access'
import { toast } from '../../../../../components/admin/ui'
import { type ListColumn, ListView, RowAction, usePageSize } from '../../../../../components/admin/ListView'
import { CAMPAIGN_TYPE_LABEL } from '../../../../../components/admin/campaigns/CampaignEditor'

interface PageRow {
  id: string; title: string; display_name: string; slug: string; campaign_type: string; status: string
  has_page: boolean; redirect_mode: string; redirect_target: string | null; updated_at: string
}

export default function CampaignPagesPage() {
  const [rows, setRows] = useState<PageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Record<string, string>>({ title: '', page: '', from: '', to: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePageSize('campaign-pages', 25)
  useEffect(() => {
    adminGet<PageRow[]>('/campaign-pages').then((r) => setRows(r.data)).catch((err) => toast.error(apiErrorMessage(err, 'Yüklenemedi'))).finally(() => setLoading(false))
  }, [])
  const filtered = useMemo(() => rows.filter((r) => {
    const q = filters.title.toLocaleLowerCase('tr')
    const day = r.updated_at.slice(0, 10)
    return (!q || r.title.toLocaleLowerCase('tr').includes(q) || r.slug.includes(q))
      && (!filters.page || String(r.has_page) === filters.page)
      && (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to)
  }), [rows, filters])

  const columns: ListColumn<PageRow>[] = [
    { key: 'title', header: 'Kampanya Adı', filter: { type: 'text', param: 'title' }, render: (r) => <span className="font-bold text-gray-900">{r.title}</span> },
    { key: 'display', header: 'Site Görünen Ad', render: (r) => r.display_name },
    { key: 'type', header: 'Tür', render: (r) => CAMPAIGN_TYPE_LABEL[r.campaign_type] || r.campaign_type },
    { key: 'slug', header: 'Slug (tr)', render: (r) => <span className="text-gray-500">{r.slug}</span> },
    {
      key: 'page', header: 'Sayfa', filter: { type: 'select', param: 'page', options: [{ value: 'true', label: 'Sayfası var' }, { value: 'false', label: 'Sayfası yok' }] },
      render: (r) => (r.has_page
        ? <span className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[12px] font-semibold text-emerald-700">Sayfası var</span>
        : <span className="rounded-md border border-gray-200 px-1.5 py-0.5 text-[12px] text-gray-500">{r.redirect_mode === 'own' ? 'Sayfası yok' : `Yönlendirme: ${r.redirect_target}`}</span>),
    },
    {
      key: 'updated', header: 'Son Değişiklik', filter: { type: 'daterange', from: 'from', to: 'to' },
      render: (r) => <span className="whitespace-nowrap tabular-nums">{new Date(r.updated_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</span>,
    },
  ]
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Globe2 className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Kampanya Sayfaları</h1>
      </div>
      <ListView storageKey="campaign-pages" columns={columns} rows={filtered.slice((page - 1) * pageSize, page * pageSize)} total={filtered.length}
        loading={loading} rowKey={(r) => r.id} page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1) }}
        filters={filters} onApplyFilters={(f) => { setFilters(f); setPage(1) }}
        rowActions={(r) => (
          <>
            <RowAction label="Sitede gör" icon={Eye} href={`/kampanyalar/${r.slug}`} />
            <Link href={`/admin/kampanyalar/${r.id}`} title="Sayfayı düzenle" aria-label="Sayfayı düzenle" className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"><PencilLine className="h-4 w-4" /></Link>
          </>
        )}
        empty="Kampanya yok" />
    </div>
  )
}
