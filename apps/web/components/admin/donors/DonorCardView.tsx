'use client'

/**
 * STK PRO bağışçı kartı (/admin/bagiscilar/[id]): header actions, the editable "Bağışçı Bilgisi" form on the left,
 * donation tabs (Tümü, Kurban, Sponsorluk, Su Kuyusu) on the right and "Görüşme Notu / İşlem Geçmişi" below.
 */
import { scrollToNextSection } from '../muhasebe/OnMuhasebeUI'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Building2, FileDown, MessageSquarePlus, PencilLine, PhoneCall, Plus, Smartphone, Trash2, Users } from 'lucide-react'
import { adminGet, adminSend, apiErrorMessage, downloadFile, formatMoney, hasFeature, useAdminAccess } from '../../../lib/admin-access'
import { STATUS_CLASS, STATUS_LABEL, type SmsMessage } from '../../../lib/sms'
import { inputClass } from '../FormKit'
import { ManualReceiptForm, downloadReceiptPdf } from '../ManualReceiptForm'
import { QuickSmsDialog, sentNotice } from '../QuickSmsDialog'
import { QuickWhatsAppDialog } from '../QuickWhatsAppDialog'
import { DonorReminders } from '../DonorReminders'
import { Modal, WhatsAppIcon, confirmDialog, toast } from '../ui'
import { DonorForm } from './DonorForm'
import { type DonorCard, type DonorOptions, type DonorPerms, KURBAN_TYPE_LABEL, type Staff, formatPhone } from './types'

type DonationTab = 'all' | 'kurban' | 'sponsorship' | 'well'
type LowerTab = 'notes' | 'history' | 'messages' | 'reminders'

const dateTime = (v: string) => new Date(v).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
const date = (v: string) => new Date(v).toLocaleDateString('tr-TR')

const KURBAN_STATUS: Record<string, [string, string]> = {
  waiting: ['Kesilmedi', 'text-rose-600'],
  slaughtered: ['Kesildi', 'text-emerald-600'],
  cancelled: ['İptal', 'text-gray-400'],
}

export function DonorCardView({ donorId, staff, options, perms, canIssue }: {
  donorId: string; staff: Staff[]; options?: DonorOptions; perms: DonorPerms; canIssue: boolean
}) {
  const router = useRouter()
  const { data: access } = useAdminAccess()
  const [card, setCard] = useState<DonorCard | null>(null)
  const [missing, setMissing] = useState(false)
  const [donationTab, setDonationTab] = useState<DonationTab>('all')
  const [lowerTab, setLowerTab] = useState<LowerTab>('notes')
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [smsOpen, setSmsOpen] = useState(false)
  const [waOpen, setWaOpen] = useState(false)
  const [smsLog, setSmsLog] = useState<SmsMessage[]>([])
  const [callLog, setCallLog] = useState<{
    id: string; direction: 'in' | 'out'; status_label: string; talk_seconds: number | null
    recording_url: string | null; note: string | null; started_at: string | null; extension: string | null
  }[]>([])
  const noteRef = useRef<HTMLTextAreaElement>(null)

  const load = async () => {
    try {
      setCard((await adminGet<DonorCard>(`/donors/${donorId}`)).data)
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) setMissing(true)
      else toast.error(apiErrorMessage(err, 'Bağışçı yüklenemedi'))
    }
    adminGet<{ items: SmsMessage[] }>('/sms/messages', { donor_id: donorId, page_size: 30 })
      .then((res) => setSmsLog(res.data.items)).catch(() => setSmsLog([]))
    if (hasFeature(access, 'call_center')) {
      adminGet<{ items: typeof callLog }>('/call-center/calls', { donor_id: donorId, page_size: 20 })
        .then((res) => setCallLog(res.data.items)).catch(() => setCallLog([]))
    }
  }
  useEffect(() => { setCard(null); load() }, [donorId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (missing) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center">
        <Users className="mx-auto mb-3 h-10 w-10 text-gray-300" />
        <h1 className="mb-2 text-lg font-bold text-gray-900">Bağışçı bulunamadı</h1>
        <p className="mb-5 text-sm text-gray-500">Kayıt silinmiş ya da bu bağışçının kartını görme yetkiniz yok.</p>
        <Link href="/admin/bagiscilar" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white">Bağışçılara dön</Link>
      </div>
    )
  }
  if (!card) return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!note.trim()) return
    try {
      await adminSend('post', `/donors/${card.id}/notes`, { content: note.trim() })
      setNote('')
      toast.ok('Not eklendi')
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const remove = async () => {
    const ok = await confirmDialog({ title: `"${card.full_name}" silinsin mi?`, text: 'Bu bağışçının hiç bağışı bulunmuyor. Kayıt kalıcı olarak silinecek.', danger: true })
    if (!ok) return
    try {
      await adminSend('delete', `/donors/${card.id}`)
      toast.ok('Bağışçı kaydı silindi')
      router.push('/admin/bagiscilar')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Bağışçı silinemedi'))
    }
  }

  const avg = card.total_donations > 0 ? Math.round(card.total_donated_cents / card.total_donations) : 0
  const tabBtn = (active: boolean) => `-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[13.5px] font-semibold ${active ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`
  const th = 'whitespace-nowrap px-3 py-2 text-left text-[12px] font-bold text-gray-500'
  const td = 'px-3 py-2.5'

  const info: [string, string | null | undefined][] = [
    ['No', card.external_ref],
    ['Üyelik Türü', card.donor_type === 'corporate' ? 'Kurumsal' : 'Bireysel'],
    ['Kurum Adı', card.company_name],
    ['Üyelik Tipi', card.membership_type],
    ['Cep Telefon', formatPhone(card.phone)],
    ['Telefon', formatPhone(card.phone2)],
    ['E-Posta', card.email],
    ['T.C. Kimlik', card.tc_no_masked],
    ['Meslek', card.occupation],
    ['Değerlendirme', card.rating],
    ['Referans', card.referral_source],
    ['Doğum Tarihi', card.birth_date ? date(card.birth_date) : null],
    ['Temsilci', card.assigned_user_name],
    ['Personel', card.staff_user_name],
    ['Adres', [card.neighbourhood, card.district, card.city, card.country].filter(Boolean).join(', ') + (card.address ? ` — ${card.address}` : '')],
    ['Üyelik Tarihi', card.created_at ? dateTime(card.created_at) : null],
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/bagiscilar" aria-label="Bağışçılara dön" className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          {card.donor_type === 'corporate' ? <Building2 className="h-5 w-5" /> : <Users className="h-5 w-5" />}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-gray-900">{card.full_name}</h1>
          <div className="text-[12px] text-gray-500">
            {card.external_ref ? `No ${card.external_ref} · ` : ''}{card.total_donations} bağış · {formatMoney(card.total_donated_cents)}
          </div>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {perms.update && (
            <button type="button" onClick={() => setEditing((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50">
              <PencilLine className="h-4 w-4" /> {editing ? 'Düzenlemeyi Kapat' : 'Bağışçıyı Düzenle'}
            </button>
          )}
          {canIssue && (
            <button type="button" onClick={() => setReceiptOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-primary-700">
              <Plus className="h-4 w-4" /> Yeni Makbuz Ekle
            </button>
          )}
          {perms.sms && (
            <button type="button" onClick={() => setSmsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-violet-700">
              <Smartphone className="h-4 w-4" /> SMS Gönder
            </button>
          )}
          {card.phone && (
            <button type="button" onClick={() => setWaOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3.5 py-2 text-[13px] font-semibold text-white hover:brightness-95">
              <WhatsAppIcon className="h-4 w-4" /> WhatsApp
            </button>
          )}
          {perms.notes && (
            <button type="button" onClick={() => { setLowerTab('notes'); setTimeout(() => noteRef.current?.focus(), 50) }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-sky-700">
              <MessageSquarePlus className="h-4 w-4" /> Not Ekle
            </button>
          )}
          {card.phone && <CallButton donorId={card.id} />}
          <button type="button" title="İyilik Karnesi PDF"
            onClick={() => downloadFile(`/admin-features/donors/${card.id}/impact-report.pdf`, `iyilik-karnesi-${card.id}.pdf`).catch(() => toast.error('İyilik karnesi indirilemedi'))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-700 hover:bg-emerald-100">
            <FileDown className="h-4 w-4" /> İyilik Karnesi
          </button>
          {perms.remove && card.total_donations === 0 && (
            <button type="button" onClick={remove} title="Bağışı olmayan kaydı sil" aria-label="Bağışçıyı sil"
              className="rounded-lg p-2 text-gray-400 hover:bg-rose-50 hover:text-rose-600">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-12">
        {/* Bağışçı Bilgisi */}
        <section className="rounded-2xl border border-slate-200/80 bg-white xl:col-span-5">
          <h2 className="border-b border-gray-100 px-5 py-3.5 text-[15px] font-bold text-gray-900">Bağışçı Bilgisi</h2>
          <div className="p-5">
            {editing && perms.update ? (
              <DonorForm donor={card} staff={staff} options={options} onCancel={() => setEditing(false)}
                onSaved={() => { toast.ok('Bağışçı güncellendi'); setEditing(false); load() }} />
            ) : (
              <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2.5 text-[13.5px]">
                {info.filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="font-medium text-gray-500">{k}</dt>
                    <dd className="min-w-0 break-words font-semibold text-gray-900">{v}</dd>
                  </div>
                ))}
                <dt className="font-medium text-gray-500">İzinler</dt>
                <dd className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                  <span className={`rounded border px-1.5 py-0.5 ${card.allow_sms ? 'border-emerald-200 text-emerald-700' : 'text-gray-400'}`}>SMS {card.allow_sms ? 'var' : 'yok'}</span>
                  <span className={`rounded border px-1.5 py-0.5 ${card.allow_email ? 'border-emerald-200 text-emerald-700' : 'text-gray-400'}`}>E-posta {card.allow_email ? 'var' : 'yok'}</span>
                </dd>
                {card.tags.length > 0 && (
                  <>
                    <dt className="font-medium text-gray-500">Etiketler</dt>
                    <dd className="flex flex-wrap gap-1">{card.tags.map((t) => <span key={t} className="rounded bg-primary-50 px-1.5 py-0.5 text-[11px] font-semibold text-primary-700">{t}</span>)}</dd>
                  </>
                )}
              </dl>
            )}
          </div>
        </section>

        <div className="space-y-5 xl:col-span-7">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              ['Toplam', formatMoney(card.total_donated_cents)],
              ['Bağış sayısı', String(card.total_donations)],
              ['Ortalama', avg ? formatMoney(avg) : '—'],
              ['Son bağış', card.last_donation_at ? date(card.last_donation_at) : '—'],
            ] as const).map(([k, v]) => (
              <button type="button" onClick={scrollToNextSection} key={k} className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-left transition hover:shadow-md">
                <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{k}</div>
                <div className="text-lg font-bold tabular-nums text-gray-900">{v}</div>
              </button>
            ))}
          </div>

          {/* Donations */}
          <section className="rounded-2xl border border-slate-200/80 bg-white">
            <div className="flex overflow-x-auto border-b border-gray-200 px-3" role="tablist">
              {([
                ['all', `Tüm Bağışları (${card.donations.length})`],
                ['kurban', `Kurban Bağışları (${card.kurban_shares.length})`],
                ['sponsorship', `Sponsorluk (${card.sponsorships.length})`],
                ['well', `Su Kuyusu (${card.water_wells.length})`],
              ] as [DonationTab, string][]).map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={donationTab === k} onClick={() => setDonationTab(k)} className={tabBtn(donationTab === k)}>{l}</button>
              ))}
            </div>
            <div className="max-h-[460px] overflow-auto">
              {donationTab === 'all' && (
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-white"><tr className="border-b border-gray-100">
                    <th className={th}>Makbuz</th><th className={th}>Bağış Tarihi</th><th className={th}>Kampanya Adı</th>
                    <th className={`${th} text-right`}>Tutar</th><th className={th}>Personel</th><th className={th} />
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {card.donations.map((d) => (
                      <tr key={d.id} className={d.status !== 'confirmed' ? 'opacity-50' : ''}>
                        <td className={`${td} font-semibold text-primary-700`}>#{d.receipt_number}</td>
                        <td className={`${td} whitespace-nowrap`}>{dateTime(d.paid_at)}</td>
                        <td className={td}>
                          <div className="font-medium text-gray-900">{d.campaign_title || 'Genel Bağış'}</div>
                          <div className="text-[11px] text-gray-400">{d.payment_method_label}{d.on_behalf_of ? ` · Adına: ${d.on_behalf_of}` : ''}{d.intent ? ` · Niyet: ${d.intent}` : ''}</div>
                        </td>
                        <td className={`${td} text-right font-bold tabular-nums`}>{formatMoney(d.amount_cents, d.currency)}</td>
                        <td className={`${td} whitespace-nowrap text-gray-600`}>{d.issued_by_name || (d.is_manual ? '—' : 'Web')}</td>
                        <td className={`${td} text-right`}>
                          <button type="button" onClick={() => downloadReceiptPdf(d.id, d.receipt_number).catch(() => toast.error('PDF indirilemedi'))}
                            className="text-[12px] font-bold text-emerald-700 hover:underline">PDF</button>
                        </td>
                      </tr>
                    ))}
                    {!card.donations.length && <tr><td colSpan={6} className="py-8 text-center text-gray-400">Henüz bağış yok.</td></tr>}
                  </tbody>
                </table>
              )}
              {donationTab === 'kurban' && (
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-white"><tr className="border-b border-gray-100">
                    <th className={th}>Makbuz</th><th className={th}>Organizasyon</th><th className={th}>Kurban No</th>
                    <th className={th}>Türü</th><th className={th}>Kimin Adına</th><th className={th}>Durum</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {card.kurban_shares.map((s) => {
                      const [label, tone] = KURBAN_STATUS[s.status] || [s.status, 'text-gray-500']
                      return (
                        <tr key={s.id}>
                          <td className={`${td} text-primary-700`}>{s.receipt_number ? `#${s.receipt_number}` : '—'}</td>
                          <td className={td}>{s.campaign || '—'}</td>
                          <td className={td}>{s.animal_number ? `${s.animal_number}${s.share_number ? ` / ${s.share_number}. hisse` : ''}` : <span className="text-amber-600">Atanmadı</span>}</td>
                          <td className={td}>{KURBAN_TYPE_LABEL[s.kurban_type] || s.kurban_type}</td>
                          <td className={td}>{s.on_behalf_of || '—'}</td>
                          <td className={`${td} font-semibold ${tone}`}>{label}</td>
                        </tr>
                      )
                    })}
                    {!card.kurban_shares.length && <tr><td colSpan={6} className="py-8 text-center text-gray-400">Kurban bağışı yok.</td></tr>}
                  </tbody>
                </table>
              )}
              {(donationTab === 'sponsorship' || donationTab === 'well') && (() => {
                const rows = donationTab === 'sponsorship' ? card.sponsorships : card.water_wells
                return (
                  <table className="w-full text-[13px]">
                    <thead className="sticky top-0 bg-white"><tr className="border-b border-gray-100">
                      <th className={th}>{donationTab === 'sponsorship' ? 'Sponsorluk' : 'Su Kuyusu'}</th><th className={th}>Taksit</th>
                      <th className={`${th} text-right`}>Tutar</th><th className={th}>Durum</th><th className={th}>Başlangıç</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((p) => (
                        <tr key={p.id}>
                          <td className={`${td} font-medium text-gray-900`}>{p.title || '—'}{p.on_behalf_of ? <div className="text-[11px] text-gray-400">Adına: {p.on_behalf_of}</div> : null}</td>
                          <td className={`${td} tabular-nums`}>{p.installment_count ? `${p.paid_count}/${p.installment_count}` : p.share_count ? `${p.share_count} hisse` : '—'}</td>
                          <td className={`${td} text-right font-bold tabular-nums`}>{p.installment_amount_cents ? formatMoney(p.installment_amount_cents, p.currency) : '—'}</td>
                          <td className={td}>{p.status === 'active' ? 'Devam ediyor' : p.status === 'completed' ? 'Tamamlandı' : p.status === 'cancelled' ? 'İptal' : '—'}</td>
                          <td className={`${td} whitespace-nowrap`}>{p.start_date ? date(p.start_date) : p.created_at ? date(p.created_at) : '—'}</td>
                        </tr>
                      ))}
                      {!rows.length && <tr><td colSpan={5} className="py-8 text-center text-gray-400">Kayıt yok.</td></tr>}
                    </tbody>
                  </table>
                )
              })()}
            </div>
          </section>

          {/* Görüşme Notu / İşlem Geçmişi */}
          <section className="rounded-2xl border border-slate-200/80 bg-white">
            <div className="flex overflow-x-auto border-b border-gray-200 px-3" role="tablist">
              {([
                ['notes', `Görüşme Notu (${card.notes.length})`],
                ['history', 'İşlem Geçmişi'],
                ['messages', `SMS & Çağrılar (${smsLog.length + callLog.length})`],
                ['reminders', 'Hatırlatıcılar'],
              ] as [LowerTab, string][]).map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={lowerTab === k} onClick={() => setLowerTab(k)} className={tabBtn(lowerTab === k)}>{l}</button>
              ))}
            </div>
            <div className="space-y-3 p-4">
              {lowerTab === 'notes' && (
                <>
                  {perms.notes && (
                    <form onSubmit={addNote} className="space-y-2">
                      <textarea ref={noteRef} className={`${inputClass} min-h-[72px]`} maxLength={255} placeholder="Görüşme notu yazın…"
                        value={note} onChange={(e) => setNote(e.target.value)} />
                      <div className="flex items-center justify-between text-[12px] text-gray-400">
                        <span>{note.length} / 255</span>
                        <button type="submit" disabled={!note.trim()} className="rounded-lg bg-primary-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-primary-700 disabled:opacity-50">Not Ekle</button>
                      </div>
                    </form>
                  )}
                  <ul className="space-y-2">
                    {card.notes.map((n) => (
                      <li key={n.id} className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3">
                        <div className="whitespace-pre-line text-[13.5px] font-medium text-gray-900">{n.content}</div>
                        <div className="mt-1 text-[11.5px] text-gray-400">{n.author || 'Sistem'} · {dateTime(n.created_at)}</div>
                      </li>
                    ))}
                    {!card.notes.length && <li className="py-4 text-center text-[13px] text-gray-400">Henüz görüşme notu yok.</li>}
                  </ul>
                </>
              )}
              {lowerTab === 'history' && (
                <ul className="divide-y divide-gray-100">
                  {card.history.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 text-[13px]">
                      <span className="font-semibold text-gray-900">{h.action}</span>
                      {h.fields.length > 0 && <span className="text-gray-500">{h.fields.join(', ')}</span>}
                      <span className="ms-auto whitespace-nowrap text-[12px] text-gray-400">{h.user || 'Sistem'} · {dateTime(h.created_at)}</span>
                    </li>
                  ))}
                  {!card.history.length && <li className="py-4 text-center text-[13px] text-gray-400">Kayıtlı işlem yok.</li>}
                </ul>
              )}
              {lowerTab === 'messages' && (
                <ul className="space-y-2">
                  {callLog.map((c) => (
                    <li key={c.id} className="rounded-xl border border-gray-100 px-4 py-2.5 text-[13px]">
                      <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-gray-500">
                        <PhoneCall className="h-3.5 w-3.5" /><span className="font-bold text-gray-700">{c.direction === 'in' ? 'Gelen çağrı' : 'Giden çağrı'}</span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-semibold text-gray-700">{c.status_label}</span>
                        {c.talk_seconds != null && <span>{Math.floor(c.talk_seconds / 60)}:{String(c.talk_seconds % 60).padStart(2, '0')}</span>}
                        {c.started_at && <span>{dateTime(c.started_at)}</span>}
                      </div>
                      {c.note && <div className="mt-1 whitespace-pre-line text-gray-700">{c.note}</div>}
                      {c.recording_url && <audio controls preload="none" src={c.recording_url} className="mt-1 h-7 w-52" />}
                    </li>
                  ))}
                  {smsLog.map((m) => (
                    <li key={m.id} className="rounded-xl border border-gray-100 px-4 py-2.5 text-[13px]">
                      <div className="flex items-center gap-2 text-[11.5px] text-gray-400">
                        <Smartphone className="h-3.5 w-3.5" /><span className="font-bold text-gray-600">SMS #{m.seq_no}</span>
                        <span className={`rounded border px-1.5 py-0.5 font-bold ${STATUS_CLASS[m.status]}`}>{STATUS_LABEL[m.status]}</span>
                        <span>{dateTime(m.sent_at || m.send_after)}</span>
                      </div>
                      <div className="mt-1 whitespace-pre-line text-gray-700">{m.body}</div>
                      {m.error && <div className="text-[11px] text-rose-600">{m.error}</div>}
                    </li>
                  ))}
                  {!smsLog.length && !callLog.length && <li className="py-4 text-center text-[13px] text-gray-400">SMS veya çağrı kaydı yok.</li>}
                </ul>
              )}
              {lowerTab === 'reminders' && <DonorReminders donorId={card.id} donorName={card.full_name} />}
            </div>
          </section>
        </div>
      </div>

      {receiptOpen && (
        <Modal title="Yeni Makbuz" description={card.full_name} size="lg" onClose={() => setReceiptOpen(false)}>
          <ManualReceiptForm
            presetDonor={{ id: card.id, full_name: card.full_name, phone: card.phone, email: card.email }}
            onDone={(r) => {
              const kurbanNo = [...new Set((r.kurban_shares || []).map((s) => s.animal_number).filter(Boolean))]
              toast.ok(`${r.receipt_number} numaralı makbuz kesildi${kurbanNo.length ? ` · Kurban No: ${kurbanNo.join(', ')}` : ''}`)
              setReceiptOpen(false)
              load()
            }}
          />
        </Modal>
      )}
      {smsOpen && (
        <QuickSmsDialog
          target={{ donorId: card.id, name: card.full_name, phone: card.phone, allowSms: card.allow_sms }}
          onClose={() => setSmsOpen(false)}
          onSent={(r) => { toast.ok(sentNotice(r)); load() }}
        />
      )}
      {waOpen && (
        <QuickWhatsAppDialog
          target={{ donorId: card.id, name: card.full_name, phone: card.phone }}
          onClose={() => setWaOpen(false)}
        />
      )}
    </div>
  )
}

/** Click-to-call through the organisation's cloud PBX (NetGSM Netsantral): the staff extension rings first. */
export function CallButton({ donorId, compact }: { donorId: string; compact?: boolean }) {
  const { data: access } = useAdminAccess()
  const [busy, setBusy] = useState(false)
  const [extModal, setExtModal] = useState(false)
  const [extValue, setExtValue] = useState('')
  if (!hasFeature(access, 'call_center') || !access?.features.includes('call_center')) return null
  const call = async () => {
    setBusy(true)
    try {
      const r = await adminSend<{ message: string }>('post', '/call-center/call', { donor_id: donorId })
      toast.ok(r.data.message)
    } catch (err) {
      const msg = apiErrorMessage(err, 'Arama başlatılamadı')
      if (msg.toLowerCase().includes('dahili')) setExtModal(true)
      else toast.error(msg)
    } finally {
      setBusy(false)
    }
  }
  const saveExtensionAndCall = async (e: React.FormEvent) => {
    e.preventDefault()
    const clean = extValue.replace(/\D/g, '')
    if (!clean) return
    setBusy(true)
    try {
      await adminSend('put', '/call-center/my-extension', { extension: clean })
      setExtModal(false)
      const r = await adminSend<{ message: string }>('post', '/call-center/call', { donor_id: donorId })
      toast.ok(r.data.message)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Dahili kaydedilemedi'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      {compact ? (
        <button type="button" disabled={busy} onClick={call} title="Santralden ara" aria-label="Santralden ara"
          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-sky-50 hover:text-sky-600 disabled:opacity-50">
          <PhoneCall className="h-4 w-4" />
        </button>
      ) : (
        <button type="button" disabled={busy} onClick={call}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-[13px] font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50">
          <PhoneCall className="h-4 w-4" /> {busy ? 'Aranıyor…' : 'Santralden ara'}
        </button>
      )}
      {extModal && (
        <Modal title="Santral dahilinizi tanımlayın" description="Aramaların önce telefonunuzu çaldırması için santral dahili numaranızı girin." onClose={() => setExtModal(false)} size="sm"
          footer={<button type="button" disabled={busy || !extValue.trim()} className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50" onClick={saveExtensionAndCall}>{busy ? 'Kaydediliyor…' : 'Kaydet ve Ara'}</button>}>
          <form onSubmit={saveExtensionAndCall}>
            <input className={inputClass} inputMode="numeric" autoFocus placeholder="ör. 101" value={extValue} onChange={(e) => setExtValue(e.target.value.replace(/\D/g, ''))} />
          </form>
        </Modal>
      )}
    </>
  )
}
