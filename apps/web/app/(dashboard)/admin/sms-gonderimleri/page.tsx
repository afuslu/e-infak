'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, exportCsv, hasPermission, useAdminAccess } from '../../../../lib/admin-access'
import { Notice, ghostButton, inputClass } from '../../../../components/admin/FormKit'
import { SOURCE_LABEL, STATUS_CLASS, STATUS_LABEL, SmsMessage, SmsStatus } from '../../../../lib/sms'
import { PageHeader, Pagination, TBody, THead, Table, Td, Th, Tr, confirmDialog } from '../../../../components/admin/ui'

interface Account { provider: string | null; own_account: boolean; balance: { text: string; amount: number | null; unit: string } | null }
interface Listing { items: SmsMessage[]; total: number; counts: Record<SmsStatus, number>; parts_sent: number }

const TABS: ['' | SmsStatus, string][] = [
  ['', 'Tümü'], ['queued', 'Kuyrukta'], ['scheduled', 'Zamanlanan'], ['sent', 'Gönderilen'],
  ['delivered', 'İletilen'], ['failed', 'Başarısız'], ['cancelled', 'İptal'],
]
const PAGE_SIZE = 50
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

export default function SmsLogPage() {
  const { data: access } = useAdminAccess()
  const canSend = hasPermission(access, 'donor_manage')
  const [status, setStatus] = useState<'' | SmsStatus>('')
  const [source, setSource] = useState('')
  const [q, setQ] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Listing | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const params = { status: status || undefined, source: source || undefined, q: q.trim() || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined }
  const latest = useRef(params)
  latest.current = params

  const load = async (silent = false) => {
    try {
      setData((await adminGet<Listing>('/sms/messages', { ...latest.current, page, page_size: PAGE_SIZE })).data)
    } catch (err) {
      if (!silent) setMessage({ type: 'error', text: apiErrorMessage(err, 'SMS kayıtları yüklenemedi') })
    }
  }

  useEffect(() => {
    const t = setTimeout(() => load(), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, source, q, dateFrom, dateTo, page])

  useEffect(() => {
    adminGet<Account>('/sms/account').then((r) => setAccount(r.data)).catch(() => {})
  }, [])

  // While something is waiting to be sent, keep the list fresh.
  const waiting = (data?.counts.queued || 0) > 0
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => load(true), 5000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, page])

  const act = async (m: SmsMessage, action: 'retry' | 'cancel') => {
    if (action === 'cancel' && !(await confirmDialog(`#${m.seq_no} numaralı SMS iptal edilsin mi?`))) return
    try {
      await adminSend('post', `/sms/messages/${m.id}/${action}`)
      setMessage({ type: 'ok', text: action === 'cancel' ? `#${m.seq_no} iptal edildi` : `#${m.seq_no} yeniden kuyruğa alındı` })
      load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const download = async () => {
    try {
      const res = await adminGet<Listing>('/sms/messages', { ...params, page: 1, page_size: 200 })
      exportCsv('sms-gonderimleri.csv', ['No', 'Tarih', 'Alıcı', 'Telefon', 'Mesaj', 'Kaynak', 'SMS', 'Durum', 'Hata'],
        res.data.items.map((m) => [m.seq_no, when(m.created_at), m.donor_name, m.phone, m.body, SOURCE_LABEL[m.source] || m.source, m.parts, STATUS_LABEL[m.status], m.error]))
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const counts = data?.counts
  const all = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0
  const pages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <PageHeader title="SMS Gönderimleri" description={<>Kurumdan çıkan her SMS burada: elle gönderilenler, makbuz ve havale bildirimleri, zamanlananlar.</>} actions={<div className="flex shrink-0 gap-2 whitespace-nowrap">
          <Link href="/admin/sms" className={ghostButton}>Şablonlar</Link>
          <button onClick={download} className={ghostButton}>CSV indir</button>
        </div>} />

      <Notice message={message} />

      {account && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm shadow-sm">
          <span className="text-gray-500">SMS hesabı:</span>
          <strong className="text-gray-900">{account.own_account ? account.provider : 'Platform hesabı'}</strong>
          {account.own_account && (
            <span className="text-gray-500">Kalan bakiye: <strong className="text-gray-900">{account.balance?.text || 'sorgulanamadı'}</strong></span>
          )}
          <Link href="/admin/odeme-sms" className="ml-auto text-xs font-bold text-primary-700">Hesap ayarları</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([
          ['Gönderilen', (counts?.sent || 0) + (counts?.delivered || 0), 'text-green-700'],
          ['Bekleyen', (counts?.queued || 0) + (counts?.scheduled || 0), 'text-amber-700'],
          ['Başarısız', counts?.failed || 0, 'text-red-700'],
          ['Kullanılan SMS (boy)', data?.parts_sent || 0, 'text-gray-900'],
        ] as [string, number, string][]).map(([label, value, cls]) => (
          <div key={label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="text-[10px] font-bold uppercase text-gray-500">{label}</div>
            <div className={`text-2xl font-black tabular-nums ${cls}`}>{value.toLocaleString('tr-TR')}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => { setStatus(key); setPage(1) }}
            className={`rounded-full px-4 py-1.5 text-xs font-bold ${status === key ? 'bg-primary-600 text-white' : 'border bg-white text-gray-700'}`}>
            {label} ({key ? counts?.[key] || 0 : all})
          </button>
        ))}
      </div>

      <Card className="space-y-4 border border-gray-100 p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <input className={inputClass} placeholder="Ad, telefon, mesaj veya #no ile ara..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
          <select className={inputClass} value={source} onChange={(e) => { setSource(e.target.value); setPage(1) }}>
            <option value="">Tüm kaynaklar</option>
            {Object.entries(SOURCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input type="date" className={inputClass} value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} aria-label="Başlangıç tarihi" title="Başlangıç tarihi" />
          <input type="date" className={inputClass} value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} aria-label="Bitiş tarihi" title="Bitiş tarihi" />
        </div>

        {!data ? (
          <p className="animate-pulse py-10 text-center text-sm text-gray-400">Yükleniyor…</p>
        ) : data.items.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">Kayıt yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>No</Th><Th>Tarih</Th><Th>Alıcı</Th>
                  <Th>Mesaj</Th><Th>Kaynak</Th><Th>Durum</Th><Th />
                </Tr>
              </THead>
              <TBody>
                {data.items.map((m) => (
                  <Tr key={m.id} className="align-top hover:bg-gray-50/60">
                    <Td className="font-bold text-gray-900">#{m.seq_no}</Td>
                    <Td className="whitespace-nowrap text-gray-500">
                      {when(m.created_at)}
                      {m.status === 'scheduled' && <div className="font-semibold text-sky-700">→ {when(m.send_after)}</div>}
                    </Td>
                    <Td>
                      {m.donor_id
                        ? <Link href={`/admin/bagiscilar?donor=${m.donor_id}`} className="font-semibold text-primary-700 hover:underline">{m.donor_name || 'Bağışçı'}</Link>
                        : <span className="text-gray-400">—</span>}
                      <div className="font-mono text-[11px] text-gray-500">+{m.phone}</div>
                    </Td>
                    <Td className="max-w-md">
                      <button type="button" onClick={() => setOpenId(openId === m.id ? null : m.id)} className={`text-left text-gray-700 ${openId === m.id ? 'whitespace-pre-line' : 'line-clamp-2'}`}>{m.body}</button>
                      <div className="text-[10px] text-gray-400">{m.parts} SMS{m.template_name ? ` · ${m.template_name}` : ''}{m.created_by ? ` · ${m.created_by}` : ''}</div>
                    </Td>
                    <Td className="whitespace-nowrap text-gray-600">{SOURCE_LABEL[m.source] || m.source}</Td>
                    <Td>
                      <span className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-bold ${STATUS_CLASS[m.status]}`}>{STATUS_LABEL[m.status]}</span>
                      {m.error && <div className="mt-1 max-w-[220px] text-[10px] text-red-600">{m.error}</div>}
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      {canSend && m.source !== 'otp' && (m.status === 'failed' || m.status === 'cancelled') && <button onClick={() => act(m, 'retry')} className="font-bold text-primary-700">Tekrar gönder</button>}
                      {canSend && m.status === 'scheduled' && <button onClick={() => act(m, 'retry')} className="font-bold text-primary-700">Şimdi gönder</button>}
                      {canSend && (m.status === 'scheduled' || m.status === 'queued') && <button onClick={() => act(m, 'cancel')} className="ml-3 font-bold text-red-600">İptal</button>}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}

        {data && <Pagination page={page} pages={pages} total={data.total} onChange={setPage} />}
      </Card>
    </div>
  )
}
