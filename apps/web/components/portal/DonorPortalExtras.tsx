'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { Bell, CalendarHeart, CheckCircle2, Download, MessageSquarePlus, MoonStar, Plus, Send, Smartphone, Trash2, Users, X } from 'lucide-react'
import { errorMessage } from '../../lib/api-error'

export interface PortalNotificationItem {
  id: string
  title: string
  body: string
  tone: 'emerald' | 'amber' | 'sky'
  tab?: string
}

export interface SupportRequestItem {
  id: string
  message: string
  is_read: boolean
  status: string
  created_at: string
}

export interface BillingProfile {
  id: string
  kind: 'individual' | 'family' | 'corporate'
  title: string
  full_name: string
  tax_or_tc: string
  tax_office?: string
  is_default?: boolean
}

interface ZekatGoal {
  target_amount: number
  currency: 'TRY' | 'EUR' | 'USD'
  due_date: string
  hijri_note: string
  remind_enabled: boolean
  count_all_donations: boolean
}

interface SadaqaSchedule {
  key: 'friday' | 'kandil' | 'ramadan_last10'
  label: string
  description: string
  enabled: boolean
  amount: number
}

const DEFAULT_SCHEDULES: SadaqaSchedule[] = [
  { key: 'friday', label: 'Her Cuma Sadakası', description: 'Her Cuma günü düzenli sadaka hatırlatması', enabled: false, amount: 100 },
  { key: 'kandil', label: 'Kandil Geceleri', description: 'Regaip, Miraç, Berat ve Mevlid kandillerinde sadaka', enabled: false, amount: 250 },
  { key: 'ramadan_last10', label: 'Ramazan Son 10 Gece', description: 'Kadir Gecesi niyetiyle her gece otomatik hatırlatma', enabled: false, amount: 100 },
]

function prefKey(donorId: string, suffix: string) {
  return `einfak-portal:${donorId || 'anon'}:${suffix}`
}

export function ZekatAndCalendarSection({
  donorId,
  confirmedDonations,
  onCreateWeeklyReminder,
}: {
  donorId: string
  confirmedDonations: Array<{ amount_lira: number; currency: string; created_at: string; campaign_title?: string | null; donor_message?: string | null }>
  onCreateWeeklyReminder: (amount: number, frequency: 'weekly' | 'monthly', label: string) => Promise<void>
}) {
  const [goal, setGoal] = useState<ZekatGoal>({
    target_amount: 0,
    currency: 'TRY',
    due_date: '',
    hijri_note: 'Ramazan 15',
    remind_enabled: true,
    count_all_donations: false,
  })
  const [schedules, setSchedules] = useState<SadaqaSchedule[]>(DEFAULT_SCHEDULES)
  const [savedNotice, setSavedNotice] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)

  useEffect(() => {
    try {
      const savedGoal = JSON.parse(localStorage.getItem(prefKey(donorId, 'zekat')) || 'null')
      if (savedGoal && typeof savedGoal === 'object') setGoal((prev) => ({ ...prev, ...savedGoal }))
      const savedSched = JSON.parse(localStorage.getItem(prefKey(donorId, 'sadaqa')) || 'null')
      if (Array.isArray(savedSched) && savedSched.length) setSchedules(savedSched)
    } catch { /* ignore */ }
  }, [donorId])

  const saveGoal = (e: React.FormEvent) => {
    e.preventDefault()
    try { localStorage.setItem(prefKey(donorId, 'zekat'), JSON.stringify(goal)) } catch { /* ignore */ }
    setSavedNotice('Zekât takip hedefiniz kaydedildi.')
    setTimeout(() => setSavedNotice(''), 2500)
  }

  const updateSchedule = (key: SadaqaSchedule['key'], patch: Partial<SadaqaSchedule>) => {
    setSchedules((prev) => {
      const next = prev.map((s) => (s.key === key ? { ...s, ...patch } : s))
      try { localStorage.setItem(prefKey(donorId, 'sadaqa'), JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  const currentYear = new Date().getFullYear()
  const matchingDonations = confirmedDonations.filter((d) => {
    if (new Date(d.created_at).getFullYear() !== currentYear) return false
    if (d.currency !== goal.currency) return false
    if (goal.count_all_donations) return true
    const text = `${d.campaign_title || ''} ${d.donor_message || ''}`.toLocaleLowerCase('tr')
    return text.includes('zekat') || text.includes('zekât') || text.includes('fitre')
  })
  const paidAmount = matchingDonations.reduce((sum, d) => sum + d.amount_lira, 0)
  const remaining = Math.max(0, (goal.target_amount || 0) - paidAmount)
  const pct = goal.target_amount > 0 ? Math.min(100, Math.round((paidAmount / goal.target_amount) * 100)) : 0

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MoonStar className="h-5 w-5 text-primary-700" aria-hidden="true" />
            <h3 className="font-heading text-lg font-bold text-slate-900">Zekât &amp; Fitre Takipçisi ({currentYear})</h3>
          </div>
          <Link href="/zekat-hesapla" className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-bold text-primary-700 hover:bg-primary-100">
            Zekât Hesapla →
          </Link>
        </div>

        {savedNotice && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-800">
            {savedNotice}
          </div>
        )}

        {goal.target_amount > 0 && (
          <div className="mb-5 rounded-xl border border-primary-100 bg-primary-50/50 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-primary-700">Yıllık Zekât İlerlemesi</p>
                <p className="mt-1 text-2xl font-black text-slate-900">
                  {paidAmount.toLocaleString('tr-TR')} / {goal.target_amount.toLocaleString('tr-TR')} {goal.currency}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Kalan: <b>{remaining.toLocaleString('tr-TR')} {goal.currency}</b>
                  {goal.due_date ? ` · Hedef tarih: ${goal.due_date}` : ''}
                  {goal.hijri_note ? ` (${goal.hijri_note})` : ''}
                </p>
              </div>
              {remaining > 0 && (
                <Link
                  href="/kampanyalar"
                  className="rounded-xl bg-primary-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-800"
                >
                  Kalanı Öde ({remaining.toLocaleString('tr-TR')} {goal.currency})
                </Link>
              )}
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white ring-1 ring-primary-200">
              <div className="h-full bg-primary-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">%{pct} tamamlandı ({matchingDonations.length} bağış eşleşti)</p>
          </div>
        )}

        <form onSubmit={saveGoal} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-semibold text-slate-700">
            <span>Yıllık Zekât Hedefi</span>
            <input
              type="number"
              min={0}
              step={100}
              value={goal.target_amount || ''}
              onChange={(e) => setGoal((g) => ({ ...g, target_amount: Number(e.target.value) || 0 }))}
              placeholder="Örn. 25000"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-600"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-700">
            <span>Para Birimi</span>
            <select
              value={goal.currency}
              onChange={(e) => setGoal((g) => ({ ...g, currency: e.target.value as ZekatGoal['currency'] }))}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-600"
            >
              <option value="TRY">TRY (₺)</option>
              <option value="EUR">EUR (€)</option>
              <option value="USD">USD ($)</option>
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-700">
            <span>Zekât Tarihi (Miladi)</span>
            <input
              type="date"
              value={goal.due_date}
              onChange={(e) => setGoal((g) => ({ ...g, due_date: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-600"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-700">
            <span>Hicri Not</span>
            <input
              type="text"
              value={goal.hijri_note}
              onChange={(e) => setGoal((g) => ({ ...g, hijri_note: e.target.value }))}
              placeholder="Örn. 15 Ramazan"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-600"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 lg:col-span-4">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={goal.count_all_donations}
                onChange={(e) => setGoal((g) => ({ ...g, count_all_donations: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-primary-600"
              />
              Bu yılki tüm onaylı bağışlarımı zekât hedefinden düş (işaretsizse yalnızca Zekât/Fitre bağışları sayılır)
            </label>
            <button type="submit" className="rounded-xl bg-primary-700 px-5 py-2 text-xs font-bold text-white hover:bg-primary-800">
              Hedefi Kaydet
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <CalendarHeart className="h-5 w-5 text-primary-700" aria-hidden="true" />
          <h3 className="font-heading text-lg font-bold text-slate-900">Cuma, Kandil &amp; Ramazan Sadaka Takvimi</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {schedules.map((item) => (
            <div key={item.key} className={`flex flex-col justify-between gap-3 rounded-xl border p-4 transition ${item.enabled ? 'border-primary-300 bg-primary-50/40' : 'border-slate-200 bg-slate-50/60'}`}>
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-900">{item.label}</h4>
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(e) => updateSchedule(item.key, { enabled: e.target.checked })}
                    aria-label={item.label}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">{item.description}</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={10}
                    step={10}
                    value={item.amount}
                    onChange={(e) => updateSchedule(item.key, { amount: Math.max(10, Number(e.target.value) || 10) })}
                    className="w-24 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-900"
                  />
                  <span className="text-xs font-semibold text-slate-500">TL</span>
                </div>
                <button
                  type="button"
                  disabled={busyKey === item.key}
                  onClick={async () => {
                    setBusyKey(item.key)
                    try {
                      await onCreateWeeklyReminder(item.amount, item.key === 'friday' ? 'weekly' : 'monthly', item.label)
                      updateSchedule(item.key, { enabled: true })
                    } finally {
                      setBusyKey(null)
                    }
                  }}
                  className="w-full rounded-lg bg-primary-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-primary-800 disabled:opacity-60"
                >
                  {busyKey === item.key ? 'Oluşturuluyor…' : 'SMS Talimatı Olarak Ekle'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export function DonorRequestsSection({
  apiBaseUrl,
  authHeader,
  requests,
  onCreated,
}: {
  apiBaseUrl: string
  authHeader: Record<string, string>
  requests: SupportRequestItem[]
  onCreated: (item: SupportRequestItem) => void
}) {
  const [category, setCategory] = useState('makbuz')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim().length < 5) {
      setFeedback({ type: 'err', text: 'Lütfen talebinizi en az 5 karakter olarak yazın.' })
      return
    }
    setSending(true)
    setFeedback(null)
    try {
      const res = await axios.post(
        `${apiBaseUrl}/api/v1/portal/me/requests`,
        { category, message: message.trim() },
        { headers: authHeader },
      )
      onCreated(res.data)
      setMessage('')
      setFeedback({ type: 'ok', text: 'Talebiniz kurum yetkililerine iletildi.' })
    } catch (err) {
      setFeedback({ type: 'err', text: errorMessage(err, 'Talep gönderilemedi.') })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <MessageSquarePlus className="h-5 w-5 text-primary-700" aria-hidden="true" />
          <h3 className="font-heading text-lg font-bold text-slate-900">Yeni Talep / Destek Mesajı</h3>
        </div>
        {feedback && (
          <div className={`mb-4 rounded-xl border px-3.5 py-2.5 text-xs font-bold ${feedback.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
            {feedback.text}
          </div>
        )}
        <form onSubmit={submit} className="space-y-3.5">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Talep Konusu</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary-600"
            >
              <option value="makbuz">Makbuz / İsim Düzeltme</option>
              <option value="kurban">Kurban Hisse / Vekalet Değişikliği</option>
              <option value="kuyu">Su Kuyusu Tabelası Yazısı</option>
              <option value="diger">Diğer Destek Talebi</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Açıklamanız</label>
            <textarea
              rows={3}
              required
              minLength={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Örn. #12345 numaralı makbuzdaki adın düzeltilmesini rica ederim…"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-600"
            />
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={sending} className="inline-flex items-center gap-2 rounded-xl bg-primary-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-800 disabled:opacity-60">
              <Send className="h-4 w-4" aria-hidden="true" />
              {sending ? 'Gönderiliyor…' : 'Talebi Gönder'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="mb-4 font-heading text-lg font-bold text-slate-900">Gönderdiğim Talepler</h3>
        {requests.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">
            Henüz iletilmiş destek talebiniz bulunmuyor.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-col justify-between gap-2 py-3.5 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <p className="text-sm text-slate-800">{r.message}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {new Date(r.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${r.is_read ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {r.is_read && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
                  {r.is_read ? 'İncelendi' : 'İletildi'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export function BillingProfilesCard({ donorId }: { donorId: string }) {
  const [profiles, setProfiles] = useState<BillingProfile[]>([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<Omit<BillingProfile, 'id'>>({
    kind: 'family',
    title: '',
    full_name: '',
    tax_or_tc: '',
    tax_office: '',
    is_default: false,
  })

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(prefKey(donorId, 'billing-profiles')) || '[]')
      if (Array.isArray(saved)) setProfiles(saved)
    } catch { /* ignore */ }
  }, [donorId])

  const persist = (next: BillingProfile[]) => {
    setProfiles(next)
    try { localStorage.setItem(prefKey(donorId, 'billing-profiles'), JSON.stringify(next)) } catch { /* ignore */ }
  }

  const addProfile = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.full_name.trim()) return
    const item: BillingProfile = {
      id: `${Date.now()}`,
      ...form,
      title: form.title.trim() || (form.kind === 'corporate' ? 'Şirket Profili' : 'Aile Profili'),
    }
    const next = item.is_default
      ? [...profiles.map((p) => ({ ...p, is_default: false })), item]
      : [...profiles, item]
    persist(next)
    setForm({ kind: 'family', title: '', full_name: '', tax_or_tc: '', tax_office: '', is_default: false })
    setAdding(false)
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary-700" aria-hidden="true" />
          <h3 className="font-heading text-lg font-bold text-slate-900">Aile &amp; Kurum Makbuz Profilleri</h3>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-bold text-primary-700 hover:bg-primary-100"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Yeni Profil
        </button>
      </div>

      {adding && (
        <form onSubmit={addProfile} className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <select
            value={form.kind}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as BillingProfile['kind'] }))}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="individual">Bireysel</option>
            <option value="family">Aile Ferdi</option>
            <option value="corporate">Kurumsal / Şirket</option>
          </select>
          <input
            type="text"
            placeholder="Profil adı (Örn. Şirketim / Annem)"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <input
            type="text"
            required
            placeholder={form.kind === 'corporate' ? 'Firma Ünvanı' : 'Ad Soyad'}
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder={form.kind === 'corporate' ? 'Vergi No' : 'TCKN (isteğe bağlı)'}
            value={form.tax_or_tc}
            onChange={(e) => setForm((f) => ({ ...f, tax_or_tc: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          {form.kind === 'corporate' && (
            <input
              type="text"
              placeholder="Vergi Dairesi"
              value={form.tax_office || ''}
              onChange={(e) => setForm((f) => ({ ...f, tax_office: e.target.value }))}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-2"
            />
          )}
          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={Boolean(form.is_default)}
                onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-primary-600"
              />
              Varsayılan makbuz profili yap
            </label>
            <button type="submit" className="rounded-xl bg-primary-700 px-4 py-2 text-xs font-bold text-white hover:bg-primary-800">
              Ekle
            </button>
          </div>
        </form>
      )}

      {profiles.length === 0 ? (
        <p className="text-xs text-slate-500">
          Hem kendi adınıza hem şirketiniz veya aile fertleriniz adına bağış yapıyorsanız hızlı makbuz profilleri kaydedebilirsiniz.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {profiles.map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 p-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">{p.title}</span>
                  {p.is_default && <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-bold text-primary-800">Varsayılan</span>}
                </div>
                <p className="mt-0.5 text-xs text-slate-700">{p.full_name}</p>
                {p.tax_or_tc && <p className="text-[11px] text-slate-500">{p.kind === 'corporate' ? 'VKN' : 'TCKN'}: {p.tax_or_tc}{p.tax_office ? ` · ${p.tax_office}` : ''}</p>}
              </div>
              <button
                type="button"
                aria-label="Profili sil"
                onClick={() => persist(profiles.filter((x) => x.id !== p.id))}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PwaAndPushCard() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [notifPerm, setNotifPerm] = useState<string>('default')

  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsIos(/iphone|ipad|ipod/i.test(window.navigator.userAgent))
    if ('Notification' in window) setNotifPerm(Notification.permission)
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => { setInstalled(true); setDeferredPrompt(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const installApp = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    setDeferredPrompt(null)
  }

  const enableNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    const result = await Notification.requestPermission()
    setNotifPerm(result)
    if (result === 'granted') {
      try {
        new Notification('Bağışçı Paneli Bildirimleri Açık', {
          body: 'Kurban videolarınız ve kuyu güncellemeleriniz hazır olduğunda bildirim alacaksınız.',
          icon: '/images/e-infak/mark.png',
        })
      } catch { /* ignore */ }
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Smartphone className="h-5 w-5 text-primary-700" aria-hidden="true" />
        <h3 className="font-heading text-lg font-bold text-slate-900">Uygulama Gibi Kullan &amp; Anlık Bildirim</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold text-slate-800">Ana Ekrana Ekle (PWA)</p>
          <p className="mt-1 text-xs text-slate-500">
            {installed
              ? 'Bağışçı paneli cihazınıza eklendi.'
              : isIos
                ? 'Safari alt menüsünden Paylaş → "Ana Ekrana Ekle" seçeneğine dokunun.'
                : 'Paneli telefonunuza uygulama gibi ekleyip tek dokunuşla açın.'}
          </p>
          {deferredPrompt && !installed && (
            <button type="button" onClick={installApp} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-primary-800">
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Ana Ekrana Ekle
            </button>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold text-slate-800">Tarayıcı Bildirimleri</p>
          <p className="mt-1 text-xs text-slate-500">
            {notifPerm === 'granted'
              ? 'Bildirimler aktif. Kurban ve su kuyusu gelişmeleri anında iletilir.'
              : notifPerm === 'denied'
                ? 'Tarayıcı ayarlarından bildirim izni engellenmiş görünüyor.'
                : 'Kurban videonuz yüklendiğinde veya taksit tarihiniz yaklaştığında haberdar olun.'}
          </p>
          {notifPerm !== 'granted' && notifPerm !== 'denied' && (
            <button type="button" onClick={enableNotifications} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3.5 py-2 text-xs font-bold text-primary-700 hover:bg-primary-100">
              <Bell className="h-3.5 w-3.5" aria-hidden="true" />
              Bildirimlere İzin Ver
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

export function NotificationModal({
  open,
  onClose,
  items,
  readIds,
  onMarkAllRead,
  onOpenTab,
  labels,
}: {
  open: boolean
  onClose: () => void
  items: PortalNotificationItem[]
  readIds: string[]
  onMarkAllRead: () => void
  onOpenTab: (tab: string) => void
  labels: { title: string; markAllRead: string; empty: string }
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-xs sm:items-center sm:p-4">
      <div className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary-700" aria-hidden="true" />
            <h3 className="font-heading text-base font-bold text-slate-900">{labels.title}</h3>
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button type="button" onClick={onMarkAllRead} className="text-xs font-bold text-primary-700 hover:underline">
                {labels.markAllRead}
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto px-5 py-2">
          {items.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">{labels.empty}</p>
          ) : (
            items.map((n) => {
              const unread = !readIds.includes(n.id)
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => { if (n.tab) onOpenTab(n.tab); onClose() }}
                  className={`flex w-full items-start gap-3 py-3.5 text-left transition hover:bg-slate-50 ${unread ? 'font-semibold' : 'opacity-75'}`}
                >
                  <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${unread ? (n.tone === 'amber' ? 'bg-amber-500' : n.tone === 'sky' ? 'bg-sky-500' : 'bg-emerald-500') : 'bg-slate-200'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">{n.title}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{n.body}</p>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
