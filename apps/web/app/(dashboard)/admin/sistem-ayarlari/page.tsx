'use client'

/** STK PRO "Sistem Ayarları": one page with tabs for the settings that live on separate screens in e-infak. */
import { Suspense, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Building2, CreditCard, Landmark, Mail, MessageSquareText, Settings, ShieldCheck } from 'lucide-react'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import { Label, inputClass } from '../../../../components/admin/FormKit'
import { Tabs, toast } from '../../../../components/admin/ui'

const PaymentSmsSettings = dynamic(() => import('../../../../components/admin/PaymentSmsSettings').then((m) => m.PaymentSmsSettings))
const BankaEntegrasyonPanel = dynamic(() => import('../../../../components/admin/muhasebe/BankaEntegrasyonPanel').then((m) => m.BankaEntegrasyonPanel))

type Tab = 'genel' | 'guvenlik' | 'sanal-pos' | 'banka' | 'sms' | 'toplu-mail'
const TABS: { key: Tab; label: string; icon: typeof Settings }[] = [
  { key: 'genel', label: 'Genel', icon: Building2 },
  { key: 'guvenlik', label: 'Güvenlik & Giriş', icon: ShieldCheck },
  { key: 'sanal-pos', label: 'Sanal Pos', icon: CreditCard },
  { key: 'banka', label: 'Banka Entegrasyonu', icon: Landmark },
  { key: 'sms', label: 'SMS', icon: MessageSquareText },
  { key: 'toplu-mail', label: 'Toplu Mail', icon: Mail },
]

export default function SystemSettingsPage() {
  return <Suspense fallback={null}><SystemSettings /></Suspense>
}

function LinkCard({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link href={href} className="block rounded-xl border border-gray-200 bg-white p-4 transition hover:border-primary-400 hover:shadow-sm">
      <div className="text-[14px] font-bold text-gray-900">{title}</div>
      <p className="mt-1 text-[13px] text-gray-500">{text}</p>
    </Link>
  )
}

function SystemSettings() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const raw = params.get('sekme') as Tab | null
  const resolved: Tab = raw && TABS.some((t) => t.key === raw) ? raw : 'genel'
  const [tab, setTab] = useState<Tab>(resolved)
  useEffect(() => { setTab(resolved) }, [resolved])
  const change = (next: Tab) => { setTab(next); router.replace(`${pathname}?sekme=${next}`, { scroll: false }) }
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Settings className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Sistem Ayarları</h1>
      </div>
      <Tabs value={tab} onChange={change} tabs={TABS} />
      {tab === 'genel' && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <LinkCard href="/admin/site-ayarlari" title="Kurum ve site bilgileri" text="Kurum adı, iletişim, banka hesapları, yasal metinler, diller ve alan adı." />
          <LinkCard href="/admin/kurlar" title="Döviz kurları" text="TCMB kurları ve elle kur girişi; dövizli makbuzlarda kullanılır." />
          <LinkCard href="/admin/makbuz-kocanlari" title="Makbuz koçanları" text="Matbu makbuz koçanları ve yaprak numaraları." />
          <LinkCard href="/admin/zakat" title="Zekât ayarları" text="Nisap, altın/gümüş fiyatı ve zekât hesaplayıcısı." />
          <LinkCard href="/admin/paket" title="Paket & Modüller" text="Paketiniz, açık modüller, kullanıcı ve banka hesabı sınırları." />
          <LinkCard href="/admin/integrations" title="API & Webhook" text="Dış sistemlerle bağlantı anahtarları ve bildirim adresleri." />
        </div>
      )}
      {tab === 'guvenlik' && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <LinkCard href="/admin/ip-kurallari" title="IP İzinleri & Engellemeler" text="Panele yalnız belirli IP adreslerinden giriş, istenmeyen adresleri engelleme." />
          <LinkCard href="/admin/aktif-oturumlar" title="Aktif Oturumlar" text="Şu an panelde olan personel ve oturum kapatma." />
          <LinkCard href="/admin/giris-kayitlari" title="Kullanıcı Giriş Logları" text="Kim, ne zaman, hangi IP'den giriş yaptı." />
          <LinkCard href="/admin/users" title="Kullanıcılar & Roller" text="Personel hesapları ve rol yetkileri." />
          <LinkCard href="/admin/sifre" title="Şifremi değiştir" text="Kendi giriş şifreniz." />
        </div>
      )}
      {tab === 'sanal-pos' && <PaymentSmsSettings only="payment" embedded />}
      {tab === 'banka' && <BankaEntegrasyonPanel defaultOpen="api" />}
      {tab === 'sms' && <PaymentSmsSettings only="sms" embedded />}
      {tab === 'toplu-mail' && <MailSettings />}
    </div>
  )
}

function MailSettings() {
  const [form, setForm] = useState<{ from_name: string; reply_to: string; from_email: string; provider_ready: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { adminGet<NonNullable<typeof form>>('/mail/settings').then((r) => setForm(r.data)).catch((err) => toast.error(apiErrorMessage(err, 'Yüklenemedi'))) }, [])
  if (!form) return <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
  const save = async () => {
    setBusy(true)
    try { setForm((await adminSend<NonNullable<typeof form>>('put', '/mail/settings', { from_name: form.from_name, reply_to: form.reply_to })).data); toast.ok('Mail ayarları kaydedildi') }
    catch (err) { toast.error(apiErrorMessage(err, 'Kaydedilemedi')) } finally { setBusy(false) }
  }
  return (
    <section className="max-w-2xl space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5">
      <div className={`rounded-lg px-3 py-2 text-[13px] ${form.provider_ready ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
        {form.provider_ready ? `Mailler ${form.from_email} adresinden gönderilir.` : 'Mail sağlayıcısı sunucuda henüz yapılandırılmadı; gönderimler hata verir. Platform yöneticisine bildirin.'}
      </div>
      <Label label="Gönderen adı" hint="Bağışçının gelen kutusunda görünen ad."><input className={inputClass} value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} /></Label>
      <Label label="Yanıt adresi" hint="Bağışçı maili yanıtladığında bu adrese gider."><input type="email" className={inputClass} value={form.reply_to} onChange={(e) => setForm({ ...form, reply_to: e.target.value })} /></Label>
      <button type="button" disabled={busy} onClick={save} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">Kaydet</button>
    </section>
  )
}
