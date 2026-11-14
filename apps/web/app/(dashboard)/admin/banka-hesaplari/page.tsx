'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@e-infak/ui'
import { apiErrorMessage, hasPermission, useAdminAccess, v1Get, v1Send } from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { PageHeader, TBody, THead, Table, Td, Th, Tr } from '../../../../components/admin/ui'

interface Bank {
  key: string; label: string; ready: boolean; configured: boolean
  fields: { key: string; label: string; secret: boolean }[]; values: Record<string, string | null>
}
interface Account {
  id: string; bank_key: string; bank: string; ready: boolean; label: string; iban: string | null; account_no: string | null
  currency: string; enabled: boolean; auto_approve: boolean; default_campaign_id: string | null
  last_synced_at: string | null; last_error: string | null
}
interface Rule { id: string; pattern: string; hits: number; source: string; campaign_id: string | null }
type AccountForm = Omit<Account, 'id' | 'bank' | 'ready' | 'last_synced_at' | 'last_error'> & { id?: string }

const EMPTY: AccountForm = { bank_key: '', label: '', iban: '', account_no: '', currency: 'TRY', enabled: true, auto_approve: false, default_campaign_id: null }

export default function BankAccountsPage() {
  const { data: access } = useAdminAccess()
  const canEdit = hasPermission(access, 'finance_manage')
  const [banks, setBanks] = useState<Bank[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [senderCount, setSenderCount] = useState(0)
  const [campaigns, setCampaigns] = useState<{ id: string; title: string }[]>([])
  const [form, setForm] = useState<AccountForm | null>(null)
  const [creds, setCreds] = useState<{ bank: Bank; values: Record<string, string> } | null>(null)
  const [rule, setRule] = useState({ pattern: '', campaign_id: '' })
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)

  const load = async () => {
    try {
      const [b, a, r, s] = await Promise.all([
        v1Get<Bank[]>('/admin/banks'), v1Get<Account[]>('/admin/bank-accounts'),
        v1Get<Rule[]>('/admin/bank-match-rules', { kind: 'keyword' }), v1Get<Rule[]>('/admin/bank-match-rules', { kind: 'sender' }),
      ])
      setBanks(b.data)
      setAccounts(a.data)
      setRules(r.data)
      setSenderCount(s.data.length)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Banka bilgileri yüklenemedi') })
    }
  }
  useEffect(() => {
    load()
    v1Get<{ items: { id: string; title: string }[] }>('/campaigns', { page_size: 100 }).then((r) => setCampaigns(r.data.items || [])).catch(() => {})
  }, [])
  const campaignTitle = (id: string | null) => campaigns.find((c) => c.id === id)?.title || '—'

  const saveAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    const body = { ...form, iban: form.iban || null, account_no: form.account_no || null, default_campaign_id: form.default_campaign_id || null }
    try {
      if (form.id) await v1Send('patch', `/admin/bank-accounts/${form.id}`, body)
      else await v1Send('post', '/admin/bank-accounts', body)
      setForm(null)
      setMessage({ type: 'ok', text: 'Hesap kaydedildi.' })
      load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const saveCreds = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!creds) return
    try {
      await v1Send('put', `/admin/banks/${creds.bank.key}/credentials`, { values: creds.values })
      setCreds(null)
      setMessage({ type: 'ok', text: `${creds.bank.label} web servis bilgileri şifreli olarak kaydedildi.` })
      load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const syncNow = async (a: Account) => {
    setSyncing(a.id)
    try {
      const r = await v1Send<{ fetched: number; new: number; suggested: number; auto_approved: number }>('post', `/admin/bank-accounts/${a.id}/sync`)
      setMessage({ type: 'ok', text: `${a.label}: ${r.data.fetched} hareket okundu, ${r.data.new} yeni. Bekleyen ${r.data.suggested}, otomatik bağış ${r.data.auto_approved}.` })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    } finally {
      setSyncing(null)
      load()
    }
  }

  const addRule = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await v1Send('post', '/admin/bank-match-rules', rule)
      setRule({ pattern: '', campaign_id: '' })
      load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const removeRule = async (id: string) => {
    try {
      await v1Send('delete', `/admin/bank-match-rules/${id}`)
      setRules((list) => list.filter((r) => r.id !== id))
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Banka Hesapları" description={<>Hareketleri otomatik çekilecek hesaplar, bankaların web servis bilgileri ve kampanya kuralları.</>} actions={<Link href="/admin/gelen-havaleler" className={ghostButton}>Gelen havalelere dön</Link>} />

      <Notice message={message} />

      <Card className="space-y-3 border border-gray-100 p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900">Bankalar</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {banks.map((b) => (
            <div key={b.key} className="rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900">{b.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${b.ready ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                  {b.ready ? 'Web servisi hazır' : 'Ekstre yükleme ile'}
                </span>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {b.ready
                  ? 'Hareketler 10 dakikada bir otomatik çekilir.'
                  : 'Banka web servisini açıp teknik bilgileri gönderince otomatik çekim devreye girer. O zamana kadar ekstreyi Gelen Havaleler sayfasından yükleyin.'}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-gray-400">{b.configured ? 'Bilgiler kayıtlı' : 'Bilgi girilmedi'}</span>
                {canEdit && <button onClick={() => setCreds({ bank: b, values: Object.fromEntries(b.fields.filter((f) => !f.secret).map((f) => [f.key, b.values[f.key] || ''])) })} className={ghostButton}>Web servis bilgileri</button>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-3 border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">Hesaplar</h2>
          {canEdit && <button onClick={() => setForm({ ...EMPTY, bank_key: banks[0]?.key || '' })} className={primaryButton}>Hesap ekle</button>}
        </div>
        {accounts.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Henüz hesap eklenmedi.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table inset>
              <THead className="bg-gray-50">
                <Tr><Th>Hesap</Th><Th>IBAN</Th><Th>Varsayılan kampanya</Th><Th>Son çekim</Th><Th /></Tr>
              </THead>
              <TBody>
                {accounts.map((a) => (
                  <Tr key={a.id} className="align-top">
                    <Td>
                      <div className="font-bold text-gray-900">{a.bank} · {a.label}</div>
                      <div className="text-gray-500">{a.currency}{a.enabled ? '' : ' · kapalı'}{a.auto_approve ? ' · otomatik onay açık' : ''}</div>
                    </Td>
                    <Td className="font-mono text-gray-600">{a.iban || '—'}</Td>
                    <Td className="text-gray-700">{campaignTitle(a.default_campaign_id)}</Td>
                    <Td className="text-gray-600">
                      {a.last_synced_at ? new Date(a.last_synced_at).toLocaleString('tr-TR') : '—'}
                      {a.last_error && <div className="mt-1 max-w-xs text-[11px] text-red-600">{a.last_error}</div>}
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      {canEdit && (
                        <div className="flex justify-end gap-2">
                          {a.ready && <button onClick={() => syncNow(a)} disabled={syncing === a.id} className={ghostButton}>{syncing === a.id ? 'Çekiliyor…' : 'Şimdi çek'}</button>}
                          <button onClick={() => setForm({ id: a.id, bank_key: a.bank_key, label: a.label, iban: a.iban || '', account_no: a.account_no || '',
                            currency: a.currency, enabled: a.enabled, auto_approve: a.auto_approve, default_campaign_id: a.default_campaign_id })} className={ghostButton}>Düzenle</button>
                        </div>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="space-y-3 border border-gray-100 p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900">Kampanya kuralları</h2>
        <p className="text-xs text-gray-500">
          Açıklamada bu kelime geçerse havale kesin olarak o kampanyaya önerilir; ör. &quot;kız medrese&quot; → Eskişehir Kız Medrese İnşaatı.
          Ayrıca onayladığınız havalelerden {senderCount} gönderen adı öğrenildi; aynı kişi tekrar gönderince bağışçı kendiliğinden bulunur.
        </p>
        {canEdit && (
          <form onSubmit={addRule} className="flex flex-col gap-2 sm:flex-row">
            <input className={`${inputClass} sm:w-60`} placeholder="Kelime veya ifade" value={rule.pattern} onChange={(e) => setRule({ ...rule, pattern: e.target.value })} minLength={3} required />
            <select className={`${inputClass} sm:w-72`} value={rule.campaign_id} onChange={(e) => setRule({ ...rule, campaign_id: e.target.value })} required>
              <option value="">Kampanya seçin</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <button type="submit" className={primaryButton}>Kural ekle</button>
          </form>
        )}
        {rules.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between p-2.5 text-sm">
                <span><strong>&quot;{r.pattern}&quot;</strong> → {campaignTitle(r.campaign_id)}</span>
                {canEdit && <button onClick={() => removeRule(r.id)} className="text-xs font-bold text-red-600">Sil</button>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {form && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setForm(null)}>
          <form onSubmit={saveAccount} onClick={(e) => e.stopPropagation()} className="mt-10 w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900">{form.id ? 'Hesabı düzenle' : 'Hesap ekle'}</h2>
            <Label label="Banka">
              <select className={inputClass} value={form.bank_key} disabled={!!form.id} onChange={(e) => setForm({ ...form, bank_key: e.target.value })}>
                {banks.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </Label>
            <TextInput label="Hesap adı" value={form.label} onChange={(v) => setForm({ ...form, label: v })} placeholder="ör. TL Bağış Hesabı" required minLength={2} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2"><TextInput label="IBAN" value={form.iban} onChange={(v) => setForm({ ...form, iban: v })} /></div>
              <Label label="Para birimi">
                <select className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  <option value="TRY">TRY</option><option value="USD">USD</option><option value="EUR">EUR</option>
                </select>
              </Label>
            </div>
            <TextInput label="Hesap / ek no (banka isterse)" value={form.account_no} onChange={(v) => setForm({ ...form, account_no: v })} />
            <Label label="Varsayılan kampanya" hint="Açıklamadan kampanya çıkmazsa öneri olarak bu kullanılır.">
              <select className={inputClass} value={form.default_campaign_id || ''} onChange={(e) => setForm({ ...form, default_campaign_id: e.target.value || null })}>
                <option value="">Yok</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </Label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Hareketleri çek
            </label>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" className="mt-1" checked={form.auto_approve} onChange={(e) => setForm({ ...form, auto_approve: e.target.checked })} />
              <span>Kesin eşleşmeleri onaysız bağışa dönüştür
                <span className="block text-xs text-gray-400">Yalnız bağışçı ve kampanya ikisi de kesinse. İlk haftalarda kapalı tutup önerileri kontrol etmeniz önerilir.</span>
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className={ghostButton}>Vazgeç</button>
              <button type="submit" className={primaryButton}>Kaydet</button>
            </div>
          </form>
        </div>
      )}

      {creds && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setCreds(null)}>
          <form onSubmit={saveCreds} onClick={(e) => e.stopPropagation()} className="mt-10 w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900">{creds.bank.label} web servis bilgileri</h2>
            <p className="text-xs text-gray-500">Bilgiler şifrelenerek saklanır. Şifre alanını boş bırakırsanız kayıtlı şifre korunur.</p>
            {creds.bank.fields.map((f) => (
              <TextInput key={f.key} label={f.label} type={f.secret ? 'password' : 'text'} autoComplete="off"
                placeholder={creds.bank.values[f.key] || ''} value={creds.values[f.key] || ''}
                onChange={(v) => setCreds({ ...creds, values: { ...creds.values, [f.key]: v } })} />
            ))}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCreds(null)} className={ghostButton}>Vazgeç</button>
              <button type="submit" className={primaryButton}>Kaydet</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
