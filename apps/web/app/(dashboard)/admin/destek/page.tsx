'use client'

import { useCallback, useEffect, useState } from 'react'
import { LifeBuoy, Plus, Send } from 'lucide-react'
import { Button, Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import { inputClass } from '../../../../components/admin/FormKit'
import { PageHeader, toast } from '../../../../components/admin/ui'

interface Ticket {
  id: string
  subject: string
  category: string
  priority: string
  status: 'open' | 'answered' | 'closed'
  updated_at: string
}

interface TicketDetail extends Ticket {
  created_at: string
  messages: { id: string; sender_type: 'tenant' | 'platform'; sender_name: string; body: string; created_at: string }[]
}

const STATUS_LABEL: Record<Ticket['status'], [string, string]> = {
  open: ['İnceleniyor', 'bg-amber-100 text-amber-800'],
  answered: ['Yanıtlandı', 'bg-emerald-100 text-emerald-800'],
  closed: ['Kapandı', 'bg-slate-100 text-slate-600'],
}

export default function AdminSupportTicketsPage() {
  const [rows, setRows] = useState<Ticket[]>([])
  const [selected, setSelected] = useState<TicketDetail | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ subject: '', category: 'teknik', priority: 'normal', message: '' })
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await adminGet<Ticket[]>('/support-tickets')
      setRows(res.data || [])
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Destek talepleri yüklenemedi.'))
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const openTicket = async (id: string) => {
    try {
      const res = await adminGet<TicketDetail>(`/support-tickets/${id}`)
      setSelected(res.data)
      setCreating(false)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Talep detayı yüklenemedi.'))
    }
  }

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await adminSend<{ id: string }>('post', '/support-tickets', form)
      toast.ok('Destek talebiniz platform ekibine iletildi.')
      setForm({ subject: '', category: 'teknik', priority: 'normal', message: '' })
      await load()
      await openTicket(res.data.id)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Talep oluşturulamadı.'))
    } finally {
      setBusy(false)
    }
  }

  const submitReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected || !reply.trim()) return
    setBusy(true)
    try {
      await adminSend('post', `/support-tickets/${selected.id}/reply`, { body: reply.trim() })
      setReply('')
      await openTicket(selected.id)
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Yanıt gönderilemedi.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Destek Talepleri"
        description="Teknik destek, ödeme/POS veya alan adı konularında E-İnfak platform ekibine talep açın."
        actions={
          <Button type="button" onClick={() => { setCreating(true); setSelected(null) }}>
            <Plus className="h-4 w-4" /> Yeni Talep Aç
          </Button>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Card className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 p-0">
            {rows.map((t) => {
              const [lbl, cls] = STATUS_LABEL[t.status] || STATUS_LABEL.open
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void openTicket(t.id)}
                  className={`w-full p-4 text-left transition ${selected?.id === t.id ? 'bg-emerald-50/60' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-bold text-slate-900">{t.subject}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>{lbl}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {new Date(t.updated_at).toLocaleString('tr-TR')}
                  </div>
                </button>
              )
            })}
            {rows.length === 0 && (
              <div className="p-8 text-center text-sm text-slate-500">Henüz açılmış bir destek talebiniz yok.</div>
            )}
          </Card>
        </div>

        <div className="lg:col-span-7">
          {creating ? (
            <Card className="rounded-2xl border border-slate-200/80 p-6">
              <h2 className="mb-4 text-base font-bold text-slate-900">Yeni Destek Talebi</h2>
              <form onSubmit={submitNew} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Konu *</label>
                  <input required minLength={3} className={inputClass} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Örn. Özel alan adı SSL bağlantısı" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Kategori</label>
                    <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      <option value="teknik">Teknik Destek</option>
                      <option value="odeme">Ödeme &amp; Sanal POS</option>
                      <option value="alan_adi">Alan Adı &amp; E-posta</option>
                      <option value="diger">Diğer</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Öncelik</label>
                    <select className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                      <option value="normal">Normal</option>
                      <option value="yuksek">Yüksek</option>
                      <option value="acil">Acil</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Açıklama *</label>
                  <textarea required minLength={3} rows={4} className={`${inputClass} py-2`} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Sorununuzu veya talebinizi ayrıntılı yazın…" />
                </div>
                <Button type="submit" disabled={busy}>{busy ? 'Gönderiliyor…' : 'Talebi Gönder'}</Button>
              </form>
            </Card>
          ) : selected ? (
            <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-lg font-extrabold text-slate-900">{selected.subject}</h2>
                <p className="text-xs text-slate-400">Açılış: {new Date(selected.created_at).toLocaleString('tr-TR')}</p>
              </div>
              <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                {selected.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-2xl p-3.5 text-sm ${
                      m.sender_type === 'platform'
                        ? 'me-6 border border-emerald-200 bg-emerald-50/70'
                        : 'ms-6 border border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900">{m.sender_name} {m.sender_type === 'platform' ? '(Platform Destek)' : ''}</span>
                      <span className="text-slate-400">{new Date(m.created_at).toLocaleString('tr-TR')}</span>
                    </div>
                    <p className="whitespace-pre-line text-slate-700">{m.body}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={submitReply} className="space-y-2 border-t border-slate-100 pt-3">
                <textarea rows={3} required value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Yanıt yazın…" className={`${inputClass} py-2`} />
                <Button type="submit" disabled={busy}>
                  <Send className="h-4 w-4" /> Yanıt Gönder
                </Button>
              </form>
            </Card>
          ) : (
            <Card className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/80 py-16 text-center">
              <LifeBuoy className="mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500">Soldan bir talep seçin veya yeni destek talebi açın.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
