'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Globe, History, Laptop, LogOut, Monitor, RefreshCw, ShieldCheck, Smartphone, X } from 'lucide-react'
import { Button, Card, Input } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import { Label, inputClass } from '../../../../components/admin/FormKit'
import { AppPageHeader, GlobalStatCard } from '../../../../components/admin/muhasebe/OnMuhasebeUI'
import { EmptyState, ExportButtons, Pagination, TBody, THead, Table, Td, Th, Tr, confirmDialog, toast } from '../../../../components/admin/ui'

interface Row {
  id: string
  user_id: string
  name: string
  email: string
  ip: string | null
  user_agent: string | null
  created_at: string
  active: boolean
}
interface Staff {
  id: string
  first_name: string
  last_name: string
}

const PAGE = 50
const when = (iso: string) => new Date(iso).toLocaleString('tr-TR')

function parseDevice(ua: string | null): { label: string; isMobile: boolean } {
  if (!ua) return { label: '—', isMobile: false }
  const isMobile = /Mobile|Android|iPhone|iPad/.test(ua)
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS/.test(ua)
          ? 'Mac'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Bilgisayar'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua) && !/Chromium/.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua) && !/Chrome\//.test(ua)
          ? 'Safari'
          : null
  return { label: browser ? `${os} · ${browser}` : os, isMobile }
}

/** STK PRO's "Kullanıcı Giriş Logları". */
export default function LoginLogsPage() {
  const [data, setData] = useState<{ items: Row[]; total: number; open_sessions: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState<Staff[]>([])
  const [filters, setFilters] = useState({ user_id: '', ip: '', date_from: '', date_to: '' })
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
      const res = await adminGet<{ items: Row[]; total: number; open_sessions: number }>('/login-logs', {
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

  const endSessions = async (userId?: string) => {
    const ok = await confirmDialog({
      title: userId
        ? 'Bu personelin kayıtlı oturumları kapatılsın mı?'
        : 'Sizin dışınızdaki herkesin kayıtlı oturumları kapatılsın mı?',
      text: 'Kişiler bir sonraki işlemde yeniden giriş yapmak zorunda kalır.',
      confirmLabel: 'Oturumları Kapat',
      danger: true,
    })
    if (!ok) return
    try {
      const res = await adminSend<{ ended: number }>('post', `/login-logs/end-sessions${userId ? `?user_id=${userId}` : ''}`)
      toast.ok(`${res.data.ended} oturum kapatıldı`)
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const set = (key: keyof typeof filters, value: string) => {
    setPage(1)
    setFilters((f) => ({ ...f, [key]: value }))
  }

  const visibleItems = useMemo(() => {
    const items = data?.items || []
    return onlyOpen ? items.filter((r) => r.active) : items
  }, [data, onlyOpen])

  const uniqueIps = useMemo(() => {
    const s = new Set((data?.items || []).map((r) => r.ip).filter(Boolean))
    return s.size
  }, [data])

  const hasFilters = Boolean(filters.user_id || filters.ip || filters.date_from || filters.date_to || onlyOpen)

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Güvenlik & Denetim"
        title="Giriş Kayıtları"
        meta="Personelin panele giriş zamanı, IP adresi, cihaz/tarayıcı bilgisi ve aktif oturum kontrolü."
        icon={<History className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            {data && data.items.length > 0 && (
              <ExportButtons
                filename="giris-kayitlari"
                title="Giriş Kayıtları"
                subtitle={`Toplam ${data.total} kayıt (sayfa ${page})`}
                getData={() => ({
                  headers: ['Personel', 'E-posta', 'Zaman', 'IP', 'Cihaz', 'Oturum'],
                  rows: visibleItems.map((r) => [
                    r.name,
                    r.email,
                    when(r.created_at),
                    r.ip || '—',
                    parseDevice(r.user_agent).label,
                    r.active ? 'Açık' : 'Kapalı',
                  ]),
                })}
              />
            )}
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={!data || data.open_sessions === 0}
              onClick={() => endSessions()}
            >
              <LogOut className="h-3.5 w-3.5" />
              Kayıtlı Oturumları Kapat{data ? ` (${data.open_sessions})` : ''}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <GlobalStatCard
          title="Toplam Giriş Kaydı"
          value={data ? data.total : '—'}
          subtitle="Filtrelenen toplam log"
          gradient="from-slate-600 to-slate-800"
          icon={<History className="h-4 w-4" />}
        />
        <GlobalStatCard
          title="Açık Oturumlar"
          value={data ? data.open_sessions : '—'}
          subtitle="Şu an geçerli oturum"
          gradient={data && data.open_sessions > 0 ? 'from-emerald-500 to-teal-600' : 'from-slate-500 to-slate-700'}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <GlobalStatCard
          title="Farklı IP (Bu Sayfa)"
          value={data ? uniqueIps : '—'}
          subtitle="Son 50 kayıttaki benzersiz IP"
          gradient="from-blue-500 to-indigo-600"
          icon={<Globe className="h-4 w-4" />}
        />
      </div>

      <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOnlyOpen(false)}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-bold transition ${
                !onlyOpen ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              Tümü
            </button>
            <button
              type="button"
              onClick={() => setOnlyOpen(true)}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-bold transition ${
                onlyOpen ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              Yalnızca Açık Oturumlar
            </button>
          </div>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPage(1)
                setFilters({ user_id: '', ip: '', date_from: '', date_to: '' })
                setOnlyOpen(false)
              }}
            >
              <X className="h-3.5 w-3.5" />
              Filtreleri Temizle
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
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
          <Label label="IP Adresi">
            <Input placeholder="IP ara…" value={filters.ip} onChange={(e) => set('ip', e.target.value)} />
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
        ) : visibleItems.length === 0 ? (
          <EmptyState
            icon={Monitor}
            title="Giriş kaydı bulunamadı"
            text={hasFilters ? 'Seçili filtrelere uyan giriş kaydı yok. Filtreleri temizleyip tekrar deneyin.' : 'Henüz kayıtlı giriş logu bulunmuyor.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Personel</Th>
                  <Th>Zaman</Th>
                  <Th>IP Adresi</Th>
                  <Th>Cihaz / Tarayıcı</Th>
                  <Th>Oturum</Th>
                  <Th className="text-right">İşlem</Th>
                </Tr>
              </THead>
              <TBody>
                {visibleItems.map((r) => {
                  const dev = parseDevice(r.user_agent)
                  return (
                    <Tr key={r.id} className="hover:bg-slate-50/70">
                      <Td>
                        <div className="font-semibold text-slate-900">{r.name}</div>
                        <div className="text-xs text-slate-500">{r.email}</div>
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-slate-600">{when(r.created_at)}</Td>
                      <Td>
                        {r.ip ? (
                          <button
                            type="button"
                            onClick={() => set('ip', r.ip || '')}
                            title="Bu IP adresine göre filtrele"
                            className="cursor-pointer rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            {r.ip}
                          </button>
                        ) : (
                          '—'
                        )}
                      </Td>
                      <Td title={r.user_agent || ''}>
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                          {dev.isMobile ? (
                            <Smartphone className="h-3.5 w-3.5 text-slate-400" />
                          ) : (
                            <Laptop className="h-3.5 w-3.5 text-slate-400" />
                          )}
                          {dev.label}
                        </span>
                      </Td>
                      <Td>
                        {r.active ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                            Açık
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Kapalı</span>
                        )}
                      </Td>
                      <Td className="text-right">
                        {r.active && (
                          <Button type="button" variant="secondary" size="sm" onClick={() => endSessions(r.user_id)}>
                            Kapat
                          </Button>
                        )}
                      </Td>
                    </Tr>
                  )
                })}
              </TBody>
            </Table>
          </div>
        )}

        {data && <Pagination page={page} pages={Math.max(1, Math.ceil(data.total / PAGE))} total={data.total} onChange={setPage} />}
      </Card>
    </div>
  )
}
