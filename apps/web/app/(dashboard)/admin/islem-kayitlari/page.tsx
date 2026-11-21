'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Activity, ClipboardList, Eye, Filter, RefreshCw, Search, ShieldCheck, X } from 'lucide-react'
import { Button, Card, Input } from '@e-infak/ui'
import { adminGet, apiErrorMessage } from '../../../../lib/admin-access'
import { Label, inputClass } from '../../../../components/admin/FormKit'
import { AppPageHeader, GlobalStatCard } from '../../../../components/admin/muhasebe/OnMuhasebeUI'
import { EmptyState, ExportButtons, Modal, Pagination, TBody, THead, Table, Td, Th, Tr, toast } from '../../../../components/admin/ui'

interface Row {
  id: string
  action: string
  label: string
  details: Record<string, unknown>
  user: string
  created_at: string
  donor_id: string | null
}
interface Staff {
  id: string
  first_name: string
  last_name: string
}

const PAGE = 50
const HIDDEN = new Set(['donor_id', 'donation_id', 'staff_role_id', 'batch_id', 'transfer_id', 'old_permissions', 'new_permissions'])
const summary = (details: Record<string, unknown>) =>
  Object.entries(details)
    .filter(([k, v]) => !HIDDEN.has(k) && v !== null && v !== '' && typeof v !== 'object')
    .slice(0, 5)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
    .join(' · ')

function actionBadgeClass(action: string): string {
  const a = action.toLowerCase()
  if (/delete|remove|cancel|revoke|reject|block/.test(a)) return 'bg-rose-50 text-rose-700 border-rose-200'
  if (/create|add|approve|issue|verify/.test(a)) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (/update|edit|set|change|plan/.test(a)) return 'bg-blue-50 text-blue-700 border-blue-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

/** e-Infak "Loglar": who did what, when. */
export default function ActivityLogPage() {
  const [data, setData] = useState<{ items: Row[]; total: number; actions: { key: string; label: string }[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState<Staff[]>([])
  const [filters, setFilters] = useState({ user_id: '', action: '', q: '', date_from: '', date_to: '', requests: '' })
  const [page, setPage] = useState(1)
  const [detailRow, setDetailRow] = useState<Row | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
      const res = await adminGet<{ items: Row[]; total: number; actions: { key: string; label: string }[] }>('/activity-logs', {
        ...params,
        page,
        page_size: PAGE,
      })
      setData(res.data)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kayıtlar yüklenemedi'))
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      load()
      return
    }
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  useEffect(() => {
    adminGet<Staff[]>('/users')
      .then((r) => setStaff(r.data))
      .catch(() => {})
  }, [])

  const set = (key: keyof typeof filters, value: string) => {
    setPage(1)
    setFilters((f) => ({ ...f, [key]: value }))
  }

  const hasFilters = Boolean(filters.user_id || filters.action || filters.q || filters.date_from || filters.date_to || filters.requests)

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Güvenlik & Denetim"
        title="İşlem Kayıtları"
        meta="Panelde yapılan kritik işlemler: makbuz, bağışçı, SMS, rol, yetki ve sistem ayar değişiklikleri."
        icon={<ClipboardList className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            {data && data.items.length > 0 && (
              <ExportButtons
                filename="islem-kayitlari"
                title="İşlem Kayıtları"
                subtitle={`Toplam ${data.total} kayıt (sayfa ${page})`}
                getData={() => ({
                  headers: ['Tarih', 'İşlem', 'Ayrıntı', 'Yapan'],
                  rows: data.items.map((r) => [
                    new Date(r.created_at).toLocaleString('tr-TR'),
                    r.label,
                    summary(r.details) || '—',
                    r.user,
                  ]),
                })}
              />
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <GlobalStatCard
          title="Toplam İşlem Kaydı"
          value={data ? data.total : '—'}
          subtitle="Filtreye uyan denetim logu"
          gradient="from-slate-600 to-slate-800"
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <GlobalStatCard
          title="Kayıtlı İşlem Türü"
          value={data ? data.actions.length : '—'}
          subtitle="İzlenen farklı işlem kategorisi"
          gradient="from-blue-500 to-indigo-600"
          icon={<Filter className="h-4 w-4" />}
        />
        <GlobalStatCard
          title="Denetim Kapsamı"
          value={filters.requests ? 'Tam İstek Logu' : 'Kritik İşlemler'}
          subtitle={filters.requests ? 'Tüm POST/PUT istekleri dahil' : 'Yalnızca ana işlem kayıtları'}
          gradient={filters.requests ? 'from-amber-500 to-orange-600' : 'from-emerald-500 to-teal-600'}
          icon={filters.requests ? <Activity className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        />
      </div>

      <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={!!filters.requests} onChange={(e) => set('requests', e.target.checked ? 'true' : '')} />
            Sistem istek kayıtlarını da göster (her POST/PUT isteği)
          </label>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPage(1)
                setFilters({ user_id: '', action: '', q: '', date_from: '', date_to: '', requests: '' })
              }}
            >
              <X className="h-3.5 w-3.5" />
              Filtreleri Temizle
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-5">
          <Label label="Arama">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-8"
                placeholder="Makbuz no, ad…"
                value={filters.q}
                onChange={(e) => set('q', e.target.value)}
              />
            </div>
          </Label>
          <Label label="İşlem Türü">
            <select className={inputClass} value={filters.action} onChange={(e) => set('action', e.target.value)}>
              <option value="">Tüm işlemler</option>
              {data?.actions.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </Label>
          <Label label="Personel">
            <select className={inputClass} value={filters.user_id} onChange={(e) => set('user_id', e.target.value)}>
              <option value="">Tüm personel</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.first_name} {s.last_name}
                </option>
              ))}
            </select>
          </Label>
          <Label label="Başlangıç Tarihi">
            <Input type="date" aria-label="Başlangıç" value={filters.date_from} onChange={(e) => set('date_from', e.target.value)} />
          </Label>
          <Label label="Bitiş Tarihi">
            <Input type="date" aria-label="Bitiş" value={filters.date_to} onChange={(e) => set('date_to', e.target.value)} />
          </Label>
        </div>

        {loading && !data ? (
          <div className="space-y-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="İşlem kaydı bulunamadı"
            text={hasFilters ? 'Seçili filtrelere uyan işlem kaydı yok. Filtreleri temizleyip tekrar deneyin.' : 'Henüz kayıtlı işlem logu bulunmuyor.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Tarih</Th>
                  <Th>İşlem</Th>
                  <Th>Ayrıntı</Th>
                  <Th>Yapan</Th>
                  <Th className="text-right">İncele</Th>
                </Tr>
              </THead>
              <TBody>
                {data.items.map((r) => (
                  <Tr key={r.id} className="hover:bg-slate-50/70">
                    <Td className="whitespace-nowrap text-xs text-slate-500">{new Date(r.created_at).toLocaleString('tr-TR')}</Td>
                    <Td>
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${actionBadgeClass(r.action)}`}>
                        {r.label}
                      </span>
                    </Td>
                    <Td className="max-w-xl text-xs text-slate-600">
                      {summary(r.details) || '—'}
                      {r.donor_id && (
                        <Link href={`/admin/bagiscilar/${r.donor_id}`} className="ml-2 font-bold text-emerald-700 hover:underline">
                          Bağışçı kartı
                        </Link>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-xs font-semibold text-slate-700">{r.user}</Td>
                    <Td className="text-right">
                      <Button type="button" variant="secondary" size="sm" onClick={() => setDetailRow(r)}>
                        <Eye className="h-3.5 w-3.5" /> Detay
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}

        {data && <Pagination page={page} pages={Math.max(1, Math.ceil(data.total / PAGE))} total={data.total} onChange={setPage} />}
      </Card>

      {detailRow && (
        <Modal
          title={detailRow.label}
          description={`${new Date(detailRow.created_at).toLocaleString('tr-TR')} · ${detailRow.user}`}
          size="md"
          onClose={() => setDetailRow(null)}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full border px-2.5 py-0.5 font-bold ${actionBadgeClass(detailRow.action)}`}>
                {detailRow.action}
              </span>
              {detailRow.donor_id && (
                <Link
                  href={`/admin/bagiscilar/${detailRow.donor_id}`}
                  className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-bold text-emerald-700 hover:underline"
                >
                  Bağışçı Kartına Git →
                </Link>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-bold text-slate-700">İşlem Ayrıntıları (JSON)</p>
              <pre className="max-h-80 overflow-auto rounded-xl bg-slate-900 p-4 font-mono text-[11px] leading-relaxed text-slate-100">
                {JSON.stringify(detailRow.details, null, 2)}
              </pre>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={() => setDetailRow(null)}>
                Kapat
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
