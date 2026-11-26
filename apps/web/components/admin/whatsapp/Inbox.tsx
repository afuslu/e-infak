'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Check, CheckCheck, Clock, FileText, Image as ImageIcon, LayoutList, MapPin, MessageCircle, Paperclip, Phone,
  PhoneCall, Search, Send, ShieldCheck, ShieldOff, UserRound,
} from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminBlob, adminGet, adminSend, apiErrorMessage, formatMoney } from '../../../lib/admin-access'
import { ghostButton, inputClass, primaryButton } from '../FormKit'
import { EmptyState, Modal, confirmDialog, toast } from '../ui'
import { useCalls } from './Calls'
import { Message, Template, TemplateFields, clock, when } from './shared'

interface Conversation {
  id: string; phone: string; contact_name: string | null; donor_id: string | null; donor_name: string | null
  status: 'open' | 'closed'; unread_count: number; last_preview: string | null; last_message_at: string | null
  last_inbound_at: string | null; window_open: boolean; window_closes_at: string | null
  assigned_to: string | null; assigned_name: string | null; opted_out: boolean; source_ref: string | null
}
interface Detail extends Conversation {
  messages: Message[]
  consent: { opt_in: boolean; opt_out: boolean; opt_in_at: string | null; source: string | null } | null
  donor: { id: string; name: string; phone: string; email: string | null; total_donated_cents: number; total_donations: number; last_donation_at: string | null } | null
}
interface Agent { id: string; name: string }

const nameOf = (c: Conversation) => c.donor_name || c.contact_name || `+${c.phone}`

function MediaView({ message }: { message: Message }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const media = message.media || {}
  const load = useCallback(async () => {
    try {
      const blob = await adminBlob(`/whatsapp/media/${message.id}`)
      setUrl(URL.createObjectURL(blob))
    } catch (err) {
      setError(apiErrorMessage(err, 'Dosya açılamadı'))
    }
  }, [message.id])
  useEffect(() => {
    if (message.direction === 'in' && (message.kind === 'image' || message.kind === 'sticker') && media.id) load()
  }, [message.direction, message.kind, media.id, load])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  if (message.kind === 'location' && media.latitude) {
    return <a className="flex items-center gap-1 text-sm font-semibold text-emerald-800 underline" target="_blank" rel="noreferrer"
      href={`https://www.google.com/maps?q=${media.latitude},${media.longitude}`}><MapPin className="h-4 w-4" /> Haritada aç</a>
  }
  if (message.direction !== 'in' || !media.id) {
    return message.kind === 'document' ? <div className="flex items-center gap-1 text-xs text-gray-600"><FileText className="h-4 w-4" /> {media.filename || 'Belge'}</div> : null
  }
  if (error) return <div className="text-xs text-red-600">{error}</div>
  if ((message.kind === 'image' || message.kind === 'sticker') && url) return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" className="max-h-64 rounded-lg" /></a>
  if (message.kind === 'audio' && url) return <audio controls src={url} className="max-w-full" />
  if (message.kind === 'video' && url) return <video controls src={url} className="max-h-64 rounded-lg" />
  if (url) return <a href={url} download={media.filename || 'whatsapp-dosya'} className="text-sm font-semibold underline">{media.filename || 'Dosyayı indir'}</a>
  return (
    <button type="button" className="flex items-center gap-1 text-sm font-semibold text-emerald-800 underline" onClick={load}>
      {message.kind === 'document' ? <FileText className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
      {media.filename || ({ audio: media.voice ? 'Sesli mesaj' : 'Ses', video: 'Video', document: 'Belge' } as Record<string, string>)[message.kind] || 'Dosya'} — aç
    </button>
  )
}

function Bubble({ m }: { m: Message }) {
  const mine = m.direction === 'out'
  const ticks = m.status === 'read' ? <CheckCheck className="h-3.5 w-3.5 text-sky-500" /> : m.status === 'delivered' ? <CheckCheck className="h-3.5 w-3.5" /> : m.status === 'sent' ? <Check className="h-3.5 w-3.5" /> : m.status === 'queued' ? <Clock className="h-3.5 w-3.5" /> : null
  const auto = m.source === 'auto_reply' ? 'Otomatik cevap' : m.source === 'event' ? 'Otomatik bildirim' : m.source === 'bulk' ? 'Toplu gönderim' : null
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[78%] space-y-1 rounded-2xl px-3 py-2 text-sm shadow-xs ${mine ? 'rounded-br-sm bg-emerald-100 text-emerald-950' : 'rounded-bl-sm bg-white text-gray-900'} ${m.status === 'failed' ? 'ring-1 ring-red-300' : ''}`}>
        {auto && <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">{auto}</div>}
        {m.kind === 'template' && <div className="text-[11px] font-semibold text-gray-500">Şablon: {m.template_name}</div>}
        <MediaView message={m} />
        {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
        {m.interactive?.buttons && (
          <div className="flex flex-wrap gap-1 pt-1">{m.interactive.buttons.map((b) => <span key={b.id} className="rounded-full border border-emerald-300 bg-white px-2 py-0.5 text-xs font-semibold text-emerald-800">{b.title}</span>)}</div>
        )}
        {m.interactive?.type === 'cta_url' && <div className="pt-1 text-xs font-semibold text-emerald-800">🔗 {m.interactive.display_text}</div>}
        {m.error && <div className="text-xs text-red-600">{m.error}{m.fallback_sms ? ' · yerine SMS gönderildi' : ''}</div>}
        <div className="flex items-center justify-end gap-1 text-[10px] text-gray-500">{clock(m.created_at)} {mine && ticks}</div>
      </div>
    </div>
  )
}

function ButtonsComposer({ onSend, onClose }: { onSend: (interactive: Record<string, unknown>) => Promise<void>; onClose: () => void }) {
  const [mode, setMode] = useState<'button' | 'cta_url'>('button')
  const [body, setBody] = useState('')
  const [buttons, setButtons] = useState(['', '', ''])
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('Bağış yap')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true)
    try {
      await onSend(mode === 'button'
        ? { type: 'button', body, buttons: buttons.filter((b) => b.trim()).map((title, i) => ({ id: `btn${i + 1}`, title })) }
        : { type: 'cta_url', body, url, display_text: label })
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Butonlu mesaj" onClose={onClose} footer={<button type="button" className={primaryButton} disabled={busy || !body.trim()} onClick={send}>{busy ? 'Gönderiliyor…' : 'Gönder'}</button>}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <button type="button" className={mode === 'button' ? primaryButton : ghostButton} onClick={() => setMode('button')}>Cevap butonları</button>
          <button type="button" className={mode === 'cta_url' ? primaryButton : ghostButton} onClick={() => setMode('cta_url')}>Bağlantı butonu</button>
        </div>
        <textarea className={`${inputClass} min-h-[90px]`} placeholder="Mesaj metni" value={body} onChange={(e) => setBody(e.target.value)} maxLength={1024} />
        {mode === 'button' ? buttons.map((b, i) => (
          <input key={i} className={inputClass} placeholder={`Buton ${i + 1} (en fazla 20 karakter)`} maxLength={20} value={b}
            onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? e.target.value : x)))} />
        )) : (
          <>
            <input className={inputClass} placeholder="https://… (ör. bağış sayfası)" value={url} onChange={(e) => setUrl(e.target.value)} />
            <input className={inputClass} placeholder="Buton yazısı" maxLength={20} value={label} onChange={(e) => setLabel(e.target.value)} />
          </>
        )}
      </div>
    </Modal>
  )
}

export function Inbox({ templates, configured, initialId }: { templates: Template[]; configured: boolean; initialId?: string | null }) {
  const [filter, setFilter] = useState<{ status: 'open' | 'closed'; mine: boolean; unread: boolean; q: string }>({ status: 'open', mine: false, unread: false, q: '' })
  const [list, setList] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<string | null>(initialId || null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [text, setText] = useState('')
  const [templateMode, setTemplateMode] = useState(false)
  const [tplName, setTplName] = useState('')
  const [tplParams, setTplParams] = useState<string[]>([])
  const [showButtons, setShowButtons] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const bottom = useRef<HTMLDivElement | null>(null)
  const { startCall, active } = useCalls()

  const loadList = useCallback(() => {
    adminGet<{ items: Conversation[] }>('/whatsapp/conversations', {
      status: filter.status, mine: filter.mine || undefined, unread: filter.unread || undefined, q: filter.q.trim() || undefined,
    }).then((r) => setList(r.data.items)).catch((err) => toast.error(apiErrorMessage(err, 'Konuşmalar alınamadı')))
  }, [filter])
  const loadDetail = useCallback(async (id: string, markRead = false) => {
    try {
      const r = await adminGet<Detail>(`/whatsapp/conversations/${id}`)
      setDetail((prev) => {
        if (prev?.id !== id || prev.messages.length !== r.data.messages.length) setTimeout(() => bottom.current?.scrollIntoView({ block: 'end' }), 30)
        return r.data
      })
      if (markRead && r.data.unread_count) {
        await adminSend('post', `/whatsapp/conversations/${id}/read`)
        setList((l) => l.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)))
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Konuşma açılamadı'))
    }
  }, [])

  useEffect(() => { const t = setTimeout(loadList, 250); return () => clearTimeout(t) }, [loadList])
  useEffect(() => { const t = setInterval(loadList, 10000); return () => clearInterval(t) }, [loadList])
  useEffect(() => { adminGet<Agent[]>('/whatsapp/agents').then((r) => setAgents(r.data)).catch(() => {}) }, [])
  useEffect(() => {
    if (!selected) return
    loadDetail(selected, true)
    const t = setInterval(() => loadDetail(selected, true), 5000)
    return () => clearInterval(t)
  }, [selected, loadDetail])
  useEffect(() => { setTemplateMode(detail ? !detail.window_open : false) }, [detail?.id, detail?.window_open]) // eslint-disable-line react-hooks/exhaustive-deps

  const sendContent = async (content: Record<string, unknown>) => {
    if (!detail) return
    try {
      await adminSend('post', `/whatsapp/conversations/${detail.id}/reply`, content)
      await loadDetail(detail.id)
      loadList()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Mesaj gönderilemedi'))
      throw err
    }
  }
  const send = async () => {
    setBusy(true)
    try {
      if (templateMode) {
        await sendContent({ kind: 'template', template_name: tplName, params: tplParams })
        setTplName('')
        setTplParams([])
      } else {
        await sendContent({ kind: 'text', text })
        setText('')
      }
    } catch { /* toast shown */ } finally {
      setBusy(false)
    }
  }
  const sendFile = async (file: File) => {
    if (!detail) return
    const form = new FormData()
    form.append('file', file)
    form.append('caption', text)
    setBusy(true)
    try {
      await adminSend('post', `/whatsapp/conversations/${detail.id}/media`, form)
      setText('')
      await loadDetail(detail.id)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Dosya gönderilemedi'))
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }
  const update = async (patch: Record<string, unknown>) => {
    if (!detail) return
    try {
      await adminSend('patch', `/whatsapp/conversations/${detail.id}`, patch)
      await loadDetail(detail.id)
      loadList()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }
  const setConsent = async (optIn: boolean) => {
    if (!detail?.donor) return
    if (!optIn && !(await confirmDialog('Bu bağışçıya artık WhatsApp mesajı gönderilmesin mi?'))) return
    try {
      await adminSend('put', '/whatsapp/consent', { donor_id: detail.donor.id, opt_in: optIn })
      await loadDetail(detail.id)
      toast.ok(optIn ? 'WhatsApp izni kaydedildi' : 'WhatsApp gönderimi durduruldu')
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }
  const askCallPermission = async () => {
    if (!detail) return
    try {
      await adminSend('post', `/whatsapp/conversations/${detail.id}/call-permission`)
      toast.ok('Arama izni isteği gönderildi')
      await loadDetail(detail.id)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <div className="grid min-h-[620px] gap-4 lg:grid-cols-[320px_1fr_260px]">
      <Card className="flex flex-col overflow-hidden p-0">
        <div className="space-y-2 border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input className={`${inputClass} pl-8`} placeholder="İsim veya telefon" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
          </div>
          <div className="flex flex-wrap gap-1 text-xs">
            {([['open', 'Açık'], ['closed', 'Kapalı']] as const).map(([k, label]) => (
              <button key={k} type="button" className={`rounded-full px-2.5 py-1 font-bold ${filter.status === k ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`} onClick={() => setFilter({ ...filter, status: k })}>{label}</button>
            ))}
            <button type="button" className={`rounded-full px-2.5 py-1 font-bold ${filter.unread ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`} onClick={() => setFilter({ ...filter, unread: !filter.unread })}>Okunmamış</button>
            <button type="button" className={`rounded-full px-2.5 py-1 font-bold ${filter.mine ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`} onClick={() => setFilter({ ...filter, mine: !filter.mine })}>Bana atanan</button>
          </div>
        </div>
        <div className="flex-1 divide-y overflow-y-auto">
          {!list.length && <p className="p-6 text-center text-sm text-gray-500">Konuşma yok. Bağışçılar kurum numaranıza yazdığında burada görünür.</p>}
          {list.map((c) => (
            <button key={c.id} type="button" onClick={() => setSelected(c.id)}
              className={`block w-full px-3 py-2.5 text-left hover:bg-emerald-50/60 ${selected === c.id ? 'bg-emerald-50' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`truncate text-sm ${c.unread_count ? 'font-black text-gray-900' : 'font-semibold text-gray-800'}`}>{nameOf(c)}</span>
                <span className="shrink-0 text-[10px] text-gray-500">{clock(c.last_message_at)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-gray-500">{c.last_preview || '—'}</span>
                {c.unread_count > 0 && <span className="rounded-full bg-emerald-600 px-1.5 text-[10px] font-black text-white">{c.unread_count}</span>}
              </div>
              {c.assigned_name && <div className="text-[10px] text-gray-400">→ {c.assigned_name}</div>}
            </button>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col overflow-hidden p-0">
        {!detail ? <div className="flex flex-1 items-center justify-center"><EmptyState icon={MessageCircle} title="Bir konuşma seçin" /></div> : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
              <div className="flex-1">
                <div className="font-bold text-gray-900">{nameOf(detail)}</div>
                <div className="text-xs text-gray-500">+{detail.phone}{detail.source_ref ? ` · kaynak: ${detail.source_ref}` : ''}</div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${detail.window_open ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}
                title={detail.window_closes_at ? `Pencere ${when(detail.window_closes_at)} kapanır` : undefined}>
                {detail.window_open ? `Yanıt penceresi açık (${clock(detail.window_closes_at)}’e kadar)` : 'Pencere kapalı: yalnız şablon'}
              </span>
              <button type="button" className={`${ghostButton} flex items-center gap-1`} disabled={!!active} onClick={() => startCall(detail.id, nameOf(detail))} title="WhatsApp ile ara (bağışçının arama izni gerekir)">
                <PhoneCall className="h-3.5 w-3.5" /> Ara
              </button>
              <button type="button" className={ghostButton} onClick={() => update({ status: detail.status === 'open' ? 'closed' : 'open' })}>
                {detail.status === 'open' ? 'Kapat' : 'Yeniden aç'}
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto bg-[#efeae2] p-4" style={{ maxHeight: 520 }}>
              {detail.messages.map((m) => <Bubble key={m.id} m={m} />)}
              <div ref={bottom} />
            </div>
            <div className="space-y-2 border-t p-3">
              {detail.opted_out ? <p className="text-sm text-amber-800">Bu kişi DUR yazdı; tekrar BAŞLA yazana kadar mesaj gönderilemez.</p> : templateMode ? (
                <div className="space-y-2">
                  {!detail.window_open && <p className="text-xs text-gray-500">Bağışçı son 24 saatte yazmadığı için Meta yalnızca onaylı şablona izin veriyor.</p>}
                  <TemplateFields templates={templates} name={tplName} setName={setTplName} params={tplParams} setParams={setTplParams} />
                  <div className="flex gap-2">
                    <button type="button" className={`${primaryButton} flex items-center gap-2`} disabled={busy || !tplName || !configured} onClick={send}><Send className="h-4 w-4" /> Şablonu gönder</button>
                    {detail.window_open && <button type="button" className={ghostButton} onClick={() => setTemplateMode(false)}>Serbest metne dön</button>}
                  </div>
                </div>
              ) : (
                <>
                  <textarea className={`${inputClass} min-h-[70px]`} placeholder="Mesajınızı yazın… ({ad}, {iban}, {portal} kullanılabilir)" value={text} maxLength={4096}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && text.trim()) { e.preventDefault(); send() } }} />
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={`${primaryButton} flex items-center gap-2`} disabled={busy || !text.trim() || !configured} onClick={send}><Send className="h-4 w-4" /> Gönder</button>
                    <input ref={fileInput} type="file" className="hidden" accept="image/jpeg,image/png,application/pdf,.doc,.docx,.xls,.xlsx,audio/*,video/mp4"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) sendFile(f) }} />
                    <button type="button" className={`${ghostButton} flex items-center gap-1`} disabled={busy} onClick={() => fileInput.current?.click()}><Paperclip className="h-3.5 w-3.5" /> Dosya</button>
                    <button type="button" className={`${ghostButton} flex items-center gap-1`} onClick={() => setShowButtons(true)}><LayoutList className="h-3.5 w-3.5" /> Butonlu</button>
                    <button type="button" className={ghostButton} onClick={() => setTemplateMode(true)}>Şablon</button>
                    <button type="button" className={`${ghostButton} flex items-center gap-1`} onClick={askCallPermission}><Phone className="h-3.5 w-3.5" /> Arama izni iste</button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </Card>

      <Card className="space-y-4 p-4 text-sm">
        {!detail ? <p className="text-gray-500">Bağışçı bilgileri burada görünür.</p> : (
          <>
            <div>
              <div className="mb-1 text-xs font-bold uppercase text-gray-500">Bağışçı</div>
              {detail.donor ? (
                <div className="space-y-1">
                  <Link href={`/admin/bagiscilar/${detail.donor.id}`} className="flex items-center gap-1 font-bold text-emerald-800 hover:underline"><UserRound className="h-4 w-4" /> {detail.donor.name}</Link>
                  <div className="text-xs text-gray-600">{detail.donor.total_donations} bağış · {formatMoney(detail.donor.total_donated_cents)}</div>
                  {detail.donor.last_donation_at && <div className="text-xs text-gray-500">Son bağış: {when(detail.donor.last_donation_at)}</div>}
                </div>
              ) : <LinkDonor onLink={(donorId) => update({ donor_id: donorId })} />}
            </div>
            {detail.consent && (
              <div>
                <div className="mb-1 text-xs font-bold uppercase text-gray-500">WhatsApp izni</div>
                {detail.consent.opt_out ? (
                  <div className="space-y-1"><div className="flex items-center gap-1 text-red-700"><ShieldOff className="h-4 w-4" /> İstemiyor</div>
                    <button type="button" className={ghostButton} onClick={() => setConsent(true)}>İzin verdi olarak işaretle</button></div>
                ) : detail.consent.opt_in ? (
                  <div className="space-y-1"><div className="flex items-center gap-1 text-emerald-700"><ShieldCheck className="h-4 w-4" /> İzinli ({detail.consent.source || '—'})</div>
                    <button type="button" className={ghostButton} onClick={() => setConsent(false)}>Gönderimi durdur</button></div>
                ) : (
                  <div className="space-y-1"><div className="text-gray-600">Duyuru izni yok (bildirimler gider)</div>
                    <button type="button" className={ghostButton} onClick={() => setConsent(true)}>İzin verdi olarak işaretle</button></div>
                )}
              </div>
            )}
            <div>
              <div className="mb-1 text-xs font-bold uppercase text-gray-500">Sorumlu</div>
              <select className={inputClass} value={detail.assigned_to || ''} onChange={(e) => update(e.target.value ? { assigned_to: e.target.value } : { unassign: true })}>
                <option value="">Atanmadı</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </>
        )}
      </Card>
      {showButtons && <ButtonsComposer onClose={() => setShowButtons(false)} onSend={(interactive) => sendContent({ kind: 'interactive', interactive })} />}
    </div>
  )
}

function LinkDonor({ onLink }: { onLink: (donorId: string) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ id: string; full_name: string; phone: string | null }[]>([])
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    const t = setTimeout(() => {
      adminGet<{ items: { id: string; full_name: string; phone: string | null }[] }>('/donors', { q, page_size: 5 })
        .then((r) => setResults(r.data.items || [])).catch(() => setResults([]))
    }, 300)
    return () => clearTimeout(t)
  }, [q])
  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500">Kayıtlı bağışçıyla eşleşmedi.</p>
      <input className={inputClass} placeholder="Bağışçı ara ve bağla" value={q} onChange={(e) => setQ(e.target.value)} />
      {results.map((d) => (
        <button key={d.id} type="button" className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-xs hover:bg-gray-100" onClick={() => { onLink(d.id); setQ('') }}>
          <span>{d.full_name}</span><span className="text-gray-400">{d.phone}</span>
          
        </button>
      ))}
    </div>
  )
}
