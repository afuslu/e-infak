'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { Card } from '@e-infak/ui'
import { apiErrorMessage } from '../../lib/admin-access'
import { confirmDialog } from './ui'

interface DnsRecord { type: string; name: string; host: string; value: string }
interface SiteDomain {
  id: string; domain: string; status: string; is_primary: boolean
  last_checked_at: string | null; last_check_error: string | null; dns_records: DnsRecord[]
}
interface DomainList { subdomain: string | null; url: string; public_ip: string; domains: SiteDomain[] }

const API = '/api/v1/admin-features/site-domains'
const headers = () => ({ Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('access_token') : ''}` })

/** "Alan Adları" card in Site Ayarları: add a custom domain, show its DNS records, verify. */
export function SiteDomainsCard() {
  const [data, setData] = useState<DomainList | null>(null)
  const [newDomain, setNewDomain] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      setData((await axios.get<DomainList>(API, { headers: headers() })).data)
    } catch (err) {
      setMessage(apiErrorMessage(err, 'Alan adları yüklenemedi.'))
    }
  }, [])
  useEffect(() => { load() }, [load])

  const run = async (key: string, action: () => Promise<unknown>, done?: string) => {
    setBusy(key); setMessage('')
    try {
      await action()
      if (done) setMessage(done)
      await load()
    } catch (err) {
      setMessage(apiErrorMessage(err))
    } finally {
      setBusy('')
    }
  }

  const verify = (d: SiteDomain) => run(d.id, async () => {
    const res = await axios.post<SiteDomain>(`${API}/${d.id}/verify`, null, { headers: headers() })
    setMessage(res.data.status === 'active'
      ? `${d.domain} doğrulandı. SSL sertifikası birkaç dakika içinde hazır olur.`
      : `${d.domain} henüz doğrulanamadı: ${res.data.last_check_error || 'DNS kayıtları bekleniyor'}`)
  })

  return (
    <Card className="p-6 border border-gray-100 shadow-sm space-y-4 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Alan Adları</h2>
        <p className="text-xs text-gray-500 mt-2">
          Siteniz her zaman <b>{data?.subdomain || '…'}</b> adresinde açılır. Kendi alan adınızı (ör. kurumadi.org) ekleyip
          DNS kayıtlarını girdikten sonra “Doğrula”ya basın; kayıtlar doğruysa site o adreste SSL ile yayına girer.
          Sistem bekleyen alan adlarını birkaç dakikada bir kendisi de kontrol eder.
        </p>
      </div>

      {data?.domains.map((d) => (
        <div key={d.id} className="rounded-lg border p-3 space-y-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">
              {d.domain}
              {d.status === 'active'
                ? <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">{d.is_primary ? 'Yayında · ana adres' : 'Yayında'}</span>
                : <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Doğrulama bekliyor</span>}
            </span>
            <span className="flex gap-2">
              {d.status !== 'active' && (
                <button type="button" disabled={busy === d.id} onClick={() => verify(d)}
                  className="rounded bg-primary-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
                  {busy === d.id ? 'Kontrol ediliyor…' : 'Doğrula'}
                </button>
              )}
              <button type="button" disabled={busy === d.id}
                onClick={async () => (await confirmDialog(`${d.domain} kaldırılsın mı? Site bu adreste açılmaz.`)) &&
                  run(d.id, () => axios.delete(`${API}/${d.id}`, { headers: headers() }), `${d.domain} kaldırıldı`)}
                className="rounded border px-3 py-1 text-xs">Kaldır</button>
            </span>
          </div>
          {d.status !== 'active' && (
            <>
              <p className="text-xs text-gray-600">Alan adınızı aldığınız firmanın DNS ayarlarına şu kayıtları ekleyin:</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-gray-500"><th className="pr-3">Tür</th><th className="pr-3">Ad</th><th>Değer</th></tr></thead>
                  <tbody>
                    {d.dns_records.map((r) => (
                      <tr key={r.type + r.name} className="font-mono">
                        <td className="pr-3 py-0.5">{r.type}</td><td className="pr-3">{r.name}</td><td className="break-all">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {d.last_check_error && (
                <p className="text-xs text-red-700">
                  Son kontrol{d.last_checked_at ? ` (${new Date(d.last_checked_at).toLocaleString('tr-TR')})` : ''}: {d.last_check_error}
                </p>
              )}
              <p className="text-xs text-gray-500">DNS değişikliklerinin yayılması birkaç dakika ile birkaç saat sürebilir.</p>
            </>
          )}
        </div>
      ))}

      <div className="flex gap-2">
        <input value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="kurumadi.org"
          className="w-full rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-primary-500" />
        <button type="button" disabled={!newDomain.trim() || busy === 'add'}
          onClick={() => run('add', async () => {
            await axios.post(API, { domain: newDomain.trim() }, { headers: headers() })
            setNewDomain('')
          }, 'Alan adı eklendi. Aşağıdaki DNS kayıtlarını girin.')}
          className="whitespace-nowrap rounded-lg bg-gray-900 px-4 text-xs font-bold uppercase text-white disabled:opacity-50">
          Ekle
        </button>
      </div>
      {message && <p className="text-xs text-gray-700">{message}</p>}
    </Card>
  )
}
