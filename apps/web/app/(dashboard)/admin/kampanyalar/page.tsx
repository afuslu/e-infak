'use client'

/** Kampanyalar in STK PRO's layout: per-column filters and inline Ref. Tutar, Öncelik, Durum, Web/1 and Web/2. */
import { DONATION_MODE_LABEL } from '../../../../lib/donation-options'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Copy, Eye, Megaphone, MinusCircle, PauseCircle, PencilLine, PlayCircle, Plus, QrCode, Trash2 } from 'lucide-react'
import { adminGet, apiErrorMessage, downloadFile, formatMoney, v1Get, v1Send } from '../../../../lib/admin-access'
import { confirmDialog, toast } from '../../../../components/admin/ui'
import { EMPTY_SELECTION, type ListColumn, type ListSelection, ListView, RowAction, usePageSize } from '../../../../components/admin/ListView'
import { CAMPAIGN_TYPES, CAMPAIGN_TYPE_LABEL, type CampaignData, type CampaignTab } from '../../../../components/admin/campaigns/CampaignEditor'

const EMPTY: Record<string, string> = { search: '', tab_id: '', campaign_type: '', group: '', country: '', is_zakat: '', status: '', show_on_site: '' }

function Toggle({ on, onChange, label }: { on: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-6 w-11 rounded-full transition-colors ${on ? 'bg-primary-600' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'start-[22px]' : 'start-0.5'}`} />
    </button>
  )
}

/** Number box that saves when the user leaves it or presses Enter. */
function InlineNumber({ value, onSave, label, width = 'w-28' }: { value: string; onSave: (v: string) => Promise<void>; label: string; width?: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  const commit = async () => { if (draft !== value) await onSave(draft) }
  return (
    <input aria-label={label} inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={`${width} rounded-md border border-gray-200 px-2 py-1.5 text-[13px] tabular-nums outline-none focus:border-primary-500`} />
  )
}

const Mark = ({ on }: { on: boolean }) => (on
  ? <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-500" aria-label="Evet" />
  : <MinusCircle className="mx-auto h-5 w-5 text-gray-300" aria-label="Hayır" />)

export default function CampaignsPage() {
  const router = useRouter()
  const [filters, setFilters] = useState<Record<string, string>>(EMPTY)
  const [sort, setSort] = useState('display_order')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePageSize('campaigns', 25)
  const [rows, setRows] = useState<CampaignData[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selection, setSelection] = useState<ListSelection>(EMPTY_SELECTION)
  const [tabs, setTabs] = useState<CampaignTab[]>([])

  useEffect(() => { adminGet<CampaignTab[]>('/campaign-tabs').then((r) => setTabs(r.data)).catch(() => {}) }, [])

  const params = useMemo(() => {
    const p: Record<string, unknown> = { page, page_size: pageSize }
    if (filters.search) p.search = filters.search
    for (const k of ['tab_id', 'campaign_type', 'country', 'group', 'status'] as const) if (filters[k]) p[k] = filters[k]
    if (filters.is_zakat) p.is_zakat = filters.is_zakat === 'true'
    if (filters.show_on_site) p.show_on_site = filters.show_on_site === 'true'
    if (sort !== 'display_order') p.sort = sort
    return p
  }, [filters, page, pageSize, sort])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await v1Get<{ items: CampaignData[]; total: number }>('/campaigns', params)
      setRows(res.data.items)
      setTotal(res.data.total)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kampanyalar yüklenemedi'))
    } finally {
      setLoading(false)
    }
  }, [params])
  useEffect(() => { load() }, [load])

  const patch = async (c: CampaignData, body: Record<string, unknown>, ok?: string) => {
    try {
      const res = await v1Send<CampaignData>('patch', `/campaigns/${c.id}`, body)
      setRows((list) => list.map((x) => (x.id === c.id ? { ...x, ...res.data } : x)))
      if (ok) toast.ok(ok)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kaydedilemedi'))
    }
  }

  const selectedRows = () => (selection.all ? rows : rows.filter((r) => selection.ids.includes(r.id)))
  const bulk = async (body: Record<string, unknown>, label: string) => {
    const targets = selection.all
      ? (await v1Get<{ items: CampaignData[] }>('/campaigns', { ...params, page: 1, page_size: 500 })).data.items
      : selectedRows()
    const results = await Promise.allSettled(targets.map((c) => v1Send('patch', `/campaigns/${c.id}`, body)))
    const ok = results.filter((r) => r.status === 'fulfilled').length
    toast.ok(`${ok} kampanyaya "${label}" uygulandı${ok < targets.length ? `, ${targets.length - ok} kampanyada hata oldu` : ''}.`)
    setSelection(EMPTY_SELECTION)
    load()
  }

  const remove = async (c: CampaignData) => {
    if (!(await confirmDialog({ title: `"${c.title}" silinsin mi?`, text: 'Bağış almış kampanyalar silinemez; onları Pasif ya da Tamamlandı yapın.', danger: true }))) return
    try {
      await v1Send('delete', `/campaigns/${c.id}`)
      toast.ok('Kampanya silindi')
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kampanya silinemedi'))
    }
  }

  const yesNo = [{ value: 'true', label: 'Evet' }, { value: 'false', label: 'Hayır' }]
  const columns: ListColumn<CampaignData>[] = [
    {
      key: 'title', header: 'Kampanya Adı', sort: 'title', filter: { type: 'text', param: 'search' },
      render: (c) => <Link href={`/admin/kampanyalar/${c.id}`} className="whitespace-nowrap font-bold text-gray-900 hover:text-primary-700">{c.title}</Link>,
    },
    { key: 'display', header: 'Web Site Görünen Ad', render: (c) => <span className="whitespace-nowrap">{c.display_name || c.title}</span> },
    {
      key: 'tab', header: 'Kategori/Sekme', filter: { type: 'select', param: 'tab_id', options: tabs.map((t) => ({ value: t.id, label: t.name })) },
      render: (c) => tabs.find((t) => t.id === c.tab_id)?.name || '—',
    },
    {
      key: 'type', header: 'Tür', filter: { type: 'select', param: 'campaign_type', options: CAMPAIGN_TYPES.map(([k, l]) => ({ value: k, label: l })) },
      render: (c) => <span className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11.5px] font-bold uppercase">{CAMPAIGN_TYPE_LABEL[c.campaign_type] || c.campaign_type}</span>,
    },
    { key: 'declaration', header: 'Beyanname Kalemi', render: (c) => c.declaration_item || <span className="rounded-md border border-gray-200 px-1.5 py-0.5 text-[11.5px] text-gray-500">Eşlenmemiş</span> },
    { key: 'group', header: 'Kampanya Grubu', filter: { type: 'text', param: 'group' }, render: (c) => c.groups.join(', ') || '—' },
    { key: 'country', header: 'Kampanya Ülkesi', filter: { type: 'text', param: 'country' }, render: (c) => c.country || '—' },
    {
      key: 'ref', header: 'Ref. Tutar (TL)',
      render: (c) => (
        <InlineNumber label="Referans tutar (TL)" value={c.reference_amounts?.TRY ? String(c.reference_amounts.TRY / 100) : ''}
          onSave={(v) => {
            const n = Math.round(Number(v.replace(',', '.')) * 100)
            const refs = { ...c.reference_amounts }
            if (Number.isFinite(n) && n > 0) refs.TRY = n
            else delete refs.TRY
            return patch(c, { reference_amounts: refs }, 'Referans tutar kaydedildi')
          }} />
      ),
    },
    { key: 'mode', header: 'Bağış Şekli', render: (c) => DONATION_MODE_LABEL[c.donation_options?.mode || ''] || (c.fixed_amount ? 'Sabit tutar (eski)' : '—') },
    { key: 'zakat', header: 'Zekat', align: 'center', filter: { type: 'select', param: 'is_zakat', options: yesNo }, render: (c) => <Mark on={c.is_zakat} /> },
    {
      key: 'order', header: 'Öncelik', sort: 'display_order',
      render: (c) => <InlineNumber label="Öncelik" width="w-20" value={String(c.display_order ?? 0)} onSave={(v) => patch(c, { display_order: Number(v) || 0 }, 'Öncelik kaydedildi')} />,
    },
    {
      key: 'collected', header: 'Toplanan', sort: 'collected_desc', align: 'right',
      render: (c) => (
        <div className="min-w-[120px]">
          <div className="font-semibold tabular-nums text-emerald-600">{formatMoney(c.collected_cents, c.currency)}</div>
          {c.target_cents > 0 && (
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, c.progress_percentage || 0)}%` }} />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'status', header: 'Durum', filter: { type: 'select', param: 'status', options: [{ value: 'active', label: 'Aktif' }, { value: 'paused', label: 'Pasif' }, { value: 'draft', label: 'Taslak' }, { value: 'completed', label: 'Tamamlandı' }, { value: 'cancelled', label: 'İptal' }] },
      render: (c) => (c.status === 'active' || c.status === 'paused'
        ? <Toggle label="Durum" on={c.status === 'active'} onChange={(on) => patch(c, { status: on ? 'active' : 'paused' }, on ? 'Kampanya aktif' : 'Kampanya pasif')} />
        : <span className="text-[12px] font-semibold text-gray-500">{({ draft: 'Taslak', completed: 'Tamamlandı', cancelled: 'İptal' } as Record<string, string>)[c.status] || c.status}</span>),
    },
    {
      key: 'web1', header: 'Web / 1', filter: { type: 'select', param: 'show_on_site', options: yesNo },
      render: (c) => <Toggle label="Web 1: sitede listele" on={c.show_on_site} onChange={(on) => patch(c, { show_on_site: on })} />,
    },
    { key: 'web2', header: 'Web / 2', render: (c) => <Toggle label="Web 2: öne çıkar" on={!!c.is_featured} onChange={(on) => patch(c, { is_featured: on })} /> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Megaphone className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Kampanyalar</h1>
        <Link href="/admin/kampanyalar/yeni" className="ms-auto inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-primary-700">
          <Plus className="h-4 w-4" /> Yeni Kampanya
        </Link>
      </div>
      <ListView
        storageKey="campaigns"
        columns={columns}
        rows={rows}
        total={total}
        loading={loading}
        rowKey={(c) => c.id}
        page={page}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={(n) => { setPageSize(n); setPage(1) }}
        filters={filters}
        onApplyFilters={(next) => { setFilters(next); setPage(1); setSelection(EMPTY_SELECTION) }}
        sort={sort}
        direction="desc"
        onSort={(s) => { setSort(s); setPage(1) }}
        selection={selection}
        onSelection={setSelection}
        bulkActions={[
          { key: 'on', label: 'Aktif yap', icon: PlayCircle, tone: 'success', onClick: () => bulk({ status: 'active' }, 'Aktif') },
          { key: 'off', label: 'Pasif yap', icon: PauseCircle, tone: 'warning', onClick: () => bulk({ status: 'paused' }, 'Pasif') },
          { key: 'web1on', label: 'Web / 1 aç', onClick: () => bulk({ show_on_site: true }, 'Web / 1 açık') },
          { key: 'web1off', label: 'Web / 1 kapat', onClick: () => bulk({ show_on_site: false }, 'Web / 1 kapalı') },
        ]}
        rowActions={(c) => (
          <>
            <RowAction label="Sitede gör" icon={Eye} href={`/kampanyalar/${c.slug}`} />
            <RowAction label="Düzenle" icon={PencilLine} onClick={() => router.push(`/admin/kampanyalar/${c.id}`)} />
            <RowAction label="Bağlantıyı kopyala" icon={Copy} onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/kampanyalar/${c.slug}`)
                .then(() => toast.ok('Bağlantı kopyalandı'), () => toast.error('Kopyalanamadı'))
            }} />
            <RowAction label="QR afiş (PDF)" icon={QrCode} onClick={() => void downloadFile(`/admin-features/campaigns/${c.id}/qr-poster.pdf`, `${c.slug}-qr-poster.pdf`)} />
            <RowAction label="Sil" icon={Trash2} tone="danger" onClick={() => remove(c)} />
          </>
        )}
        empty="Kampanya bulunamadı"
      />
    </div>
  )
}
