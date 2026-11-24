'use client'

/** Verilerim ve Ayrılma: per-dataset downloads, full backup and the organisation's leaving steps. */
import { useCallback, useEffect, useState } from 'react'
import { Archive, CheckCircle2, Download, FileSpreadsheet, LogOut, RefreshCw } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, downloadFile } from '../../../../lib/admin-access'
import { Label, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { Modal, PageHeader, TBody, THead, Table, Td, Th, Tr, confirmDialog, toast } from '../../../../components/admin/ui'

interface Backup {
  id: string; status: 'queued' | 'running' | 'ready' | 'failed' | 'expired'; include_media: boolean; encrypted: boolean; size_bytes: number | null
  error: string | null; created_at: string; expires_at: string | null; downloaded_at: string | null
}
interface Offboarding {
  status: 'requested' | 'scheduled'; reason: string | null; requested_at: string; closes_on: string | null; days_left: number | null
  operator_note: string | null; backup_confirmed_at: string | null; checklist: { key: string; label: string; done: boolean }[]
}
interface Summary {
  datasets: { key: string; label: string; count: number; tables: { label: string; count: number }[] }[]
  media_files: number; media_bytes: number; exports: Backup[]; offboarding: Offboarding | null; keep_days: number
}

const STATUS: Record<Backup['status'], [string, string]> = {
  queued: ['Sırada', 'bg-gray-100 text-gray-700'], running: ['Hazırlanıyor', 'bg-sky-100 text-sky-800'],
  ready: ['Hazır', 'bg-emerald-100 text-emerald-800'], failed: ['Başarısız', 'bg-red-100 text-red-700'],
  expired: ['Süresi doldu', 'bg-gray-100 text-gray-500'],
}
const n = (v: number) => v.toLocaleString('tr-TR')
const size = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : `${(b / 1024 ** 2).toFixed(1)} MB`)
const when = (iso: string) => new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('tr-TR')

export default function DataPage() {
  const [data, setData] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  const [media, setMedia] = useState(true)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState('')
  const [leaving, setLeaving] = useState(false)
  const [reason, setReason] = useState('')

  const load = useCallback(() => adminGet<Summary>('/data-export/summary')
    .then((r) => { setData(r.data); setError('') })
    .catch((err) => setError(apiErrorMessage(err, 'Veriler yüklenemedi'))), [])
  useEffect(() => { load() }, [load])
  const waiting = !!data?.exports.some((e) => e.status === 'queued' || e.status === 'running')
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [waiting, load])

  const run = async (key: string, action: () => Promise<unknown>, ok?: string) => {
    setBusy(key)
    try {
      await action()
      if (ok) toast.ok(ok)
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setBusy('')
    }
  }
  const downloadBackup = (id: string) => run(`backup-${id}`, async () => {
    const r = await adminSend<{ url: string }>('post', `/data-export/backups/${id}/link`)
    window.location.assign(r.data.url)
    setTimeout(load, 4000)
  })

  if (error) return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>
  if (!data) return <p className="py-12 text-center text-sm text-gray-500">Yükleniyor…</p>
  const off = data.offboarding

  return (
    <div className="space-y-6">
      <PageHeader title="Verilerim ve Ayrılma"
        description="Kurumunuzun bütün verisini istediğiniz zaman indirin. Dosyalar kişisel veri içerir; güvenli bir yerde saklayın."
        actions={<button type="button" className={`${ghostButton} flex items-center gap-1.5`} onClick={load}><RefreshCw className="h-3.5 w-3.5" /> Yenile</button>} />

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-base font-bold text-gray-900"><Archive className="h-5 w-5 text-primary-600" /> Tam yedek (ZIP)</h2>
            <p className="mt-1 text-sm text-gray-500">
              Tüm kayıtlar Excel ve JSON olarak, {n(data.media_files)} görsel/video ({size(data.media_bytes)}) ile birlikte. Şifreler ve bağlantı anahtarları yer almaz. Hazır olunca bildirim gelir, {data.keep_days} gün indirilebilir.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={media} onChange={(e) => setMedia(e.target.checked)} /> Görsel ve videolar dahil</label>
          <input type="password" autoComplete="new-password" className={`${inputClass} max-w-[230px]`} placeholder="ZIP şifresi (isteğe bağlı, en az 10)" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className={primaryButton} disabled={!!busy || waiting || (!!password && password.length < 10)}
            onClick={() => run('create', async () => { await adminSend('post', '/data-export/backups', { include_media: media, password: password || null }); setPassword('') }, 'Yedek hazırlanıyor')}>
            {waiting ? 'Hazırlanıyor…' : 'Tam yedek hazırla'}
          </button>
        </div>
        {password && <p className="text-xs text-amber-700">Şifre bizde saklanmaz; unutursanız yedek açılamaz. Şifreli dosya 7-Zip gibi bir programla açılır.</p>}
        {data.exports.length > 0 && (
          <Table>
            <THead><Tr><Th>İstenen</Th><Th>Durum</Th><Th>İçerik</Th><Th>Boyut</Th><Th>Son indirme günü</Th><Th /></Tr></THead>
            <TBody>
              {data.exports.map((e) => (
                <Tr key={e.id}>
                  <Td className="whitespace-nowrap">{when(e.created_at)}</Td>
                  <Td><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS[e.status][1]}`}>{STATUS[e.status][0]}</span>
                    {e.error && <div className="mt-1 max-w-xs text-xs text-red-700">{e.error}</div>}</Td>
                  <Td>{e.include_media ? 'Kayıtlar + dosyalar' : 'Kayıtlar'}{e.encrypted ? ' · şifreli' : ''}</Td>
                  <Td className="tabular-nums">{e.size_bytes ? size(e.size_bytes) : '—'}</Td>
                  <Td className="whitespace-nowrap">{e.expires_at ? when(e.expires_at) : '—'}{e.downloaded_at && <div className="text-xs text-emerald-700">İndirildi: {when(e.downloaded_at)}</div>}</Td>
                  <Td className="text-right">{e.status === 'ready' && (
                    <button type="button" className={`${ghostButton} inline-flex items-center gap-1`} disabled={!!busy} onClick={() => downloadBackup(e.id)}><Download className="h-3.5 w-3.5" /> İndir</button>
                  )}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-gray-900"><FileSpreadsheet className="h-5 w-5 text-primary-600" /> Veri türleri (Excel)</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.datasets.map((d) => (
            <div key={d.key} className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 p-4">
              <div className="min-w-0">
                <div className="text-sm font-bold text-gray-900">{d.label}</div>
                <div className="text-2xl font-black tabular-nums text-gray-900">{n(d.count)}</div>
                <div className="text-xs text-gray-500">{d.tables.slice(1).filter((t) => t.count).map((t) => `${t.label}: ${n(t.count)}`).join(' · ')}</div>
              </div>
              <button type="button" className={`${ghostButton} inline-flex shrink-0 items-center gap-1`} disabled={!!busy}
                onClick={() => run(d.key, () => downloadFile(`/admin-features/data-export/datasets/${d.key}.xlsx`, `${d.key}.xlsx`))}>
                <Download className="h-3.5 w-3.5" /> {busy === d.key ? 'Hazırlanıyor…' : 'Excel'}
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-gray-900"><LogOut className="h-5 w-5 text-red-600" /> Hizmetten ayrılma</h2>
        {!off ? (
          <>
            <p className="text-sm text-gray-600">Talep gönderdiğinizde destek ekibi sizinle bir kapanış tarihi belirler. O tarihe kadar panel ve siteniz çalışmaya devam eder; verileriniz kendiliğinden silinmez.</p>
            <button type="button" className={ghostButton} onClick={() => setLeaving(true)}>Ayrılma talebi gönder</button>
          </>
        ) : (
          <>
            <div className={`rounded-xl border p-4 text-sm ${off.status === 'scheduled' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-sky-200 bg-sky-50 text-sky-900'}`}>
              {off.closes_on
                ? <><b>Kapanış tarihi: {day(off.closes_on)}</b>{off.days_left !== null && off.days_left > 0 ? ` · ${off.days_left} gün kaldı` : ' · kapanış tarihi geldi'}</>
                : <><b>Talebiniz alındı</b> ({when(off.requested_at)}). Destek ekibi kapanış tarihini bildirecek.</>}
              {off.operator_note && <p className="mt-1">{off.operator_note}</p>}
            </div>
            <div className="space-y-2">
              {off.checklist.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={c.done} disabled={!!busy || c.key === 'yedek'}
                    onChange={(e) => run(c.key, () => adminSend('patch', '/data-export/offboarding/checklist', { key: c.key, done: e.target.checked }))} /> {c.label}
                </label>
              ))}
              <p className="text-xs text-gray-500">SMS, sanal POS ve banka kullanıcılarını başka bir sistemde kullanıyorsanız silmeyin.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {off.backup_confirmed_at ? (
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Yedek onaylandı ({when(off.backup_confirmed_at)})</span>
              ) : (
                <button type="button" className={primaryButton} disabled={!!busy} onClick={async () => {
                  if (await confirmDialog({ title: 'Yedeğinizi aldığınızı onaylıyor musunuz?', text: 'ZIP dosyasını açıp kontrol edin. Bu onaydan sonra, kapanış tarihi gelince verileriniz destek ekibi tarafından kalıcı olarak silinebilir.', confirmLabel: 'Yedeğimi aldım' })) {
                    run('confirm', () => adminSend('post', '/data-export/offboarding/confirm-backup'), 'Yedek onaylandı')
                  }
                }}>Yedeğimi aldım</button>
              )}
              <button type="button" className={ghostButton} disabled={!!busy} onClick={async () => {
                if (await confirmDialog({ title: 'Ayrılma talebi iptal edilsin mi?', text: 'Hizmetiniz eskisi gibi devam eder.', confirmLabel: 'Talebi iptal et' })) {
                  run('cancel', () => adminSend('delete', '/data-export/offboarding'), 'Talep iptal edildi')
                }
              }}>Vazgeçtim, devam edeceğim</button>
            </div>
          </>
        )}
      </Card>

      {leaving && (
        <Modal title="Ayrılma talebi" description="Hiçbir veri silinmez; talebi istediğiniz zaman iptal edebilirsiniz." onClose={() => setLeaving(false)}
          footer={<button type="button" className={primaryButton} disabled={!!busy} onClick={() => run('leave', async () => {
            await adminSend('post', '/data-export/offboarding', { reason: reason.trim() || null })
            setLeaving(false)
          }, 'Talebiniz gönderildi')}>Talebi gönder</button>}>
          <Label label="Ayrılma nedeni (isteğe bağlı)"><textarea className={`${inputClass} min-h-[90px]`} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></Label>
        </Modal>
      )}
    </div>
  )
}
