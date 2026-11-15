'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import axios from 'axios'
import { Card } from '@e-infak/ui'
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Home,
  Package as PackageIcon,
  Plus,
  Settings as SettingsIcon,
  Sparkles,
  Truck,
  Users,
  X,
} from 'lucide-react'
import { adminApiBase, adminAuthHeaders, adminGet, adminSend, apiErrorMessage, formatMoney, useAdminAccess, whatsappUrl, can } from '../../../../lib/admin-access'
import { Label, Notice, TextArea, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { ExportButtons, Modal, TBody, THead, Table, Tabs, Td, Th, Tr, WhatsAppIcon, confirmDialog } from '../../../../components/admin/ui'
import { AppPageHeader, GlobalStatCard, MuhasebeStatModal, ResponsiveDataToolbar } from '../../../../components/admin/muhasebe/OnMuhasebeUI'

type Degree = 'critical' | 'high' | 'medium' | 'low'
type Review = 'applied' | 'inspecting' | 'approved' | 'rejected'

interface Household {
  id: string; full_name: string; phone: string | null; national_id_masked: string | null
  region_id: string | null; region_name: string | null
  city: string | null; district: string | null; neighborhood: string | null; street: string | null; address: string | null
  latitude: number | null; longitude: number | null
  household_size: number | null; member_count: number | null
  housing_status: string | null; heating_type: string | null
  rent_cents: number | null; monthly_income_cents: number | null; monthly_expense_cents: number | null; debt_cents: number | null
  poverty_reasons: string[]; needs: string | null
  poverty_score: number; degree: Degree; degree_label: string; degree_override: Degree | null
  review_status: Review; review_label: string; source: string; status: string
  inspected_at: string | null; inspection_note: string | null
  last_delivery_at: string | null; total_received: number
}
interface Member {
  id: string; full_name: string; relation: string; relation_label: string; gender: string | null; birth_date: string | null
  is_disabled: boolean; has_chronic_illness: boolean; is_student: boolean; school: string | null; is_working: boolean
  monthly_income_cents: number | null; clothing_size: string | null; shoe_size: string | null; notes: string | null
}
interface Detail extends Household {
  members: Member[]
  distributions: { id: string; package_name: string; quantity: number; status: string; planned_date: string | null; delivered_at: string | null }[]
}
interface Meta {
  reasons: Record<string, string>; housing: Record<string, string>; heating: Record<string, string>
  relations: Record<string, string>; degrees: Record<Degree, string>; review_statuses: Record<Review, string>
  poverty_line_cents: number; default_poverty_line_cents: number
}
interface AidPackage {
  id: string; name: string; contents: string | null; unit_cost_cents: number; donation_campaign_id: string | null
  stock: number; is_active: boolean; funded_cents: number; funded_packages: number; planned: number; delivered: number
}
interface Distribution {
  id: string; package_name: string; recipient_name: string | null; recipient_phone: string | null; recipient_address: string | null
  region_name: string | null; quantity: number; status: 'planned' | 'delivered' | 'cancelled'; planned_date: string | null; delivered_at: string | null
}

type Tab = 'households' | 'applications' | 'packages' | 'distributions' | 'stats'

const DEGREE_STYLE: Record<Degree, string> = {
  critical: 'border-rose-200 bg-rose-50 text-rose-800',
  high: 'border-orange-200 bg-orange-50 text-orange-800',
  medium: 'border-amber-200 bg-amber-50 text-amber-800',
  low: 'border-slate-200 bg-slate-100 text-slate-600',
}
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString('tr-TR') : '—')
const lira = (cents: number | null | undefined) => (cents === null || cents === undefined ? '' : String(cents / 100))
const toCents = (v: string) => (v.trim() === '' ? null : Math.round(Number(v.replace(',', '.')) * 100))
const location = (h: Pick<Household, 'city' | 'district' | 'neighborhood'>) => [h.city, h.district, h.neighborhood].filter(Boolean).join(' / ') || '—'

function ScoreBadge({ h }: { h: Pick<Household, 'poverty_score' | 'degree' | 'degree_label'> }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${DEGREE_STYLE[h.degree]}`}>
      {h.poverty_score} · {h.degree_label}
    </span>
  )
}

const emptyHousehold = {
  full_name: '', phone: '', national_id: '', region_id: '', city: '', district: '', neighborhood: '', street: '', address: '',
  latitude: '', longitude: '', household_size: '', housing_status: '', heating_type: '', rent: '', income: '', expense: '', debt: '',
  poverty_reasons: [] as string[], degree_override: '', needs: '', status: 'active',
}
type HouseholdForm = typeof emptyHousehold & { id?: string }

const emptyMember = {
  full_name: '', relation: 'child', gender: '', birth_date: '', is_disabled: false, has_chronic_illness: false, is_student: false,
  school: '', is_working: false, income: '', clothing_size: '', shoe_size: '', notes: '',
}
type MemberForm = typeof emptyMember & { id?: string }

export default function SocialAidAndKumanyaPage() {
  const searchParams = useSearchParams()
  const initialTab = (searchParams?.get('tab') as Tab) || 'households'
  const { data: access } = useAdminAccess()
  const canEdit = can(access, 'operations.manage')

  const [tab, setTab] = useState<Tab>(
    ['households', 'applications', 'packages', 'distributions', 'stats'].includes(initialTab) ? initialTab : 'households',
  )
  const [meta, setMeta] = useState<Meta | null>(null)
  const [regions, setRegions] = useState<{ id: string; name: string }[]>([])
  const [campaigns, setCampaigns] = useState<{ id: string; title: string }[]>([])
  const [packages, setPackages] = useState<AidPackage[]>([])
  const [byRegion, setByRegion] = useState<{ label: string; households: number; packages: number }[]>([])
  const [distributions, setDistributions] = useState<Distribution[]>([])
  const [rows, setRows] = useState<Household[]>([])

  const [filters, setFilters] = useState({ degree: '', city: '', district: '', neighborhood: '', q: '', not_helped_days: '', region_id: '' })
  const [showFilters, setShowFilters] = useState(false)
  const [appFilter, setAppFilter] = useState<'open' | 'applied' | 'inspecting' | 'rejected'>('open')
  const [appQuery, setAppQuery] = useState('')

  // Distributions & Bulk planning state
  const [distMode, setDistMode] = useState<'list' | 'bulk'>('list')
  const [distStatus, setDistStatus] = useState<'planned' | 'delivered' | 'cancelled' | ''>('planned')
  const [distPackageId, setDistPackageId] = useState('')
  const [distRegionId, setDistRegionId] = useState('')
  const [distQuery, setDistQuery] = useState('')
  const [showDistFilters, setShowDistFilters] = useState(false)

  // Picked items (households on households tab, distributions on distributions tab)
  const [pickedHouseholds, setPickedHouseholds] = useState<Set<string>>(new Set())
  const [pickedDistributions, setPickedDistributions] = useState<Set<string>>(new Set())
  const [quickPlan, setQuickPlan] = useState({ package_id: '', quantity: '1', planned_date: '' })

  // Modals
  const [statModal, setStatModal] = useState<'households' | 'stock' | 'planned' | 'delivered' | null>(null)
  const [pkgForm, setPkgForm] = useState<{ id?: string; name: string; contents: string; cost: string; campaign: string; stock: string; is_active: boolean } | null>(null)
  const [reviewModal, setReviewModal] = useState<{ household: Household; status: 'approved' | 'rejected' } | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [form, setForm] = useState<HouseholdForm | null>(null)
  const [memberForm, setMemberForm] = useState<MemberForm | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const loadAidReportAndDistributions = async () => {
    try {
      const [rep, dist] = await Promise.all([
        adminGet<{ packages: AidPackage[]; by_region: typeof byRegion }>('/aid-report'),
        adminGet<Distribution[]>('/aid-distributions', {
          status: distStatus || undefined,
          package_id: distPackageId || undefined,
          region_id: distRegionId || undefined,
        }),
      ])
      setPackages(rep.data.packages)
      setByRegion(rep.data.by_region)
      setDistributions(dist.data)
    } catch {
      // Ignore if food_aid not loaded yet
    }
  }

  useEffect(() => {
    Promise.all([
      adminGet<Meta>('/households-meta'),
      adminGet<{ id: string; name: string }[]>('/regions').catch(() => ({ data: [] })),
    ])
      .then(([m, r]) => {
        setMeta(m.data)
        setRegions(r.data)
      })
      .catch((err) => setMessage({ type: 'error', text: apiErrorMessage(err, 'Modül yüklenemedi') }))

    axios
      .get(`${adminApiBase()}/api/v1/campaigns`, { headers: adminAuthHeaders(), params: { page_size: 100 } })
      .then((r) => setCampaigns(r.data.items || []))
      .catch(() => {})
  }, [])

  const didMountDistRef = useRef(false)
  useEffect(() => {
    setPickedDistributions(new Set())
    if (!didMountDistRef.current) {
      didMountDistRef.current = true
      loadAidReportAndDistributions()
      return
    }
    const t = setTimeout(loadAidReportAndDistributions, 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distStatus, distPackageId, distRegionId])

  const loadHouseholds = async () => {
    try {
      const params =
        tab === 'applications'
          ? { review: appFilter, ...(appQuery.trim() ? { q: appQuery.trim() } : {}) }
          : { review: 'approved', ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }
      setRows((await adminGet<Household[]>('/households', params)).data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Haneler yüklenemedi') })
    }
  }

  const didMountHouseRef = useRef(false)
  useEffect(() => {
    setPickedHouseholds(new Set())
    if (!didMountHouseRef.current) {
      didMountHouseRef.current = true
      loadHouseholds()
      return
    }
    const t = setTimeout(loadHouseholds, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filters, appFilter, appQuery])

  const openDetail = async (id: string) => {
    try {
      setDetail((await adminGet<Detail>(`/households/${id}`)).data)
      setMemberForm(null)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const act = async (fn: () => Promise<unknown>, ok: string, refreshId?: string) => {
    setMessage(null)
    try {
      await fn()
      setMessage({ type: 'ok', text: ok })
      await Promise.all([loadHouseholds(), loadAidReportAndDistributions()])
      if (refreshId) await openDetail(refreshId)
      return true
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
      return false
    }
  }

  const editHousehold = (h?: Household) => {
    setForm(
      h
        ? {
            id: h.id, full_name: h.full_name, phone: h.phone || '', national_id: '', region_id: h.region_id || '',
            city: h.city || '', district: h.district || '', neighborhood: h.neighborhood || '', street: h.street || '', address: h.address || '',
            latitude: h.latitude?.toString() || '', longitude: h.longitude?.toString() || '', household_size: h.household_size?.toString() || '',
            housing_status: h.housing_status || '', heating_type: h.heating_type || '', rent: lira(h.rent_cents), income: lira(h.monthly_income_cents),
            expense: lira(h.monthly_expense_cents), debt: lira(h.debt_cents), poverty_reasons: h.poverty_reasons,
            degree_override: h.degree_override || '', needs: h.needs || '', status: h.status,
          }
        : { ...emptyHousehold },
    )
  }

  const saveHousehold = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    const body = {
      full_name: form.full_name, phone: form.phone || null, national_id: form.national_id || null, region_id: form.region_id || null,
      city: form.city || null, district: form.district || null, neighborhood: form.neighborhood || null, street: form.street || null,
      address: form.address || null, latitude: form.latitude ? Number(form.latitude) : null, longitude: form.longitude ? Number(form.longitude) : null,
      household_size: form.household_size ? Number(form.household_size) : null,
      housing_status: form.housing_status || null, heating_type: form.heating_type || null,
      rent_cents: toCents(form.rent), monthly_income_cents: toCents(form.income), monthly_expense_cents: toCents(form.expense),
      debt_cents: toCents(form.debt), poverty_reasons: form.poverty_reasons, degree_override: form.degree_override || null,
      needs: form.needs || null, status: form.status,
    }
    const id = form.id
    const ok = await act(async () => {
      const res = id ? await adminSend<Household>('put', `/households/${id}`, body) : await adminSend<Household>('post', '/households', body)
      if (!id) await openDetail(res.data.id)
    }, 'Hane kaydedildi', id)
    if (ok) setForm(null)
  }

  const saveMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!memberForm || !detail) return
    const body = {
      full_name: memberForm.full_name, relation: memberForm.relation, gender: memberForm.gender || null, birth_date: memberForm.birth_date || null,
      is_disabled: memberForm.is_disabled, has_chronic_illness: memberForm.has_chronic_illness, is_student: memberForm.is_student,
      school: memberForm.school || null, is_working: memberForm.is_working, monthly_income_cents: toCents(memberForm.income),
      clothing_size: memberForm.clothing_size || null, shoe_size: memberForm.shoe_size || null, notes: memberForm.notes || null,
    }
    const path = memberForm.id ? `/households/${detail.id}/members/${memberForm.id}` : `/households/${detail.id}/members`
    if (await act(() => adminSend(memberForm.id ? 'put' : 'post', path, body), 'Aile bireyi kaydedildi', detail.id)) setMemberForm(null)
  }

  const savePackage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pkgForm) return
    const body = {
      name: pkgForm.name,
      contents: pkgForm.contents || null,
      unit_cost_cents: Math.round(Number(pkgForm.cost.replace(',', '.')) * 100),
      donation_campaign_id: pkgForm.campaign || null,
      stock: Number(pkgForm.stock) || 0,
      is_active: pkgForm.is_active,
    }
    if (await act(() => (pkgForm.id ? adminSend('put', `/aid-packages/${pkgForm.id}`, body) : adminSend('post', '/aid-packages', body)), 'Yardım paketi kaydedildi')) {
      setPkgForm(null)
    }
  }

  const planSelectedHouseholds = () => {
    if (!quickPlan.package_id) {
      setMessage({ type: 'error', text: 'Önce dağıtılacak yardım paketini seçin' })
      return
    }
    act(
      () =>
        adminSend('post', '/aid-distributions', {
          package_id: quickPlan.package_id,
          recipient_ids: [...pickedHouseholds],
          quantity: Number(quickPlan.quantity) || 1,
          planned_date: quickPlan.planned_date || null,
        }),
      `${pickedHouseholds.size} haneye kumanya/yardım dağıtımı planlandı`,
    ).then((ok) => ok && setPickedHouseholds(new Set()))
  }

  const setDistributionStatus = (status: 'delivered' | 'cancelled' | 'planned', ids?: string[]) => {
    const targetIds = ids ?? [...pickedDistributions]
    if (targetIds.length === 0) return
    act(
      () => adminSend('post', '/aid-distributions/status', { ids: targetIds, status }),
      status === 'delivered' ? 'Teslim edildi olarak işaretlendi' : status === 'cancelled' ? 'Dağıtımlar iptal edildi' : 'Dağıtımlar güncellendi',
    ).then((ok) => ok && setPickedDistributions(new Set()))
  }

  const review = (h: Household, status: Exclude<Review, 'applied'>) => {
    if (status === 'inspecting') {
      act(() => adminSend('post', `/households/${h.id}/review`, { status, note: null }), 'Saha incelemesine alındı', detail?.id === h.id ? h.id : undefined)
      return
    }
    setReviewNote('')
    setReviewModal({ household: h, status })
  }

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reviewModal) return
    const { household, status } = reviewModal
    const ok = await act(
      () => adminSend('post', `/households/${household.id}/review`, { status, note: reviewNote.trim() || null }),
      status === 'approved' ? 'Hane onaylandı' : 'Başvuru reddedildi',
      detail?.id === household.id ? household.id : undefined,
    )
    if (ok) {
      setReviewModal(null)
      setReviewNote('')
    }
  }

  const kpi = useMemo(() => {
    return packages.reduce(
      (acc, p) => ({
        stock: acc.stock + p.stock,
        planned: acc.planned + p.planned,
        delivered: acc.delivered + p.delivered,
        fundedCents: acc.fundedCents + p.funded_cents,
      }),
      { stock: 0, planned: 0, delivered: 0, fundedCents: 0 },
    )
  }, [packages])

  const filteredDistributions = useMemo(() => {
    const query = distQuery.trim().toLowerCase()
    if (!query) return distributions
    return distributions.filter((d) =>
      `${d.recipient_name || ''} ${d.recipient_phone || ''} ${d.recipient_address || ''} ${d.package_name}`.toLowerCase().includes(query),
    )
  }, [distributions, distQuery])

  const pickedPlannedIds = useMemo(
    () => filteredDistributions.filter((d) => pickedDistributions.has(d.id) && d.status === 'planned').map((d) => d.id),
    [filteredDistributions, pickedDistributions],
  )
  const pickedDeliveredIds = useMemo(
    () => filteredDistributions.filter((d) => pickedDistributions.has(d.id) && d.status === 'delivered').map((d) => d.id),
    [filteredDistributions, pickedDistributions],
  )

  const set = <K extends keyof HouseholdForm>(k: K, v: HouseholdForm[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))
  const setM = <K extends keyof MemberForm>(k: K, v: MemberForm[K]) => setMemberForm((f) => (f ? { ...f, [k]: v } : f))

  const activeHouseholdFilters = [filters.degree, filters.city, filters.district, filters.neighborhood, filters.region_id, filters.not_helped_days].filter(Boolean).length
  const activeDistFilters = [distStatus !== 'planned' ? distStatus : '', distPackageId, distRegionId].filter(Boolean).length

  return (
    <div className="space-y-5">
      <AppPageHeader
        eyebrow="SAHA & ORGANİZASYON"
        title="Sosyal Yardım & Kumanya Merkezi"
        meta="İhtiyaç sahibi hane kartları, muhtaçlık puanlaması, yardım başvuruları, kumanya paket stokları, tekli ve puana göre toplu dağıtım planlama tek merkezde."
        icon={<Home className="h-6 w-6" />}
        chips={
          <>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
              🏠 {rows.length} Listelenen Hane
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-800">
              📦 {packages.length} Yardım Paketi ({kpi.stock} Stok)
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800">
              🚚 {kpi.planned} Planlı · {kpi.delivered} Teslim
            </span>
          </>
        }
        actions={
          canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPkgForm({ name: '', contents: '', cost: '', campaign: '', stock: '0', is_active: true })}
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"
              >
                <PackageIcon className="h-4 w-4" />
                + Paket Tanımla
              </button>
              <button
                type="button"
                onClick={() => editHousehold()}
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" />
                Yeni Hane Ekle
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <GlobalStatCard
          id="households"
          title="İHTİYAÇ SAHİBİ HANELER"
          value={`${rows.length} Hane`}
          subtitle={`${rows.filter((r) => r.degree === 'critical').length} çok acil · ${rows.filter((r) => r.degree === 'high').length} yüksek öncelikli`}
          icon={<Users className="h-4 w-4" />}
          gradient="from-emerald-600 to-teal-700"
          onClick={() => setStatModal('households')}
        />
        <GlobalStatCard
          id="stock"
          title="HAZIR STOK & FONLAMA"
          value={`${kpi.stock} Paket`}
          subtitle={`Fonlanan bağış: ${formatMoney(kpi.fundedCents)}`}
          icon={<Boxes className="h-4 w-4" />}
          gradient="from-blue-600 to-indigo-700"
          onClick={() => setStatModal('stock')}
        />
        <GlobalStatCard
          id="planned"
          title="PLANLI DAĞITIM"
          value={`${kpi.planned} Paket`}
          subtitle="Saha teslimatı bekleyen planlı yardımlar"
          icon={<Truck className="h-4 w-4" />}
          gradient="from-amber-500 to-orange-600"
          onClick={() => setStatModal('planned')}
        />
        <GlobalStatCard
          id="delivered"
          title="TESLİM EDİLEN YARDIM"
          value={`${kpi.delivered} Paket`}
          subtitle={`${byRegion.length} bölgede hanelere ulaştırıldı`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          gradient="from-violet-600 to-purple-700"
          onClick={() => setStatModal('delivered')}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={(k) => {
            setTab(k)
            setMessage(null)
          }}
          tabs={[
            { key: 'households', label: 'İhtiyaç Sahibi Haneler', count: tab === 'households' ? rows.length : undefined, icon: Home },
            { key: 'applications', label: 'Yardım Başvuruları', count: tab === 'applications' ? rows.length : undefined, icon: ClipboardCheck },
            { key: 'packages', label: 'Kumanya & Yardım Paketleri', count: packages.length, icon: PackageIcon },
            { key: 'distributions', label: 'Dağıtım & Toplu Planlama', count: distributions.length, icon: Truck },
            { key: 'stats', label: 'İstatistik, Adalet & Puanlama', icon: BarChart3 },
          ]}
        />
      </div>

      <Notice message={message} />

      {/* TAB 1 & 2: HOUSEHOLDS & APPLICATIONS */}
      {(tab === 'households' || tab === 'applications') && (
        <div className="space-y-4">
          <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
            <ResponsiveDataToolbar
              search={{
                value: tab === 'applications' ? appQuery : filters.q,
                onChange: (val) => (tab === 'applications' ? setAppQuery(val) : setFilters({ ...filters, q: val })),
                placeholder: 'Hane reisi adı, telefon, TC, mahalle veya adres ara...',
              }}
              filter={
                tab === 'households'
                  ? {
                      activeCount: activeHouseholdFilters,
                      onOpen: () => setShowFilters((v) => !v),
                      label: 'Gelişmiş Filtreler',
                      showOnDesktop: true,
                    }
                  : undefined
              }
              extraActions={
                <div className="flex flex-wrap items-center gap-2">
                  {tab === 'applications' && (
                    <select
                      className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700"
                      value={appFilter}
                      onChange={(e) => setAppFilter(e.target.value as typeof appFilter)}
                    >
                      <option value="open">Açık (Bekleyen + İncelemede)</option>
                      <option value="applied">Yalnızca Bekleyen</option>
                      <option value="inspecting">Yalnızca İncelemede</option>
                      <option value="rejected">Reddedilenler</option>
                    </select>
                  )}
                  <ExportButtons
                    filename={tab === 'applications' ? 'yardim-basvurulari' : 'ihtiyac-sahibi-haneler'}
                    title={tab === 'applications' ? 'Yardım Başvuruları' : 'İhtiyaç Sahibi Haneler'}
                    subtitle={`${rows.length} hane`}
                    getData={() => ({
                      headers: ['Puan', 'Derece', 'Ad Soyad', 'Telefon', 'İl', 'İlçe', 'Mahalle', 'Kişi', 'Son Yardım', 'Alınan Paket', 'Durum'],
                      rows: rows.map((h) => [
                        h.poverty_score,
                        h.degree_label,
                        h.full_name,
                        h.phone,
                        h.city,
                        h.district,
                        h.neighborhood,
                        h.household_size,
                        fmtDate(h.last_delivery_at),
                        h.total_received,
                        h.review_label,
                      ]),
                    })}
                  />
                </div>
              }
            />

            {tab === 'households' && showFilters && meta && (
              <div className="grid gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 sm:grid-cols-3 lg:grid-cols-6">
                <Label label="Muhtaçlık Derecesi">
                  <select className={inputClass} value={filters.degree} onChange={(e) => setFilters({ ...filters, degree: e.target.value })}>
                    <option value="">Tüm dereceler</option>
                    {Object.entries(meta.degrees).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Label>
                <TextInput label="İl" value={filters.city} onChange={(v) => setFilters({ ...filters, city: v })} />
                <TextInput label="İlçe" value={filters.district} onChange={(v) => setFilters({ ...filters, district: v })} />
                <TextInput label="Mahalle" value={filters.neighborhood} onChange={(v) => setFilters({ ...filters, neighborhood: v })} />
                <Label label="Saha Bölgesi">
                  <select className={inputClass} value={filters.region_id} onChange={(e) => setFilters({ ...filters, region_id: e.target.value })}>
                    <option value="">Tüm bölgeler</option>
                    {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </Label>
                <Label label="Yardım Geçmişi">
                  <select className={inputClass} value={filters.not_helped_days} onChange={(e) => setFilters({ ...filters, not_helped_days: e.target.value })}>
                    <option value="">Fark etmez</option>
                    <option value="30">30 gündür yardım almayan</option>
                    <option value="90">90 gündür yardım almayan</option>
                    <option value="180">180 gündür yardım almayan</option>
                  </select>
                </Label>
              </div>
            )}

            {tab === 'households' && canEdit && pickedHouseholds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
                <span className="text-xs font-black text-emerald-900">{pickedHouseholds.size} hane seçildi:</span>
                <select
                  className="h-9 rounded-lg border border-emerald-300 bg-white px-2.5 text-xs font-bold text-slate-800"
                  value={quickPlan.package_id}
                  onChange={(e) => setQuickPlan({ ...quickPlan, package_id: e.target.value })}
                >
                  <option value="">Dağıtılacak Paketi Seçin...</option>
                  {packages.filter((p) => p.is_active).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Stok: {p.stock})
                    </option>
                  ))}
                </select>
                <input
                  className="h-9 w-20 rounded-lg border border-emerald-300 bg-white px-2.5 text-xs font-bold text-slate-800"
                  type="number"
                  min={1}
                  value={quickPlan.quantity}
                  onChange={(e) => setQuickPlan({ ...quickPlan, quantity: e.target.value })}
                  aria-label="Adet"
                />
                <input
                  className="h-9 rounded-lg border border-emerald-300 bg-white px-2.5 text-xs font-bold text-slate-800"
                  type="date"
                  value={quickPlan.planned_date}
                  onChange={(e) => setQuickPlan({ ...quickPlan, planned_date: e.target.value })}
                  aria-label="Planlanan tarih"
                />
                <button
                  type="button"
                  onClick={planSelectedHouseholds}
                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  <Truck className="h-3.5 w-3.5" />
                  Seçilen Hanelere Dağıtım Planla
                </button>
              </div>
            )}
          </section>

          <Card className="overflow-hidden rounded-2xl border border-slate-200/80 p-0 shadow-xs">
            <div className="overflow-x-auto">
              <Table inset>
                <THead className="bg-slate-50/80">
                  <Tr>
                    {tab === 'households' && canEdit && (
                      <Th className="w-8">
                        <input
                          type="checkbox"
                          checked={pickedHouseholds.size > 0 && pickedHouseholds.size === rows.length}
                          onChange={(e) => setPickedHouseholds(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                          aria-label="Tümünü seç"
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                        />
                      </Th>
                    )}
                    <Th>Muhtaçlık Puanı</Th>
                    <Th>Hane Reisi & İletişim</Th>
                    <Th>Konum / Bölge</Th>
                    <Th>Nüfus</Th>
                    <Th>Son Yardım</Th>
                    <Th>Durum</Th>
                    <Th className="text-right">İşlem</Th>
                  </Tr>
                </THead>
                <TBody>
                  {rows.map((h) => (
                    <Tr
                      key={h.id}
                      className={`cursor-pointer hover:bg-slate-50/70 ${detail?.id === h.id ? 'bg-emerald-50/40' : ''}`}
                      onClick={() => openDetail(h.id)}
                    >
                      {tab === 'households' && canEdit && (
                        <Td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={pickedHouseholds.has(h.id)}
                            onChange={() =>
                              setPickedHouseholds((prev) => {
                                const next = new Set(prev)
                                next.has(h.id) ? next.delete(h.id) : next.add(h.id)
                                return next
                              })
                            }
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                          />
                        </Td>
                      )}
                      <Td><ScoreBadge h={h} /></Td>
                      <Td>
                        <div className="font-bold text-slate-900">
                          {h.full_name}
                          {h.source === 'web' && (
                            <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">Web Başvuru</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {[h.phone, h.national_id_masked && `TC: ${h.national_id_masked}`].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </Td>
                      <Td>
                        <div className="text-xs font-semibold text-slate-800">{location(h)}</div>
                        {h.region_name && <div className="text-[11px] text-slate-500">Bölge: {h.region_name}</div>}
                      </Td>
                      <Td className="font-semibold">{h.household_size || '—'} kişi</Td>
                      <Td>
                        <span className="text-xs font-medium text-slate-700">{fmtDate(h.last_delivery_at)}</span>
                        {h.total_received > 0 && (
                          <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            {h.total_received} paket
                          </span>
                        )}
                      </Td>
                      <Td>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                          {h.review_label}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5">
                          {(() => {
                            const wa = whatsappUrl(h.phone, `Merhaba ${h.full_name}, yardım başvurunuz / durumunuz hakkında iletişime geçiyoruz.`)
                            return wa ? (
                              <a href={wa} target="_blank" rel="noreferrer" title="WhatsApp ile mesaj gönder" className="rounded-lg p-1.5 hover:bg-slate-100">
                                <WhatsAppIcon className="h-4 w-4" />
                              </a>
                            ) : null
                          })()}
                          {canEdit && tab === 'applications' && (
                            <>
                              {h.review_status === 'applied' && (
                                <button
                                  type="button"
                                  className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                                  onClick={() => review(h, 'inspecting')}
                                >
                                  İncele
                                </button>
                              )}
                              <button
                                type="button"
                                className="cursor-pointer rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                                onClick={() => review(h, 'approved')}
                              >
                                Onayla
                              </button>
                              {h.review_status !== 'rejected' && (
                                <button
                                  type="button"
                                  className="cursor-pointer rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100"
                                  onClick={() => review(h, 'rejected')}
                                >
                                  Reddet
                                </button>
                              )}
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => openDetail(h.id)}
                            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                          >
                            Detay
                          </button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                  {!rows.length && (
                    <Tr>
                      <Td colSpan={8} className="py-12 text-center text-slate-400">
                        Seçili filtrelere uygun hane kaydı bulunamadı.
                      </Td>
                    </Tr>
                  )}
                </TBody>
              </Table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: PACKAGES (KUMANYA & YARDIM PAKETLERİ) */}
      {tab === 'packages' && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {packages.map((p) => {
              const deficit = Math.max(0, p.planned - p.stock)
              const targetCount = Math.max(p.funded_packages, p.planned + p.delivered, 1)
              const fundedPct = Math.min(100, Math.round((p.funded_packages / targetCount) * 100))
              return (
                <div
                  key={p.id}
                  className={`flex flex-col justify-between space-y-3.5 rounded-2xl border p-5 shadow-xs transition-all hover:shadow-md ${
                    p.is_active ? 'border-slate-200/80 bg-white' : 'border-slate-200 bg-slate-50/70 opacity-80'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                            <PackageIcon className="h-4 w-4" />
                          </span>
                          <strong className="text-base font-black text-slate-900">{p.name}</strong>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {p.is_active ? 'Aktif Paket' : 'Pasif'}
                          </span>
                          {deficit > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700">
                              <AlertTriangle className="h-3 w-3" /> {deficit} adet stok açığı
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-800 tabular-nums">
                        {formatMoney(p.unit_cost_cents)}
                      </span>
                    </div>

                    {p.contents && <p className="text-xs leading-relaxed text-slate-600">{p.contents}</p>}

                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      {[
                        ['Fonlanan', p.funded_packages, 'text-slate-900'],
                        ['Hazır Stok', p.stock, deficit > 0 ? 'text-rose-600' : 'text-slate-900'],
                        ['Planlı', p.planned, 'text-amber-700'],
                        ['Teslim', p.delivered, 'text-emerald-700'],
                      ].map(([l, v, tone]) => (
                        <div key={l as string} className="rounded-xl border border-slate-100 bg-slate-50/70 p-2">
                          <div className="text-[10px] font-bold text-slate-500">{l}</div>
                          <div className={`mt-0.5 text-base font-black tabular-nums ${tone}`}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {p.donation_campaign_id && (
                      <div className="space-y-1 pt-1">
                        <div className="flex justify-between text-xs font-semibold text-slate-500">
                          <span>Bağış Kaleminden Fonlanan</span>
                          <span className="font-bold text-emerald-700 tabular-nums">{formatMoney(p.funded_cents)}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${fundedPct}%` }} />
                        </div>
                      </div>
                    )}
                  </div>

                  {canEdit && (
                    <div className="flex justify-end border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                        onClick={() =>
                          setPkgForm({
                            id: p.id,
                            name: p.name,
                            contents: p.contents || '',
                            cost: String(p.unit_cost_cents / 100),
                            campaign: p.donation_campaign_id || '',
                            stock: String(p.stock),
                            is_active: p.is_active,
                          })
                        }
                      >
                        Düzenle / Stok Güncelle
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            {packages.length === 0 && (
              <Card className="border border-slate-200/80 p-12 text-center shadow-xs md:col-span-2 xl:col-span-3">
                <PackageIcon className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-2 text-sm font-bold text-slate-700">Henüz yardım veya kumanya paketi tanımlanmamış</p>
                <p className="mt-1 text-xs text-slate-500">Sağ üstteki &quot;+ Paket Tanımla&quot; butonuyla gıda kolisi, nakdi yardım veya kışlık paket oluşturabilirsiniz.</p>
              </Card>
            )}
          </div>

          {byRegion.length > 0 && (
            <Card className="rounded-2xl border border-slate-200/80 p-5 shadow-xs">
              <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-700">Bölgelere Göre Teslim Edilen Yardımlar</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {byRegion.map((r) => (
                  <div key={r.label} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <span className="text-sm font-bold text-slate-800">{r.label}</span>
                    <span className="text-xs font-semibold text-slate-600">
                      {r.households} hane · <strong className="font-black text-emerald-700">{r.packages} paket</strong>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB 4: DISTRIBUTIONS & BULK PLANNING */}
      {tab === 'distributions' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setDistMode('list')}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  distMode === 'list' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Truck className="h-4 w-4" />
                Dağıtım & Teslimat Listesi ({filteredDistributions.length})
              </button>
              <button
                type="button"
                onClick={() => setDistMode('bulk')}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  distMode === 'bulk' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Sparkles className="h-4 w-4" />
                Puana Göre Toplu Dağıtım Planla
              </button>
            </div>
          </div>

          {distMode === 'bulk' && meta ? (
            <BulkPlan
              meta={meta}
              regions={regions}
              packages={packages}
              canEdit={canEdit}
              onMessage={setMessage}
              onPlanned={() => {
                loadAidReportAndDistributions()
                setDistMode('list')
              }}
            />
          ) : (
            <>
              <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                <ResponsiveDataToolbar
                  search={{
                    value: distQuery,
                    onChange: setDistQuery,
                    placeholder: 'Hane adı, telefon, adres veya paket ara...',
                  }}
                  filter={{
                    activeCount: activeDistFilters,
                    onOpen: () => setShowDistFilters((v) => !v),
                    label: 'Gelişmiş Filtreler',
                    showOnDesktop: true,
                  }}
                  extraActions={
                    <ExportButtons
                      filename="kumanya-dagitim-listesi"
                      title="Sosyal Yardım & Kumanya Dağıtım Listesi"
                      subtitle={`${filteredDistributions.length} kayıt`}
                      getData={() => ({
                        headers: ['Hane', 'Telefon', 'Adres', 'Bölge', 'Paket', 'Adet', 'Durum', 'Tarih'],
                        rows: filteredDistributions.map((d) => [
                          d.recipient_name,
                          d.recipient_phone,
                          d.recipient_address,
                          d.region_name,
                          d.package_name,
                          d.quantity,
                          d.status === 'delivered' ? 'Teslim' : d.status === 'planned' ? 'Planlı' : 'İptal',
                          d.delivered_at ? new Date(d.delivered_at).toLocaleDateString('tr-TR') : d.planned_date || '',
                        ]),
                      })}
                    />
                  }
                />

                {showDistFilters && (
                  <div className="grid gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 sm:grid-cols-3">
                    <Label label="Teslimat Durumu">
                      <select className={inputClass} value={distStatus} onChange={(e) => setDistStatus(e.target.value as typeof distStatus)}>
                        <option value="planned">Planlanan (Teslim Bekleyen)</option>
                        <option value="delivered">Teslim Edilenler</option>
                        <option value="cancelled">İptal Edilenler</option>
                        <option value="">Tümü</option>
                      </select>
                    </Label>
                    <Label label="Yardım Paketi">
                      <select className={inputClass} value={distPackageId} onChange={(e) => setDistPackageId(e.target.value)}>
                        <option value="">Tüm paketler</option>
                        {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </Label>
                    <Label label="Saha Bölgesi">
                      <select className={inputClass} value={distRegionId} onChange={(e) => setDistRegionId(e.target.value)}>
                        <option value="">Tüm bölgeler</option>
                        {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </Label>
                  </div>
                )}

                {canEdit && pickedDistributions.size > 0 && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
                    <span className="text-xs font-black text-emerald-900">{pickedDistributions.size} dağıtım seçili:</span>
                    {pickedPlannedIds.length > 0 && (
                      <>
                        <button
                          type="button"
                          className="cursor-pointer rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                          onClick={() => setDistributionStatus('delivered', pickedPlannedIds)}
                        >
                          ✓ Teslim Edildi İşaretle ({pickedPlannedIds.length})
                        </button>
                        <button
                          type="button"
                          className="cursor-pointer rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                          onClick={() => setDistributionStatus('cancelled', pickedPlannedIds)}
                        >
                          İptal Et ({pickedPlannedIds.length})
                        </button>
                      </>
                    )}
                    {pickedDeliveredIds.length > 0 && (
                      <button
                        type="button"
                        className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                        onClick={() => setDistributionStatus('planned', pickedDeliveredIds)}
                      >
                        Teslimi Geri Al ({pickedDeliveredIds.length})
                      </button>
                    )}
                  </div>
                )}
              </section>

              <Card className="overflow-hidden rounded-2xl border border-slate-200/80 p-0 shadow-xs">
                <div className="overflow-x-auto">
                  <Table inset>
                    <THead className="bg-slate-50/80">
                      <Tr>
                        {canEdit && (
                          <Th className="w-8">
                            <input
                              type="checkbox"
                              checked={pickedDistributions.size > 0 && pickedDistributions.size === filteredDistributions.length && filteredDistributions.length > 0}
                              onChange={(e) =>
                                setPickedDistributions(e.target.checked ? new Set(filteredDistributions.map((d) => d.id)) : new Set())
                              }
                              aria-label="Tümünü seç"
                              className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                            />
                          </Th>
                        )}
                        <Th>Hane / İletişim / Adres</Th>
                        <Th>Paket & Adet</Th>
                        <Th>Bölge</Th>
                        <Th>Tarih</Th>
                        <Th>Durum</Th>
                        {canEdit && <Th className="text-right">Hızlı İşlem</Th>}
                      </Tr>
                    </THead>
                    <TBody>
                      {filteredDistributions.map((d) => (
                        <Tr key={d.id} className="hover:bg-slate-50/70">
                          {canEdit && (
                            <Td>
                              <input
                                type="checkbox"
                                checked={pickedDistributions.has(d.id)}
                                onChange={() =>
                                  setPickedDistributions((prev) => {
                                    const next = new Set(prev)
                                    next.has(d.id) ? next.delete(d.id) : next.add(d.id)
                                    return next
                                  })
                                }
                                className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                              />
                            </Td>
                          )}
                          <Td>
                            <div className="font-bold text-slate-900">{d.recipient_name}</div>
                            {d.recipient_phone && (
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span>{d.recipient_phone}</span>
                                {(() => {
                                  const wa = whatsappUrl(
                                    d.recipient_phone,
                                    `Merhaba ${d.recipient_name}, ${d.package_name} yardım dağıtımınız hakkında bilgilendirmek isteriz.`,
                                  )
                                  return wa ? (
                                    <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-[#128C7E] hover:underline">
                                      <WhatsAppIcon className="h-3.5 w-3.5" /> WhatsApp
                                    </a>
                                  ) : null
                                })()}
                              </div>
                            )}
                            {d.recipient_address && <div className="text-[11px] text-slate-400">{d.recipient_address}</div>}
                          </Td>
                          <Td className="font-bold text-slate-800">{d.package_name} × {d.quantity}</Td>
                          <Td>{d.region_name || '—'}</Td>
                          <Td>
                            {d.delivered_at
                              ? new Date(d.delivered_at).toLocaleDateString('tr-TR')
                              : d.planned_date
                                ? new Date(d.planned_date).toLocaleDateString('tr-TR')
                                : '—'}
                          </Td>
                          <Td>
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                d.status === 'delivered'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : d.status === 'planned'
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {d.status === 'delivered' ? '✓ Teslim Edildi' : d.status === 'planned' ? '⏳ Planlı' : 'İptal'}
                            </span>
                          </Td>
                          {canEdit && (
                            <Td className="text-right">
                              {d.status === 'planned' && (
                                <button
                                  type="button"
                                  onClick={() => setDistributionStatus('delivered', [d.id])}
                                  className="cursor-pointer rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                                >
                                  Teslim Et
                                </button>
                              )}
                            </Td>
                          )}
                        </Tr>
                      ))}
                      {filteredDistributions.length === 0 && (
                        <Tr>
                          <Td colSpan={7} className="py-12 text-center text-slate-400">
                            Seçili kriterlere uygun dağıtım kaydı bulunamadı.
                          </Td>
                        </Tr>
                      )}
                    </TBody>
                  </Table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* TAB 5: STATS, FAIRNESS & SCORING SETTINGS */}
      {tab === 'stats' && (
        <div className="space-y-5">
          {meta && (
            <Settings
              meta={meta}
              canEdit={canEdit}
              onSaved={(line) => setMeta({ ...meta, poverty_line_cents: line })}
              onMessage={setMessage}
            />
          )}
          <Stats
            onSelectHousehold={(id) => {
              openDetail(id)
            }}
          />
        </div>
      )}

      {/* STAT MODAL */}
      <MuhasebeStatModal
        isOpen={statModal !== null}
        onClose={() => setStatModal(null)}
        title={
          statModal === 'households'
            ? 'Muhtaçlık Derecesine Göre Haneler'
            : statModal === 'stock'
              ? 'Yardım & Kumanya Paket Stokları'
              : statModal === 'planned'
                ? 'Teslimat Bekleyen Planlı Dağıtımlar'
                : 'Teslim Edilen Yardımlar'
        }
        items={
          statModal === 'households'
            ? rows.slice(0, 30).map((h) => ({
                label: `${h.full_name} (${location(h)})`,
                value: `${h.poverty_score} Puan · ${h.degree_label}`,
                sub: `${h.household_size || '?'} kişi · Son yardım: ${fmtDate(h.last_delivery_at)}`,
                color: h.degree === 'critical' ? 'rose' : h.degree === 'high' ? 'amber' : 'emerald',
              }))
            : statModal === 'stock'
              ? packages.map((p) => ({
                  label: p.name,
                  value: `${p.stock} Stok · Birim: ${formatMoney(p.unit_cost_cents)}`,
                  sub: `Fonlanan: ${p.funded_packages} paket (${formatMoney(p.funded_cents)}) · Planlı: ${p.planned} · Teslim: ${p.delivered}`,
                  color: p.stock <= 5 ? 'rose' : 'blue',
                }))
              : statModal === 'planned'
                ? distributions
                    .filter((d) => d.status === 'planned')
                    .map((d) => ({
                      label: d.recipient_name || 'Hane',
                      value: `${d.package_name} × ${d.quantity}`,
                      sub: [d.region_name, d.recipient_phone].filter(Boolean).join(' · '),
                      color: 'amber',
                    }))
                : distributions
                    .filter((d) => d.status === 'delivered')
                    .map((d) => ({
                      label: d.recipient_name || 'Hane',
                      value: `${d.package_name} × ${d.quantity}`,
                      sub: d.delivered_at ? new Date(d.delivered_at).toLocaleDateString('tr-TR') : '',
                      color: 'emerald',
                    }))
        }
      />

      {/* HOUSEHOLD DETAIL MODAL */}
      {detail && meta && (
        <Modal
          title={`${detail.full_name} · Hane Detay Kartı`}
          description={`${location(detail)}${detail.street ? ` · ${detail.street}` : ''} · ${detail.household_size || '?'} kişi`}
          size="lg"
          onClose={() => setDetail(null)}
        >
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <ScoreBadge h={detail} />
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                  {detail.review_label}
                </span>
                {detail.latitude !== null && detail.longitude !== null && (
                  <a
                    className="text-xs font-bold text-emerald-700 underline"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://www.openstreetmap.org/?mlat=${detail.latitude}&mlon=${detail.longitude}#map=17/${detail.latitude}/${detail.longitude}`}
                  >
                    📍 Haritada Aç
                  </a>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {canEdit && (
                  <button
                    type="button"
                    className={ghostButton}
                    onClick={() => {
                      const d = detail
                      setDetail(null)
                      editHousehold(d)
                    }}
                  >
                    Düzenle
                  </button>
                )}
                {canEdit && detail.review_status !== 'approved' && (
                  <button type="button" className={primaryButton} onClick={() => review(detail, 'approved')}>Onayla</button>
                )}
                {canEdit && detail.review_status === 'applied' && (
                  <button type="button" className={ghostButton} onClick={() => review(detail, 'inspecting')}>İncelemeye Al</button>
                )}
                {canEdit && detail.review_status !== 'rejected' && (
                  <button type="button" className={`${ghostButton} text-rose-600`} onClick={() => review(detail, 'rejected')}>Reddet</button>
                )}
              </div>
            </div>

            <div className="grid gap-2.5 text-xs sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['Aylık Gelir', detail.monthly_income_cents !== null ? formatMoney(detail.monthly_income_cents) : '—'],
                ['Kira', detail.rent_cents !== null ? formatMoney(detail.rent_cents) : '—'],
                ['Aylık Gider', detail.monthly_expense_cents !== null ? formatMoney(detail.monthly_expense_cents) : '—'],
                ['Toplam Borç', detail.debt_cents ? formatMoney(detail.debt_cents) : '—'],
                ['Konut / Isınma', `${meta.housing[detail.housing_status || ''] || '—'} / ${meta.heating[detail.heating_type || ''] || '—'}`],
                ['Saha Bölgesi', detail.region_name || '—'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase text-slate-400">{k}</p>
                  <p className="mt-0.5 font-bold text-slate-800">{v}</p>
                </div>
              ))}
            </div>

            {detail.poverty_reasons.length > 0 && (
              <p className="text-xs font-medium text-slate-600">
                <strong>Yoksulluk Sebepleri:</strong> {detail.poverty_reasons.map((r) => meta.reasons[r] || r).join(', ')}
              </p>
            )}
            {detail.needs && <p className="whitespace-pre-line rounded-xl bg-slate-50 p-3 text-xs text-slate-700">{detail.needs}</p>}
            {detail.inspection_note && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
                İnceleme Notu ({fmtDate(detail.inspected_at)}): {detail.inspection_note}
              </p>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900">Aile Bireyleri ({detail.members.length})</h3>
                {canEdit && (
                  <button type="button" className={ghostButton} onClick={() => setMemberForm({ ...emptyMember })}>
                    + Birey Ekle
                  </button>
                )}
              </div>
              {memberForm && (
                <form onSubmit={saveMember} className="mb-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <TextInput label="Ad Soyad" value={memberForm.full_name} onChange={(v) => setM('full_name', v)} required minLength={2} />
                    <Label label="Yakınlık">
                      <select className={inputClass} value={memberForm.relation} onChange={(e) => setM('relation', e.target.value)}>
                        {Object.entries(meta.relations).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </Label>
                    <Label label="Cinsiyet">
                      <select className={inputClass} value={memberForm.gender} onChange={(e) => setM('gender', e.target.value)}>
                        <option value="">—</option><option value="female">Kadın</option><option value="male">Erkek</option>
                      </select>
                    </Label>
                    <TextInput label="Doğum Tarihi" type="date" value={memberForm.birth_date} onChange={(v) => setM('birth_date', v)} />
                    <TextInput label="Aylık Gelir (₺)" value={memberForm.income} onChange={(v) => setM('income', v)} inputMode="decimal" />
                    <TextInput label="Okul" value={memberForm.school} onChange={(v) => setM('school', v)} />
                    <TextInput label="Beden" value={memberForm.clothing_size} onChange={(v) => setM('clothing_size', v)} />
                    <TextInput label="Ayakkabı No" value={memberForm.shoe_size} onChange={(v) => setM('shoe_size', v)} />
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs font-bold text-slate-700">
                    {([['is_working', 'Çalışıyor'], ['is_student', 'Öğrenci'], ['is_disabled', 'Engelli'], ['has_chronic_illness', 'Kronik hasta']] as const).map(([k, l]) => (
                      <label key={k} className="flex items-center gap-1.5">
                        <input type="checkbox" checked={memberForm[k]} onChange={(e) => setM(k, e.target.checked)} />
                        {l}
                      </label>
                    ))}
                  </div>
                  <TextInput label="Not" value={memberForm.notes} onChange={(v) => setM('notes', v)} />
                  <div className="flex gap-2">
                    <button type="submit" className={primaryButton}>Kaydet</button>
                    <button type="button" className={ghostButton} onClick={() => setMemberForm(null)}>Vazgeç</button>
                  </div>
                </form>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <Tr>
                      <Th>Ad Soyad</Th><Th>Yakınlık</Th><Th>Doğum</Th><Th>Durum</Th><Th>Gelir</Th><Th>Beden / Ayakkabı</Th><Th />
                    </Tr>
                  </THead>
                  <TBody>
                    {detail.members.map((m) => (
                      <Tr key={m.id}>
                        <Td className="font-bold">{m.full_name}</Td>
                        <Td>{m.relation_label}</Td>
                        <Td>{fmtDate(m.birth_date)}</Td>
                        <Td>{[m.is_working && 'Çalışıyor', m.is_student && `Öğrenci${m.school ? ` (${m.school})` : ''}`, m.is_disabled && 'Engelli', m.has_chronic_illness && 'Kronik hasta'].filter(Boolean).join(', ') || '—'}</Td>
                        <Td>{m.monthly_income_cents ? formatMoney(m.monthly_income_cents) : '—'}</Td>
                        <Td>{[m.clothing_size, m.shoe_size].filter(Boolean).join(' / ') || '—'}</Td>
                        <Td className="whitespace-nowrap text-right">
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                className="mr-2 font-bold text-emerald-700"
                                onClick={() =>
                                  setMemberForm({
                                    id: m.id, full_name: m.full_name, relation: m.relation, gender: m.gender || '', birth_date: m.birth_date || '',
                                    is_disabled: m.is_disabled, has_chronic_illness: m.has_chronic_illness, is_student: m.is_student, school: m.school || '',
                                    is_working: m.is_working, income: lira(m.monthly_income_cents), clothing_size: m.clothing_size || '', shoe_size: m.shoe_size || '', notes: m.notes || '',
                                  })
                                }
                              >
                                Düzenle
                              </button>
                              <button
                                type="button"
                                className="font-bold text-rose-600"
                                onClick={async () =>
                                  (await confirmDialog(`${m.full_name} silinsin mi?`)) &&
                                  act(() => adminSend('delete', `/households/${detail.id}/members/${m.id}`), 'Birey silindi', detail.id)
                                }
                              >
                                Sil
                              </button>
                            </>
                          )}
                        </Td>
                      </Tr>
                    ))}
                    {!detail.members.length && (
                      <Tr>
                        <Td colSpan={7} className="text-center text-slate-400">
                          Birey eklenmemiş. Puanın doğru hesaplanması için aile bireylerini girin.
                        </Td>
                      </Tr>
                    )}
                  </TBody>
                </Table>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-black text-slate-900">Hane Yardım Geçmişi</h3>
              <Table>
                <THead>
                  <Tr><Th>Paket</Th><Th>Adet</Th><Th>Durum</Th><Th>Plan Tarihi</Th><Th>Teslim Tarihi</Th></Tr>
                </THead>
                <TBody>
                  {detail.distributions.map((d) => (
                    <Tr key={d.id}>
                      <Td className="font-semibold">{d.package_name}</Td>
                      <Td>{d.quantity}</Td>
                      <Td>{{ planned: 'Planlandı', delivered: 'Teslim edildi', cancelled: 'İptal' }[d.status] || d.status}</Td>
                      <Td>{fmtDate(d.planned_date)}</Td>
                      <Td>{fmtDate(d.delivered_at)}</Td>
                    </Tr>
                  ))}
                  {!detail.distributions.length && (
                    <Tr><Td colSpan={5} className="text-center text-slate-400">Henüz yardım yapılmamış.</Td></Tr>
                  )}
                </TBody>
              </Table>
            </div>
          </div>
        </Modal>
      )}

      {/* CREATE / EDIT HOUSEHOLD MODAL */}
      {form && meta && (
        <Modal
          title={form.id ? 'Hane Kartını Düzenle' : 'Yeni İhtiyaç Sahibi Hane Ekle'}
          size="lg"
          onClose={() => setForm(null)}
        >
          <form onSubmit={saveHousehold} className="space-y-4">
            <fieldset className="grid gap-3 sm:grid-cols-3">
              <TextInput label="Hane Reisi / Başvuran" value={form.full_name} onChange={(v) => set('full_name', v)} required minLength={2} />
              <TextInput label="Telefon" value={form.phone} onChange={(v) => set('phone', v)} />
              <TextInput label="TC Kimlik No" value={form.national_id} onChange={(v) => set('national_id', v)} hint={form.id ? 'Boş bırakılırsa korunur' : undefined} />
            </fieldset>
            <fieldset className="grid gap-3 sm:grid-cols-4">
              <TextInput label="İl" value={form.city} onChange={(v) => set('city', v)} />
              <TextInput label="İlçe" value={form.district} onChange={(v) => set('district', v)} />
              <TextInput label="Mahalle" value={form.neighborhood} onChange={(v) => set('neighborhood', v)} />
              <TextInput label="Sokak" value={form.street} onChange={(v) => set('street', v)} />
              <div className="sm:col-span-2"><TextInput label="Açık Adres" value={form.address} onChange={(v) => set('address', v)} /></div>
              <TextInput label="Enlem (GPS)" value={form.latitude} onChange={(v) => set('latitude', v)} inputMode="decimal" />
              <TextInput label="Boylam (GPS)" value={form.longitude} onChange={(v) => set('longitude', v)} inputMode="decimal" />
              <Label label="Saha Bölgesi">
                <select className={inputClass} value={form.region_id} onChange={(e) => set('region_id', e.target.value)}>
                  <option value="">—</option>
                  {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </Label>
            </fieldset>
            <fieldset className="grid gap-3 sm:grid-cols-4">
              <TextInput label="Hane Büyüklüğü" value={form.household_size} onChange={(v) => set('household_size', v)} inputMode="numeric" />
              <TextInput label="Aylık Toplam Gelir (₺)" value={form.income} onChange={(v) => set('income', v)} inputMode="decimal" />
              <TextInput label="Aylık Kira (₺)" value={form.rent} onChange={(v) => set('rent', v)} inputMode="decimal" />
              <TextInput label="Aylık Gider (₺)" value={form.expense} onChange={(v) => set('expense', v)} inputMode="decimal" />
              <TextInput label="Toplam Borç (₺)" value={form.debt} onChange={(v) => set('debt', v)} inputMode="decimal" />
              <Label label="Konut Durumu">
                <select className={inputClass} value={form.housing_status} onChange={(e) => set('housing_status', e.target.value)}>
                  <option value="">—</option>
                  {Object.entries(meta.housing).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Label>
              <Label label="Isınma Türü">
                <select className={inputClass} value={form.heating_type} onChange={(e) => set('heating_type', e.target.value)}>
                  <option value="">—</option>
                  {Object.entries(meta.heating).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Label>
              <Label label="Derece (Elle)">
                <select className={inputClass} value={form.degree_override} onChange={(e) => set('degree_override', e.target.value)}>
                  <option value="">Otomatik (Puana Göre)</option>
                  {Object.entries(meta.degrees).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Label>
            </fieldset>
            <div>
              <p className="mb-2 text-xs font-bold text-slate-600">Yoksulluk Sebepleri</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(meta.reasons).map(([k, v]) => {
                  const on = form.poverty_reasons.includes(k)
                  return (
                    <button
                      type="button"
                      key={k}
                      onClick={() => set('poverty_reasons', on ? form.poverty_reasons.filter((r) => r !== k) : [...form.poverty_reasons, k])}
                      className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-bold transition ${
                        on ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {v}
                    </button>
                  )
                })}
              </div>
            </div>
            <TextArea label="İhtiyaçlar / Saha Notları" value={form.needs} onChange={(v) => set('needs', v)} rows={2} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={ghostButton} onClick={() => setForm(null)}>Vazgeç</button>
              <button type="submit" className={primaryButton}>Kaydet</button>
            </div>
          </form>
        </Modal>
      )}

      {/* CREATE / EDIT PACKAGE MODAL */}
      {pkgForm && (
        <Modal
          title={pkgForm.id ? 'Yardım Paketini Düzenle' : 'Yeni Kumanya / Yardım Paketi Tanımla'}
          size="md"
          onClose={() => setPkgForm(null)}
        >
          <form onSubmit={savePackage} className="grid gap-3.5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextInput label="Paket Adı" required value={pkgForm.name} onChange={(v) => setPkgForm({ ...pkgForm, name: v })} placeholder="Örn: Ramazan Gıda Kolisi" />
            </div>
            <TextInput label="Birim Maliyet (₺)" required inputMode="decimal" value={pkgForm.cost} onChange={(v) => setPkgForm({ ...pkgForm, cost: v })} />
            <TextInput label="Hazır Stok (Adet)" type="number" min={0} value={pkgForm.stock} onChange={(v) => setPkgForm({ ...pkgForm, stock: v })} />
            <div className="sm:col-span-2">
              <Label label="Bağış Kalemi (Fonlama Takibi)">
                <select className={inputClass} value={pkgForm.campaign} onChange={(e) => setPkgForm({ ...pkgForm, campaign: e.target.value })}>
                  <option value="">—</option>
                  {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </Label>
            </div>
            <div className="sm:col-span-2">
              <TextArea label="Paket İçeriği" rows={2} value={pkgForm.contents} onChange={(v) => setPkgForm({ ...pkgForm, contents: v })} />
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 sm:col-span-2">
              <input type="checkbox" checked={pkgForm.is_active} onChange={(e) => setPkgForm({ ...pkgForm, is_active: e.target.checked })} />
              Paket dağıtım planlamasında aktif olsun
            </label>
            <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
              <button type="button" className={ghostButton} onClick={() => setPkgForm(null)}>Vazgeç</button>
              <button type="submit" className={primaryButton}>Kaydet</button>
            </div>
          </form>
        </Modal>
      )}

      {/* REVIEW MODAL */}
      {reviewModal && (
        <Modal
          title={reviewModal.status === 'approved' ? 'Haneyi Onayla' : 'Başvuruyu Reddet'}
          description={reviewModal.household.full_name}
          size="sm"
          onClose={() => setReviewModal(null)}
        >
          <form onSubmit={submitReview} className="space-y-4">
            <TextArea
              label={reviewModal.status === 'approved' ? 'İnceleme Notu (isteğe bağlı)' : 'Ret Gerekçesi (isteğe bağlı)'}
              value={reviewNote}
              onChange={setReviewNote}
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <button type="button" className={ghostButton} onClick={() => setReviewModal(null)}>Vazgeç</button>
              <button
                type="submit"
                className={reviewModal.status === 'approved' ? primaryButton : 'rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700'}
              >
                {reviewModal.status === 'approved' ? 'Onayla' : 'Reddet'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function BulkPlan({ meta, regions, packages, canEdit, onMessage, onPlanned }: {
  meta: Meta; regions: { id: string; name: string }[]; packages: { id: string; name: string; stock: number }[]; canEdit: boolean
  onMessage: (m: { type: 'ok' | 'error'; text: string } | null) => void
  onPlanned: () => void
}) {
  const [plan, setPlan] = useState({
    package_id: '', degrees: ['critical', 'high'] as Degree[], region_id: '', city: '', district: '', neighborhood: '',
    min_score: '', exclude_helped_days: '30', max_households: '200', quantity: '1', planned_date: '', notes: '',
  })
  const [result, setResult] = useState<{ households: number; packages_needed: number; stock: number; stock_short: number; estimated_cost_cents: number; planned: number; preview: Household[] } | null>(null)

  const run = async (dryRun: boolean) => {
    onMessage(null)
    if (!plan.package_id) {
      onMessage({ type: 'error', text: 'Önce dağıtılacak paketi seçin' })
      return
    }
    try {
      const res = await adminSend<NonNullable<typeof result>>('post', '/households/bulk-plan', {
        ...plan, min_score: plan.min_score ? Number(plan.min_score) : null, exclude_helped_days: Number(plan.exclude_helped_days) || 0,
        max_households: Number(plan.max_households) || 200, quantity: Number(plan.quantity) || 1, planned_date: plan.planned_date || null,
        notes: plan.notes || null, dry_run: dryRun,
      })
      setResult(res.data)
      if (!dryRun) {
        onMessage({ type: 'ok', text: `${res.data.planned} haneye dağıtım planlandı. Dağıtım listesinden teslimatları işaretleyebilirsiniz.` })
        onPlanned()
      }
    } catch (err) {
      onMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }
  const p = (k: keyof typeof plan, v: string) => { setPlan({ ...plan, [k]: v }); setResult(null) }

  return (
    <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
      <div>
        <h3 className="text-base font-black text-slate-900">Puana Göre Otomatik Toplu Dağıtım Planlama</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Belirttiğiniz kriterlere uyan onaylı hanelere en yüksek muhtaçlık puanından başlayarak dağıtım planlanır. Son günlerde yardım almış olanlar otomatik atlanır.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Label label="Dağıtılacak Paket">
          <select className={inputClass} value={plan.package_id} onChange={(e) => p('package_id', e.target.value)}>
            <option value="">Seçin</option>
            {packages.map((x) => <option key={x.id} value={x.id}>{x.name} (Stok: {x.stock})</option>)}
          </select>
        </Label>
        <TextInput label="İl" value={plan.city} onChange={(v) => p('city', v)} />
        <TextInput label="İlçe" value={plan.district} onChange={(v) => p('district', v)} />
        <TextInput label="Mahalle" value={plan.neighborhood} onChange={(v) => p('neighborhood', v)} />
        <Label label="Saha Bölgesi">
          <select className={inputClass} value={plan.region_id} onChange={(e) => p('region_id', e.target.value)}>
            <option value="">Tümü</option>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Label>
        <TextInput label="En Az Puan" value={plan.min_score} onChange={(v) => p('min_score', v)} inputMode="numeric" />
        <TextInput label="Son Kaç Günde Yardım Alanı Atla" value={plan.exclude_helped_days} onChange={(v) => p('exclude_helped_days', v)} inputMode="numeric" />
        <TextInput label="En Fazla Hane Sayısı" value={plan.max_households} onChange={(v) => p('max_households', v)} inputMode="numeric" />
        <TextInput label="Hane Başı Paket Adedi" value={plan.quantity} onChange={(v) => p('quantity', v)} inputMode="numeric" />
        <TextInput label="Planlanan Dağıtım Tarihi" type="date" value={plan.planned_date} onChange={(v) => p('planned_date', v)} />
        <div className="sm:col-span-2"><TextInput label="Dağıtım Notu" value={plan.notes} onChange={(v) => p('notes', v)} /></div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs font-bold">
        {(Object.entries(meta.degrees) as [Degree, string][]).map(([k, v]) => {
          const on = plan.degrees.includes(k)
          return (
            <button
              key={k}
              type="button"
              onClick={() => {
                setPlan({ ...plan, degrees: on ? plan.degrees.filter((d) => d !== k) : [...plan.degrees, k] })
                setResult(null)
              }}
              className={`cursor-pointer rounded-full border px-3 py-1 transition ${
                on ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {v}
            </button>
          )
        })}
      </div>
      <div className="flex gap-2">
        <button type="button" className={ghostButton} onClick={() => run(true)}>Önizle (Simülasyon)</button>
        {canEdit && result && result.households > 0 && result.planned === 0 && (
          <button
            type="button"
            className={primaryButton}
            onClick={async () => (await confirmDialog({ title: `${result.households} haneye dağıtım planlansın mı?`, danger: false })) && run(false)}
          >
            Dağıtım Planını Oluştur ({result.households} Hane)
          </button>
        )}
      </div>
      {result && (
        <div className="space-y-3 pt-2">
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            {[
              ['Kapsanan Hane', result.households],
              ['Gereken Paket', result.packages_needed],
              ['Mevcut Stok', result.stock],
              ['Tahmini Maliyet', formatMoney(result.estimated_cost_cents)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[11px] font-bold text-slate-400">{k}</p>
                <p className="font-black text-slate-800">{v}</p>
              </div>
            ))}
          </div>
          {result.stock_short > 0 && (
            <p className="text-xs font-bold text-amber-700">⚠️ Stok {result.stock_short} paket eksik; teslim sırasında stok yetmezse işlem durur.</p>
          )}
          {result.preview.length > 0 && (
            <Table>
              <THead><Tr><Th>Puan</Th><Th>Hane Reisi</Th><Th>Konum</Th><Th>Son Yardım</Th></Tr></THead>
              <TBody>
                {result.preview.map((h) => (
                  <Tr key={h.id}>
                    <Td><ScoreBadge h={h} /></Td>
                    <Td className="font-bold">{h.full_name}</Td>
                    <Td>{location(h)}</Td>
                    <Td>{fmtDate(h.last_delivery_at)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      )}
    </Card>
  )
}

function Stats({ onSelectHousehold }: { onSelectHousehold: (id: string) => void }) {
  const [level, setLevel] = useState<'city' | 'district' | 'neighborhood'>('neighborhood')
  const [days, setDays] = useState(180)
  const [stats, setStats] = useState<any>(null)
  const [fair, setFair] = useState<any>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    Promise.all([adminGet('/households-stats', { level }), adminGet('/households-fairness', { days })])
      .then(([s, f]) => { setStats(s.data); setFair(f.data) })
      .catch((err) => setError(apiErrorMessage(err, 'Rapor yüklenemedi')))
  }, [level, days])
  if (error) return <p className="text-sm text-rose-600">{error}</p>
  if (!stats || !fair) return <p className="text-sm text-slate-400">Yükleniyor…</p>
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {stats.degrees.map((d: any) => (
          <div key={d.degree} className={`rounded-2xl border p-4 ${DEGREE_STYLE[d.degree as Degree]}`}>
            <p className="text-xs font-bold">{d.label}</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{d.households} Hane</p>
          </div>
        ))}
      </div>

      <Card className="space-y-3 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">Adres Bazlı Yardım Dağılımı (Son 12 Ay)</h2>
          <select className={`${inputClass} w-40`} value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
            <option value="city">İl Bazında</option>
            <option value="district">İlçe Bazında</option>
            <option value="neighborhood">Mahalle Bazında</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <THead><Tr><Th>Konum</Th><Th>Hane</Th><Th>Ort. Puan</Th><Th>Çok Acil</Th><Th>Yüksek</Th><Th>Yardım Alan</Th><Th>Paket</Th></Tr></THead>
            <TBody>
              {stats.rows.map((r: any) => (
                <Tr key={r.label}>
                  <Td className="font-bold">{r.label}</Td>
                  <Td>{r.households}</Td>
                  <Td>{r.avg_score}</Td>
                  <Td className="font-bold text-rose-700">{r.critical}</Td>
                  <Td>{r.high}</Td>
                  <Td>{r.helped_12m}</Td>
                  <Td className="font-bold text-emerald-700">{r.packages_12m}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      </Card>

      <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">Adil Dağıtım & Gözden Kaçan Haneler Analizi</h2>
          <select className={`${inputClass} w-40`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={90}>Son 90 Gün</option>
            <option value={180}>Son 180 Gün</option>
            <option value={365}>Son 1 Yıl</option>
          </select>
        </div>
        <Table>
          <THead><Tr><Th>Derece</Th><Th>Hane</Th><Th>Yardım Alan</Th><Th>Almayan</Th><Th>Yardım Oranı</Th><Th>Hane Başı Paket</Th></Tr></THead>
          <TBody>
            {fair.degrees.map((d: any) => (
              <Tr key={d.degree}>
                <Td className="font-bold">{d.label}</Td>
                <Td>{d.households}</Td>
                <Td>{d.helped}</Td>
                <Td>{d.not_helped}</Td>
                <Td className="font-bold text-emerald-700">%{d.helped_pct}</Td>
                <Td>{d.packages_per_household}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-rose-100 bg-rose-50/30 p-4">
            <h3 className="mb-2 text-xs font-black text-rose-700">
              ⚠️ Gözden Kaçanlar: Çok Acil / Yüksek Ama Bu Dönemde Yardım Almamış ({fair.overlooked.length})
            </h3>
            <Table>
              <TBody>
                {fair.overlooked.map((h: Household) => (
                  <Tr key={h.id} onClick={() => onSelectHousehold(h.id)} className="cursor-pointer hover:bg-rose-50">
                    <Td><ScoreBadge h={h} /></Td>
                    <Td className="font-bold text-slate-900">{h.full_name}</Td>
                    <Td>{location(h)}</Td>
                    <Td className="text-xs text-slate-500">Son: {fmtDate(h.last_delivery_at)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <h3 className="mb-2 text-xs font-black text-slate-700">Bu Dönemde En Çok Yardım Alanlar</h3>
            <Table>
              <TBody>
                {fair.most_helped.map((h: Household) => (
                  <Tr key={h.id} onClick={() => onSelectHousehold(h.id)} className="cursor-pointer hover:bg-slate-100">
                    <Td><ScoreBadge h={h} /></Td>
                    <Td className="font-bold text-slate-900">{h.full_name}</Td>
                    <Td className="font-bold text-emerald-700">{h.total_received} paket</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      </Card>
    </div>
  )
}

function Settings({ meta, canEdit, onSaved, onMessage }: {
  meta: Meta; canEdit: boolean; onSaved: (line: number) => void; onMessage: (m: { type: 'ok' | 'error'; text: string } | null) => void
}) {
  const [line, setLine] = useState(String(meta.poverty_line_cents / 100))
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await adminSend<{ poverty_line_cents: number; rescored: number }>('put', '/households-settings', { poverty_line_cents: toCents(line) })
      onSaved(res.data.poverty_line_cents)
      onMessage({ type: 'ok', text: `Eşik kaydedildi, ${res.data.rescored} hanenin puanı yeniden hesaplandı` })
    } catch (err) {
      onMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }
  return (
    <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">Muhtaçlık Puanlama Eşiği & Formülü</h3>
      </div>
      <form onSubmit={save} className="flex flex-wrap items-end gap-3">
        <div className="w-72">
          <TextInput
            label="Kişi Başı Aylık Yoksulluk Eşiği (₺)"
            value={line}
            onChange={setLine}
            inputMode="decimal"
            disabled={!canEdit}
            hint={`Varsayılan ${formatMoney(meta.default_poverty_line_cents)}.`}
          />
        </div>
        {canEdit && <button type="submit" className={primaryButton}>Kaydet ve Tüm Haneleri Yeniden Puanla</button>}
      </form>
      <div className="rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
        <p className="mb-1 font-bold text-slate-800">Muhtaçlık Puanı Nasıl Hesaplanır? (0–100, yüksek = daha acil ihtiyaç)</p>
        <ul className="list-disc space-y-0.5 pl-5">
          <li>Kişi başı net gelir (gelir − kira) eşiğe göre: en fazla 40 puan</li>
          <li>Çocuk (18 yaş altı), yaşlı (65+), engelli ve kronik hasta birey başına 4: en fazla 20 puan</li>
          <li>Hanede çalışan yoksa: 10 puan · Kirada 8, akraba yanında 4 · Isınma yok 6, soba 3 puan</li>
          <li>Borç oranı: en fazla 6 puan · Her yoksulluk sebebi 2: en fazla 10 puan</li>
        </ul>
      </div>
    </Card>
  )
}
