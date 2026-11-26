'use client'

import { useEffect, useState } from 'react'
import { Copy, Download, QrCode, Trash2 } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminBlob, adminGet, adminSend, apiErrorMessage } from '../../../lib/admin-access'
import { Label, ghostButton, inputClass, primaryButton } from '../FormKit'
import { toast } from '../ui'
import { Toggle } from './shared'

interface Rule { keywords: string[]; text: string; buttons: string[]; url?: string | null; url_label?: string | null }
interface WaSettings {
  notify_staff: boolean
  display_phone: string
  consent: {
    require_opt_in_for_bulk: boolean; checkout_checkbox: boolean; opt_out_keywords: string[]; opt_in_keywords: string[]
    opt_out_reply: string; opt_in_reply: string
  }
  auto_reply: {
    welcome: { enabled: boolean; text: string; buttons: string[] }
    away: { enabled: boolean; text: string; start: string; end: string; days: string[] }
    rules: Rule[]
  }
}

const DAYS: [string, string][] = [['mon', 'Pzt'], ['tue', 'Sal'], ['wed', 'Çar'], ['thu', 'Per'], ['fri', 'Cum'], ['sat', 'Cmt'], ['sun', 'Paz']]
const words = (value: string) => value.split(',').map((w) => w.trim()).filter(Boolean)

function useSettings() {
  const [data, setData] = useState<WaSettings | null>(null)
  useEffect(() => {
    adminGet<WaSettings>('/whatsapp/settings').then((r) => setData(r.data)).catch((err) => toast.error(apiErrorMessage(err)))
  }, [])
  const save = async (patch: Partial<WaSettings>) => {
    try {
      setData((await adminSend<WaSettings>('put', '/whatsapp/settings', patch)).data)
      toast.ok('Kaydedildi')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kaydedilemedi'))
    }
  }
  return { data, setData, save }
}

export function AutoReplyTab({ canManage }: { canManage: boolean }) {
  const { data, setData, save } = useSettings()
  if (!data) return null
  const ar = data.auto_reply
  const set = (patch: Partial<WaSettings['auto_reply']>) => setData({ ...data, auto_reply: { ...ar, ...patch } })
  const setRule = (i: number, patch: Partial<Rule>) => set({ rules: ar.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-6">
        <h2 className="font-bold text-gray-900">Karşılama mesajı</h2>
        <Toggle checked={ar.welcome.enabled} onChange={(v) => set({ welcome: { ...ar.welcome, enabled: v } })} label="İlk kez yazan kişiye otomatik karşılama gönder" />
        <textarea className={`${inputClass} min-h-[90px]`} maxLength={1024} value={ar.welcome.text} onChange={(e) => set({ welcome: { ...ar.welcome, text: e.target.value } })} />
        <Label label="Butonlar (en fazla 3, her biri 20 karakter)" hint="Butonun yazısı bir kuralın anahtar kelimesiyle aynıysa, basınca o kuralın cevabı gider.">
          <div className="grid gap-2 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <input key={i} className={inputClass} maxLength={20} value={ar.welcome.buttons[i] || ''}
                onChange={(e) => { const b = [...ar.welcome.buttons]; b[i] = e.target.value; set({ welcome: { ...ar.welcome, buttons: b.filter((x, j) => x || j < i) } }) }} />
            ))}
          </div>
        </Label>
        <h2 className="pt-2 font-bold text-gray-900">Mesai dışı mesajı</h2>
        <Toggle checked={ar.away.enabled} onChange={(v) => set({ away: { ...ar.away, enabled: v } })} label="Çalışma saatleri dışında otomatik cevap ver" hint="Aynı kişiye 12 saatte en fazla bir kez gider." />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input type="time" className={`${inputClass} max-w-[120px]`} value={ar.away.start} onChange={(e) => set({ away: { ...ar.away, start: e.target.value } })} /> –
          <input type="time" className={`${inputClass} max-w-[120px]`} value={ar.away.end} onChange={(e) => set({ away: { ...ar.away, end: e.target.value } })} />
          {DAYS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={ar.away.days.includes(k)}
              onChange={(e) => set({ away: { ...ar.away, days: e.target.checked ? [...ar.away.days, k] : ar.away.days.filter((d) => d !== k) } })} />{label}</label>
          ))}
        </div>
        <textarea className={`${inputClass} min-h-[70px]`} maxLength={1024} value={ar.away.text} onChange={(e) => set({ away: { ...ar.away, text: e.target.value } })} />
        <p className="text-xs text-gray-500">Metinlerde {'{kurum}'}, {'{ad}'}, {'{iban}'}, {'{kurum_unvan}'}, {'{odeme_linki}'}, {'{portal}'} kullanılabilir.</p>
      </Card>
      <Card className="space-y-4 p-6">
        <h2 className="font-bold text-gray-900">Anahtar kelime cevapları</h2>
        <p className="text-sm text-gray-600">Bağışçının mesajında kelime geçerse ya da butona basarsa bu cevap gider. Örn. “iban, hesap numarası” → hesap bilgileri.</p>
        {ar.rules.map((rule, i) => (
          <div key={i} className="space-y-2 rounded-xl border p-3">
            <div className="flex gap-2">
              <input className={inputClass} placeholder="Anahtar kelimeler (virgülle)" value={rule.keywords.join(', ')} onChange={(e) => setRule(i, { keywords: words(e.target.value) })} />
              <button type="button" className={ghostButton} onClick={() => set({ rules: ar.rules.filter((_, j) => j !== i) })} aria-label="Kuralı sil"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <textarea className={`${inputClass} min-h-[70px]`} maxLength={1024} placeholder="Cevap" value={rule.text} onChange={(e) => setRule(i, { text: e.target.value })} />
            <div className="grid gap-2 sm:grid-cols-2">
              <input className={inputClass} placeholder="Bağlantı butonu adresi (isteğe bağlı)" value={rule.url || ''} onChange={(e) => setRule(i, { url: e.target.value || null })} />
              <input className={inputClass} maxLength={20} placeholder="Buton yazısı (ör. Bağış yap)" value={rule.url_label || ''} onChange={(e) => setRule(i, { url_label: e.target.value || null })} />
            </div>
          </div>
        ))}
        <button type="button" className={ghostButton} onClick={() => set({ rules: [...ar.rules, { keywords: [], text: '', buttons: [] }] })}>+ Kural ekle</button>
        {canManage && <div><button type="button" className={primaryButton} onClick={() => save({ auto_reply: {
          ...ar, rules: ar.rules.filter((r) => r.text.trim() && r.keywords.length).map((r) => ({ ...r, url: r.url && r.url_label ? r.url : null, url_label: r.url && r.url_label ? r.url_label : null })),
        } })}>Otomatik cevapları kaydet</button></div>}
      </Card>
    </div>
  )
}

export function ConsentTab({ canManage }: { canManage: boolean }) {
  const { data, setData, save } = useSettings()
  const [stats, setStats] = useState<{ opt_in: number; opt_out: number } | null>(null)
  useEffect(() => { adminGet<{ opt_in: number; opt_out: number }>('/whatsapp/consent/stats').then((r) => setStats(r.data)).catch(() => {}) }, [])
  if (!data) return null
  const c = data.consent
  const set = (patch: Partial<WaSettings['consent']>) => setData({ ...data, consent: { ...c, ...patch } })
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-6">
        <h2 className="font-bold text-gray-900">İzin (opt-in) kuralları</h2>
        {stats && <p className="text-sm text-gray-700"><b>{stats.opt_in.toLocaleString('tr-TR')}</b> bağışçı WhatsApp izni verdi · <b>{stats.opt_out.toLocaleString('tr-TR')}</b> bağışçı istemiyor.</p>}
        <Toggle checked={c.require_opt_in_for_bulk} onChange={(v) => set({ require_opt_in_for_bulk: v })} label="Toplu gönderimde yalnızca izin verenlere gönder"
          hint="Meta, izinsiz toplu mesajlarda numaranın kalitesini düşürür ve hesabı kısıtlayabilir. Açık bırakmanızı öneririz." />
        <Toggle checked={c.checkout_checkbox} onChange={(v) => set({ checkout_checkbox: v })} label="Bağış formunda “WhatsApp’tan bilgilendirilmek istiyorum” kutusu göster" />
        <Toggle checked={data.notify_staff} onChange={(v) => setData({ ...data, notify_staff: v })} label="Yeni mesajda personele bildirim gönder" hint="Konuşma kime atandıysa ona, atanmadıysa SMS yetkisi olanlara." />
      </Card>
      <Card className="space-y-4 p-6">
        <h2 className="font-bold text-gray-900">DUR / BAŞLA kelimeleri</h2>
        <Label label="Çıkış kelimeleri" hint="Bağışçı bunlardan birini yazarsa ona hiçbir mesaj gönderilmez.">
          <input className={inputClass} value={c.opt_out_keywords.join(', ')} onChange={(e) => set({ opt_out_keywords: words(e.target.value) })} />
        </Label>
        <Label label="Çıkış cevabı"><textarea className={`${inputClass} min-h-[60px]`} value={c.opt_out_reply} onChange={(e) => set({ opt_out_reply: e.target.value })} /></Label>
        <Label label="Kayıt kelimeleri" hint="Bunlardan biri izin verildi sayılır.">
          <input className={inputClass} value={c.opt_in_keywords.join(', ')} onChange={(e) => set({ opt_in_keywords: words(e.target.value) })} />
        </Label>
        <Label label="Kayıt cevabı"><textarea className={`${inputClass} min-h-[60px]`} value={c.opt_in_reply} onChange={(e) => set({ opt_in_reply: e.target.value })} /></Label>
        {canManage && <button type="button" className={primaryButton} onClick={() => save({ consent: c, notify_staff: data.notify_staff })}>Kaydet</button>}
      </Card>
    </div>
  )
}

export function LinksTab({ canManage }: { canManage: boolean }) {
  const { data, setData, save } = useSettings()
  const [campaigns, setCampaigns] = useState<{ id: string; title: string }[]>([])
  const [campaignId, setCampaignId] = useState('')
  const [text, setText] = useState('')
  const [link, setLink] = useState<{ url: string; text: string; code: string | null } | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    adminGet<{ campaigns: { id: string; title: string }[] }>('/sms/audience-options').then((r) => setCampaigns(r.data.campaigns)).catch(() => {})
  }, [])
  useEffect(() => {
    if (!data?.display_phone) return
    const params = { campaign_id: campaignId || undefined, text: text.trim() || undefined }
    const t = setTimeout(async () => {
      try {
        setLink((await adminGet<{ url: string; text: string; code: string | null }>('/whatsapp/link', params)).data)
        const blob = await adminBlob('/whatsapp/qr', params)
        setQr((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob) })
        setError('')
      } catch (err) {
        setError(apiErrorMessage(err))
      }
    }, 400)
    return () => clearTimeout(t)
  }, [campaignId, text, data?.display_phone])
  if (!data) return null
  const copy = (value: string) => navigator.clipboard.writeText(value).then(() => toast.ok('Kopyalandı'))
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-6">
        <h2 className="font-bold text-gray-900">WhatsApp bağlantısı ve QR kod</h2>
        <p className="text-sm text-gray-600">Afiş, broşür, kumbara, sosyal medya için: okutan kişi hazır mesajla kurumunuza yazar. Kampanya seçerseniz mesaja kod eklenir ve gelen kutusunda hangi kampanyadan geldiği görünür.</p>
        <Label label="Kurumun WhatsApp numarası" hint="Hesap Ayarları’nda bağlantı kontrol edilince Meta’dan otomatik dolar.">
          <div className="flex gap-2">
            <input className={inputClass} value={data.display_phone} onChange={(e) => setData({ ...data, display_phone: e.target.value })} placeholder="90850…" />
            {canManage && <button type="button" className={ghostButton} onClick={() => save({ display_phone: data.display_phone })}>Kaydet</button>}
          </div>
        </Label>
        <Label label="Kampanya (isteğe bağlı)">
          <select className={inputClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">Genel</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </Label>
        <Label label="Hazır mesaj (isteğe bağlı)"><input className={inputClass} maxLength={400} value={text} onChange={(e) => setText(e.target.value)} placeholder="Merhaba, bağış yapmak istiyorum." /></Label>
        {error && <p className="text-sm text-amber-800">{error}</p>}
        {link && (
          <div className="space-y-2">
            <div className="flex gap-2"><input readOnly className={inputClass} value={link.url} /><button type="button" className={ghostButton} onClick={() => copy(link.url)}><Copy className="h-4 w-4" /></button></div>
            {link.text && <p className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-900">{link.text}</p>}
          </div>
        )}
      </Card>
      <Card className="flex flex-col items-center justify-center gap-4 p-6">
        {qr ? (
          <>
            <img src={qr} alt="WhatsApp QR kodu" className="h-64 w-64" />
            <a href={qr} download={`whatsapp-qr${link?.code ? `-${link.code.toLowerCase()}` : ''}.svg`} className={`${primaryButton} flex items-center gap-2`}><Download className="h-4 w-4" /> SVG indir (baskıya uygun)</a>
          </>
        ) : <div className="flex flex-col items-center gap-2 text-gray-400"><QrCode className="h-16 w-16" /><span className="text-sm">Numara girildiğinde QR kod burada oluşur</span></div>}
      </Card>
    </div>
  )
}
