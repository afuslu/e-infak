'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Mic, MicOff, Phone, PhoneIncoming, PhoneOff, PhoneOutgoing, RefreshCw } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage } from '../../../lib/admin-access'
import { Label, ghostButton, inputClass, primaryButton } from '../FormKit'
import { EmptyState, Pagination, TBody, THead, Table, Td, Th, Tr, toast } from '../ui'
import { Toggle, when } from './shared'

export interface Call {
  id: string; call_id: string; direction: 'USER_INITIATED' | 'BUSINESS_INITIATED'; phone: string
  status: 'ringing' | 'accepted' | 'connected' | 'ended' | 'missed' | 'rejected' | 'failed'
  donor_name: string | null; conversation_id: string | null; started_at: string | null; connected_at: string | null
  ended_at: string | null; duration_seconds: number | null; error: string | null
  sdp_offer?: string | null; sdp_answer?: string | null
}

const CALL_STATUS: Record<Call['status'], [string, string]> = {
  ringing: ['Çalıyor', 'bg-amber-100 text-amber-800'],
  accepted: ['Açıldı', 'bg-sky-100 text-sky-800'],
  connected: ['Görüşmede', 'bg-emerald-100 text-emerald-800'],
  ended: ['Tamamlandı', 'bg-gray-100 text-gray-700'],
  missed: ['Cevapsız', 'bg-red-100 text-red-700'],
  rejected: ['Reddedildi', 'bg-orange-100 text-orange-800'],
  failed: ['Başarısız', 'bg-red-100 text-red-700'],
}

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }]

/** Meta takes one complete SDP (no trickle ICE): wait until the candidates are in, at most 3 s. */
function iceGathered(pc: RTCPeerConnection) {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve()
    const timer = setTimeout(resolve, 3000)
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(timer); resolve() }
    })
  })
}

interface Active { call: Call; pc: RTCPeerConnection; stream: MediaStream; muted: boolean }
interface CallApi { active: Active | null; startCall: (conversationId: string, label: string) => Promise<void> }
const CallContext = createContext<CallApi>({ active: null, startCall: async () => {} })
export const useCalls = () => useContext(CallContext)

const duration = (seconds: number | null | undefined) => {
  if (!seconds && seconds !== 0) return '—'
  const m = Math.floor(seconds / 60)
  return `${m}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
}

/** Watches for incoming WhatsApp calls while the WhatsApp page is open, and holds the live call. */
export function CallProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [ringing, setRinging] = useState<Call[]>([])
  const [active, setActive] = useState<Active | null>(null)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const audio = useRef<HTMLAudioElement | null>(null)
  const activeRef = useRef<Active | null>(null)
  activeRef.current = active

  const hangUpLocal = useCallback(() => {
    const current = activeRef.current
    if (!current) return
    current.stream.getTracks().forEach((t) => t.stop())
    current.pc.close()
    setActive(null)
  }, [])

  const poll = useCallback(async () => {
    try {
      const calls = (await adminGet<Call[]>('/whatsapp/calls/live')).data
      setRinging(calls.filter((c) => c.status === 'ringing' && c.direction === 'USER_INITIATED' && c.sdp_offer))
      const current = activeRef.current
      if (current) {
        const fresh = calls.find((c) => c.id === current.call.id)
        if (!fresh) hangUpLocal()
        else if (fresh.sdp_answer && current.call.direction === 'BUSINESS_INITIATED' && !current.pc.remoteDescription) {
          await current.pc.setRemoteDescription({ type: 'answer', sdp: fresh.sdp_answer })
          setActive({ ...current, call: fresh })
        }
      }
    } catch { /* the next poll tries again */ }
  }, [hangUpLocal])

  useEffect(() => {
    if (!enabled) return
    poll()
    const t = setInterval(poll, 3000)
    return () => clearInterval(t)
  }, [enabled, poll])

  useEffect(() => {
    if (!active) { setElapsed(0); return }
    const started = Date.now()
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(t)
  }, [active?.call.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const openMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const pc = new RTCPeerConnection({ iceServers: ICE })
    stream.getTracks().forEach((track) => pc.addTrack(track, stream))
    pc.ontrack = (event) => { if (audio.current) audio.current.srcObject = event.streams[0] }
    pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) hangUpLocal() }
    return { stream, pc }
  }

  const answer = async (call: Call) => {
    setBusy(true)
    let media: { stream: MediaStream; pc: RTCPeerConnection } | null = null
    try {
      media = await openMedia()
      await media.pc.setRemoteDescription({ type: 'offer', sdp: call.sdp_offer! })
      await media.pc.setLocalDescription(await media.pc.createAnswer())
      await iceGathered(media.pc)
      const res = await adminSend<Call>('post', `/whatsapp/calls/${call.id}/accept`, { sdp: media.pc.localDescription!.sdp })
      setActive({ call: res.data, pc: media.pc, stream: media.stream, muted: false })
      setRinging((r) => r.filter((c) => c.id !== call.id))
    } catch (err) {
      media?.stream.getTracks().forEach((t) => t.stop())
      media?.pc.close()
      toast.error(err instanceof DOMException ? 'Mikrofon izni verilmedi' : apiErrorMessage(err, 'Arama cevaplanamadı'))
    } finally {
      setBusy(false)
    }
  }

  const reject = async (call: Call) => {
    try {
      await adminSend('post', `/whatsapp/calls/${call.id}/reject`)
      setRinging((r) => r.filter((c) => c.id !== call.id))
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const hangUp = async () => {
    const current = activeRef.current
    if (!current) return
    hangUpLocal()
    try {
      await adminSend('post', `/whatsapp/calls/${current.call.id}/terminate`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Arama sonlandırılamadı'))
    }
  }

  const toggleMute = () => {
    const current = activeRef.current
    if (!current) return
    current.stream.getAudioTracks().forEach((t) => { t.enabled = current.muted })
    setActive({ ...current, muted: !current.muted })
  }

  const startCall = useCallback(async (conversationId: string, label: string) => {
    if (activeRef.current) return toast.error('Önce süren görüşmeyi kapatın')
    let media: { stream: MediaStream; pc: RTCPeerConnection } | null = null
    try {
      media = await openMedia()
      await media.pc.setLocalDescription(await media.pc.createOffer())
      await iceGathered(media.pc)
      const res = await adminSend<Call>('post', `/whatsapp/conversations/${conversationId}/call`, { sdp: media.pc.localDescription!.sdp })
      setActive({ call: { ...res.data, donor_name: res.data.donor_name || label }, pc: media.pc, stream: media.stream, muted: false })
    } catch (err) {
      media?.stream.getTracks().forEach((t) => t.stop())
      media?.pc.close()
      toast.error(err instanceof DOMException ? 'Mikrofon izni verilmedi' : apiErrorMessage(err, 'Arama başlatılamadı'))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <CallContext.Provider value={{ active, startCall }}>
      <audio ref={audio} autoPlay className="hidden" />
      {(ringing.length > 0 || active) && (
        <div className="sticky top-2 z-30 space-y-2">
          {ringing.map((call) => (
            <div key={call.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 shadow-md">
              <PhoneIncoming className="h-5 w-5 animate-pulse text-amber-700" />
              <div className="flex-1 text-sm"><b>{call.donor_name || call.phone}</b> WhatsApp’tan arıyor</div>
              <button type="button" disabled={busy} className={`${primaryButton} flex items-center gap-1`} onClick={() => answer(call)}><Phone className="h-4 w-4" /> Cevapla</button>
              <button type="button" className={`${ghostButton} flex items-center gap-1 text-red-700`} onClick={() => reject(call)}><PhoneOff className="h-4 w-4" /> Reddet</button>
            </div>
          ))}
          {active && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-3 shadow-md">
              {active.call.direction === 'BUSINESS_INITIATED' ? <PhoneOutgoing className="h-5 w-5 text-emerald-700" /> : <Phone className="h-5 w-5 text-emerald-700" />}
              <div className="flex-1 text-sm">
                <b>{active.call.donor_name || active.call.phone}</b>
                <span className="ml-2 text-emerald-800">{active.pc.remoteDescription ? `Görüşmede · ${duration(elapsed)}` : 'Aranıyor…'}</span>
              </div>
              <button type="button" className={`${ghostButton} flex items-center gap-1`} onClick={toggleMute}>
                {active.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />} {active.muted ? 'Sesi aç' : 'Sustur'}
              </button>
              <button type="button" className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white" onClick={hangUp}><PhoneOff className="h-4 w-4" /> Kapat</button>
            </div>
          )}
        </div>
      )}
      {children}
    </CallContext.Provider>
  )
}

const DAYS: [string, string][] = [
  ['MONDAY', 'Pazartesi'], ['TUESDAY', 'Salı'], ['WEDNESDAY', 'Çarşamba'], ['THURSDAY', 'Perşembe'],
  ['FRIDAY', 'Cuma'], ['SATURDAY', 'Cumartesi'], ['SUNDAY', 'Pazar'],
]

interface CallSettings {
  enabled: boolean; show_call_icon: boolean; callback_permission: boolean; hours_enabled: boolean; timezone: string
  hours: { day: string; open: string; close: string }[]; sip: { enabled: boolean; hostname: string; port: string }
  restrictions?: string[]
}

export function CallsTab({ configured }: { configured: boolean }) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ total: number; items: Call[] } | null>(null)
  const load = useCallback(() => {
    adminGet<{ total: number; items: Call[] }>('/whatsapp/calls', { page }).then((r) => setData(r.data)).catch((err) => toast.error(apiErrorMessage(err)))
  }, [page])
  useEffect(() => { load() }, [load])
  return (
    <div className="space-y-6">
      {configured && <CallSettingsCard />}
      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Arama geçmişi</h2>
          <button type="button" className={`${ghostButton} flex items-center gap-1`} onClick={load}><RefreshCw className="h-3.5 w-3.5" /> Yenile</button>
        </div>
        {data && !data.items.length ? <EmptyState icon={Phone} title="Henüz WhatsApp araması yok" text="Arama açıldığında bağışçıların aramaları burada ve sayfanın üstünde görünür." /> : (
          <Table>
            <THead><Tr><Th>Tarih</Th><Th>Kişi</Th><Th>Yön</Th><Th>Süre</Th><Th>Durum</Th></Tr></THead>
            <TBody>
              {data?.items.map((c) => (
                <Tr key={c.id}>
                  <Td className="whitespace-nowrap text-gray-500">{when(c.started_at)}</Td>
                  <Td><div className="font-medium">{c.donor_name || '—'}</div><div className="text-xs text-gray-500">{c.phone}</div></Td>
                  <Td>{c.direction === 'USER_INITIATED' ? 'Gelen' : 'Giden'}</Td>
                  <Td className="tabular-nums">{duration(c.duration_seconds)}</Td>
                  <Td><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${CALL_STATUS[c.status][1]}`}>{CALL_STATUS[c.status][0]}</span>{c.error && <div className="text-xs text-red-600">{c.error}</div>}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
        {data && <Pagination page={page} pages={Math.ceil(data.total / 50)} total={data.total} onChange={setPage} />}
      </Card>
    </div>
  )
}

function CallSettingsCard() {
  const [form, setForm] = useState<CallSettings | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    adminGet<CallSettings>('/whatsapp/calls/settings').then((r) => setForm(r.data)).catch((err) => setError(apiErrorMessage(err, 'Arama ayarları okunamadı')))
  }, [])
  const save = async () => {
    if (!form) return
    setBusy(true)
    try {
      setForm((await adminSend<CallSettings>('put', '/whatsapp/calls/settings', form)).data)
      toast.ok('Arama ayarları Meta’ya kaydedildi')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kaydedilemedi'))
    } finally {
      setBusy(false)
    }
  }
  if (error) return <Card className="p-6 text-sm text-amber-800">{error}</Card>
  if (!form) return null
  const hourOf = (day: string) => form.hours.find((h) => h.day === day)
  const setHour = (day: string, value: { open: string; close: string } | null) =>
    setForm({ ...form, hours: [...form.hours.filter((h) => h.day !== day), ...(value ? [{ day, ...value }] : [])] })
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-6">
        <h2 className="font-bold text-gray-900">WhatsApp sesli arama</h2>
        <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label="Aramayı aç"
          hint="Bağışçılar WhatsApp’ta kurum adınızın yanındaki telefon simgesiyle sizi arayabilir. Meta bunu yalnızca günlük 2.000+ mesaj limitli numaralarda açar." />
        <Toggle checked={form.show_call_icon} onChange={(v) => setForm({ ...form, show_call_icon: v })} label="Arama simgesini göster" />
        <Toggle checked={form.callback_permission} onChange={(v) => setForm({ ...form, callback_permission: v })} label="Arayan bağışçıyı geri arayabilelim"
          hint="Sizi arayan kişi, geri arama izni vermiş sayılır." />
        <Toggle checked={form.hours_enabled} onChange={(v) => setForm({ ...form, hours_enabled: v })} label="Yalnızca çalışma saatlerinde" />
        {form.hours_enabled && (
          <div className="space-y-2">
            {DAYS.map(([day, label]) => {
              const h = hourOf(day)
              return (
                <div key={day} className="flex items-center gap-2 text-sm">
                  <label className="flex w-32 items-center gap-2"><input type="checkbox" checked={!!h} onChange={(e) => setHour(day, e.target.checked ? { open: '09:00', close: '18:00' } : null)} /> {label}</label>
                  {h && <>
                    <input type="time" className={`${inputClass} max-w-[120px]`} value={h.open} onChange={(e) => setHour(day, { ...h, open: e.target.value })} />
                    <span>–</span>
                    <input type="time" className={`${inputClass} max-w-[120px]`} value={h.close} onChange={(e) => setHour(day, { ...h, close: e.target.value })} />
                  </>}
                </div>
              )
            })}
          </div>
        )}
        <button type="button" className={primaryButton} disabled={busy} onClick={save}>{busy ? 'Kaydediliyor…' : 'Meta’ya kaydet'}</button>
        {!!form.restrictions?.length && <p className="text-xs text-red-700">Meta kısıtlaması: {form.restrictions.join(', ')}</p>}
      </Card>
      <Card className="space-y-4 p-6 text-sm text-gray-700">
        <h2 className="font-bold text-gray-900">Aramalar nereye düşsün?</h2>
        <p>Varsayılan olarak aramalar bu sayfada çalar: “Cevapla” deyip bilgisayarın mikrofonuyla konuşursunuz. Sayfa açık olmalı.</p>
        <Toggle checked={form.sip.enabled} onChange={(v) => setForm({ ...form, sip: { ...form.sip, enabled: v } })} label="Santralime (SIP) yönlendir"
          hint="Aramalar tarayıcı yerine kendi bulut santralinize gider (TLS, 5061). Bu durumda panelde yalnızca arama kaydı görünür." />
        {form.sip.enabled && (
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2"><Label label="SIP sunucusu"><input className={inputClass} value={form.sip.hostname} onChange={(e) => setForm({ ...form, sip: { ...form.sip, hostname: e.target.value } })} placeholder="sip.santraliniz.com" /></Label></div>
            <Label label="Port"><input className={inputClass} value={form.sip.port} onChange={(e) => setForm({ ...form, sip: { ...form.sip, port: e.target.value } })} /></Label>
          </div>
        )}
        <p className="text-xs text-gray-500">Meta webhook ayarında <b>calls</b> alanına da abone olun. Ayar değişikliklerinin bağışçıların uygulamasına yansıması birkaç gün sürebilir.</p>
      </Card>
    </div>
  )
}
