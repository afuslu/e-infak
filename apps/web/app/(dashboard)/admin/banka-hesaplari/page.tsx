'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Printer } from 'lucide-react'
import { Card } from '@e-infak/ui'
import {
  apiErrorMessage,
  hasPermission,
  useAdminAccess,
  v1Get,
  v1Send,
} from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { ExportButtons, PageHeader, StatCard, TBody, THead, Table, Td, Th, Tr, confirmDialog } from '../../../../components/admin/ui'

interface Bank {
  key: string
  label: string
  ready: boolean
  configured: boolean
  fields: { key: string; label: string; secret: boolean }[]
  values: Record<string, string | null>
}
interface Account {
  id: string
  bank_key: string
  bank: string
  ready: boolean
  label: string
  iban: string | null
  account_no: string | null
  currency: string
  enabled: boolean
  auto_approve: boolean
  default_campaign_id: string | null
  last_synced_at: string | null
  last_error: string | null
}
interface Rule {
  id: string
  pattern: string
  hits: number
  source: string
  campaign_id: string | null
  campaign_title?: string | null
  donor_id?: string | null
  donor_name?: string | null
}
type AccountForm = Omit<Account, 'id' | 'bank' | 'ready' | 'last_synced_at' | 'last_error'> & { id?: string }

const EMPTY: AccountForm = {
  bank_key: '',
  label: '',
  iban: '',
  account_no: '',
  currency: 'TRY',
  enabled: true,
  auto_approve: false,
  default_campaign_id: null,
}

const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'SAR', 'CHF']

export default function BankAccountsPage() {
  const { data: access } = useAdminAccess()
  const canEdit = hasPermission(access, 'finance_manage')
  const [banks, setBanks] = useState<Bank[]>([])
  const [showAllBanks, setShowAllBanks] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [senderRules, setSenderRules] = useState<Rule[]>([])
  const [ruleTab, setRuleTab] = useState<'keyword' | 'sender'>('keyword')
  const [campaigns, setCampaigns] = useState<{ id: string; title: string }[]>([])
  const [form, setForm] = useState<AccountForm | null>(null)
  const [creds, setCreds] = useState<{ bank: Bank; values: Record<string, string> } | null>(null)
  const [rule, setRule] = useState({ pattern: '', campaign_id: '' })
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = async () => {
    try {
      const [b, a, r, s] = await Promise.all([
        v1Get<Bank[]>('/admin/banks'),
        v1Get<Account[]>('/admin/bank-accounts'),
        v1Get<Rule[]>('/admin/bank-match-rules', { kind: 'keyword' }),
        v1Get<Rule[]>('/admin/bank-match-rules', { kind: 'sender' }),
      ])
      setBanks(b.data)
      setAccounts(a.data)
      setRules(r.data)
      setSenderRules(s.data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Banka bilgileri yüklenemedi') })
    }
  }
  useEffect(() => {
    load()
    v1Get<{ items: { id: string; title: string }[] }>('/campaigns', { page_size: 200 })
      .then((r) => setCampaigns(r.data.items || []))
      .catch(() => {})
  }, [])
  const campaignTitle = (id: string | null) => campaigns.find((c) => c.id === id)?.title || '—'

  const copyIban = async (a: Account) => {
    if (!a.iban) return
    try {
      await navigator.clipboard.writeText(a.iban)
      setCopiedId(a.id)
      setTimeout(() => setCopiedId((cur) => (cur === a.id ? null : cur)), 1800)
    } catch {
      /* ignore clipboard error */
    }
  }

  const saveAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    const body = {
      ...form,
      iban: form.iban || null,
      account_no: form.account_no || null,
      default_campaign_id: form.default_campaign_id || null,
    }
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

  const deleteAccount = async (a: Account) => {
    if (!(await confirmDialog(`"${a.bank} · ${a.label}" hesabı silinecek. Devam edilsin mi?`))) return
    try {
      await v1Send('delete', `/admin/bank-accounts/${a.id}`)
      setMessage({ type: 'ok', text: 'Hesap silindi.' })
      load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Hesap silinemedi') })
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
      const r = await v1Send<{ fetched: number; new: number; suggested: number; auto_approved: number }>(
        'post',
        `/admin/bank-accounts/${a.id}/sync`,
      )
      setMessage({
        type: 'ok',
        text: `${a.label}: ${r.data.fetched} hareket okundu, ${r.data.new} yeni. Bekleyen ${r.data.suggested}, otomatik bağış ${r.data.auto_approved}.`,
      })
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

  const removeRule = async (id: string, kind: 'keyword' | 'sender') => {
    try {
      await v1Send('delete', `/admin/bank-match-rules/${id}`)
      if (kind === 'keyword') setRules((list) => list.filter((r) => r.id !== id))
      else setSenderRules((list) => list.filter((r) => r.id !== id))
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const visibleBanks = showAllBanks
    ? banks
    : banks.filter((b) => b.ready || b.configured || accounts.some((a) => a.bank_key === b.key))
  const banksToShow = visibleBanks.length > 0 ? visibleBanks : banks.slice(0, 6)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Banka Hesapları"
        description={<>Hareketleri çekilecek hesaplar, TR IBAN tanımları, web servis bilgileri ve akıllı eşleştirme kuralları.</>}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/gelen-havaleler" className={ghostButton}>Gelen havaleler</Link>
            <Link href="/admin/reconciliation" className={ghostButton}>Banka mutabakatı</Link>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-bold text-primary-700 hover:bg-primary-100">
              <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Yazdır
            </button>
            {accounts.length > 0 && (
              <ExportButtons
                filename="banka-hesaplari"
                title="Banka Hesapları"
                subtitle={`${accounts.length} hesap`}
                printable={false}
                getData={() => ({
                  headers: ['Banka', 'Hesap Adı', 'IBAN', 'Para Birimi', 'Durum', 'Otomatik Onay', 'Varsayılan Kampanya'],
                  rows: accounts.map((a) => [
                    a.bank,
                    a.label,
                    a.iban || '',
                    a.currency,
                    a.enabled ? 'Aktif' : 'Kapalı',
                    a.auto_approve ? 'Evet' : 'Hayır',
                    campaignTitle(a.default_campaign_id),
                  ]),
                })}
              />
            )}
          </div>
        }
      />

      <Notice message={message} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Tanımlı Hesap"
          value={accounts.length}
          hint={`${accounts.filter((a) => a.enabled).length} aktif`}
          detail={{
            title: 'Tanımlı Banka Hesapları',
            size: 'lg',
            content: () => (
              <Table inset>
                <THead><Tr><Th>Banka</Th><Th>Hesap</Th><Th>IBAN</Th><Th>Para Birimi</Th><Th>Durum</Th></Tr></THead>
                <TBody>
                  {accounts.map((a) => (
                    <Tr key={a.id}>
                      <Td>{a.bank}</Td>
                      <Td>{a.label}</Td>
                      <Td className="font-mono text-xs">{a.iban || '—'}</Td>
                      <Td>{a.currency}</Td>
                      <Td>{a.enabled ? 'Aktif' : 'Kapalı'}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ),
          }}
        />
        <StatCard
          label="Otomatik Onay"
          value={accounts.filter((a) => a.auto_approve).length}
          hint="kesin eşleşme onaylı hesap"
          tone="good"
          detail={{
            title: 'Otomatik Onay Açık Hesaplar',
            content: () => (
              <Table inset>
                <THead><Tr><Th>Hesap</Th><Th>IBAN</Th><Th>Varsayılan Kampanya</Th></Tr></THead>
                <TBody>
                  {accounts.filter((a) => a.auto_approve).map((a) => (
                    <Tr key={a.id}>
                      <Td>{a.bank} · {a.label}</Td>
                      <Td className="font-mono text-xs">{a.iban || '—'}</Td>
                      <Td>{campaignTitle(a.default_campaign_id)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ),
          }}
        />
        <StatCard
          label="Kampanya Kuralları"
          value={rules.length}
          hint="kelime → kampanya kuralı"
          detail={{
            title: 'Kampanya Anahtar Kelime Kuralları',
            content: () => (
              <Table inset>
                <THead><Tr><Th>Kelime / İfade</Th><Th>Kampanya</Th><Th>Kullanım</Th></Tr></THead>
                <TBody>
                  {rules.map((r) => (
                    <Tr key={r.id}>
                      <Td className="font-semibold">{r.pattern}</Td>
                      <Td>{r.campaign_title || campaignTitle(r.campaign_id)}</Td>
                      <Td>{r.hits}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ),
          }}
        />
        <StatCard
          label="Öğrenilmiş Gönderen"
          value={senderRules.length}
          hint="otomatik bağışçı tanıma"
          tone="brand"
          detail={{
            title: 'Öğrenilmiş Gönderen Kuralları',
            size: 'lg',
            content: () => (
              <Table inset>
                <THead><Tr><Th>Gönderen Adı</Th><Th>Bağışçı</Th><Th>Eşleşme</Th></Tr></THead>
                <TBody>
                  {senderRules.map((r) => (
                    <Tr key={r.id}>
                      <Td className="font-semibold">{r.pattern}</Td>
                      <Td>{r.donor_name || '—'}</Td>
                      <Td>{r.hits}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ),
          }}
        />
      </div>

      <Card className="space-y-3 border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-900">Banka Entegrasyonları ({banks.length})</h2>
          {banks.length > banksToShow.length || showAllBanks ? (
            <button type="button" onClick={() => setShowAllBanks((v) => !v)} className={ghostButton}>
              {showAllBanks ? 'Yalnız aktifleri göster' : `Tüm bankaları göster (${banks.length})`}
            </button>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {banksToShow.map((b) => (
            <div key={b.key} className="rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-gray-900">{b.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${b.ready ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                  {b.ready ? 'Web servisi hazır' : 'Ekstre yükleme ile'}
                </span>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {b.ready
                  ? 'Hareketler 10 dakikada bir otomatik çekilir.'
                  : 'Banka web servisini açıp teknik bilgileri gönderince otomatik çekim devreye girer. O zamana kadar ekstreyi Gelen Havaleler veya Mutabakat sayfasından yükleyin.'}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-gray-400">
                  {b.fields.length === 0 ? 'Ekstre ile çalışır' : b.configured ? 'Bilgiler kayıtlı' : 'Bilgi girilmedi'}
                </span>
                {canEdit && b.fields.length > 0 && (
                  <button
                    onClick={() =>
                      setCreds({
                        bank: b,
                        values: Object.fromEntries(b.fields.filter((f) => !f.secret).map((f) => [f.key, b.values[f.key] || ''])),
                      })
                    }
                    className={ghostButton}
                  >
                    Web servis bilgileri
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-3 border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">Hesaplar</h2>
          {canEdit && (
            <button onClick={() => setForm({ ...EMPTY, bank_key: banks[0]?.key || 'other' })} className={primaryButton}>
              Hesap ekle
            </button>
          )}
        </div>
        {accounts.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Henüz hesap eklenmedi.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table inset>
              <THead className="bg-gray-50">
                <Tr>
                  <Th>Hesap</Th>
                  <Th>IBAN</Th>
                  <Th>Varsayılan kampanya</Th>
                  <Th>Son çekim</Th>
                  <Th />
                </Tr>
              </THead>
              <TBody>
                {accounts.map((a) => (
                  <Tr key={a.id} className="align-top">
                    <Td>
                      <div className="font-bold text-gray-900">{a.bank} · {a.label}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-gray-700">{a.currency}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${a.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                          {a.enabled ? 'Aktif' : 'Kapalı'}
                        </span>
                        {a.auto_approve && (
                          <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-bold text-primary-700">Otomatik onay</span>
                        )}
                      </div>
                    </Td>
                    <Td className="font-mono text-gray-600">
                      {a.iban ? (
                        <div className="flex items-center gap-2">
                          <span>{a.iban}</span>
                          <button type="button" onClick={() => copyIban(a)} className="rounded border px-1.5 py-0.5 text-[10px] font-sans font-bold text-gray-600 hover:bg-gray-50">
                            {copiedId === a.id ? '✓ Kopyalandı' : 'Kopyala'}
                          </button>
                        </div>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="text-gray-700">{campaignTitle(a.default_campaign_id)}</Td>
                    <Td className="text-gray-600">
                      {a.last_synced_at ? new Date(a.last_synced_at).toLocaleString('tr-TR') : '—'}
                      {a.last_error && <div className="mt-1 max-w-xs text-[11px] text-red-600">{a.last_error}</div>}
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      {canEdit && (
                        <div className="flex justify-end gap-2">
                          {a.ready && (
                            <button onClick={() => syncNow(a)} disabled={syncing === a.id} className={ghostButton}>
                              {syncing === a.id ? 'Çekiliyor…' : 'Şimdi çek'}
                            </button>
                          )}
                          <button
                            onClick={() =>
                              setForm({
                                id: a.id,
                                bank_key: a.bank_key,
                                label: a.label,
                                iban: a.iban || '',
                                account_no: a.account_no || '',
                                currency: a.currency,
                                enabled: a.enabled,
                                auto_approve: a.auto_approve,
                                default_campaign_id: a.default_campaign_id,
                              })
                            }
                            className={ghostButton}
                          >
                            Düzenle
                          </button>
                          <button onClick={() => deleteAccount(a)} className={`${ghostButton} text-red-600 hover:border-red-300`}>
                            Sil
                          </button>
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

      <Card className="space-y-4 border border-gray-100 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Akıllı Eşleştirme Kuralları</h2>
            <p className="text-xs text-gray-500">
              Açıklama kelimelerini kampanyalara bağlayın veya onaylardan öğrenilen gönderen → bağışçı kurallarını yönetin.
            </p>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setRuleTab('keyword')}
              className={`rounded-full px-3 py-1 text-xs font-bold ${ruleTab === 'keyword' ? 'bg-primary-600 text-white' : 'border bg-white text-gray-700'}`}
            >
              Kampanya Kuralları ({rules.length})
            </button>
            <button
              type="button"
              onClick={() => setRuleTab('sender')}
              className={`rounded-full px-3 py-1 text-xs font-bold ${ruleTab === 'sender' ? 'bg-primary-600 text-white' : 'border bg-white text-gray-700'}`}
            >
              Öğrenilmiş Gönderenler ({senderRules.length})
            </button>
          </div>
        </div>

        {ruleTab === 'keyword' ? (
          <>
            {canEdit && (
              <form onSubmit={addRule} className="flex flex-col gap-2 sm:flex-row">
                <input
                  className={`${inputClass} sm:w-60`}
                  placeholder="Kelime veya ifade"
                  value={rule.pattern}
                  onChange={(e) => setRule({ ...rule, pattern: e.target.value })}
                  minLength={3}
                  required
                />
                <select
                  className={`${inputClass} sm:w-72`}
                  value={rule.campaign_id}
                  onChange={(e) => setRule({ ...rule, campaign_id: e.target.value })}
                  required
                >
                  <option value="">Kampanya seçin</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
                <button type="submit" className={primaryButton}>Kural ekle</button>
              </form>
            )}
            {rules.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-400">Henüz kampanya kuralı eklenmemiş.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {rules.map((r) => (
                  <li key={r.id} className="flex items-center justify-between p-2.5 text-sm">
                    <span>
                      <strong>&quot;{r.pattern}&quot;</strong> → {r.campaign_title || campaignTitle(r.campaign_id)}
                      {r.hits > 0 && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">{r.hits}×</span>}
                    </span>
                    {canEdit && (
                      <button onClick={() => removeRule(r.id, 'keyword')} className="text-xs font-bold text-red-600">Sil</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : senderRules.length === 0 ? (
          <p className="py-4 text-center text-xs text-gray-400">Henüz öğrenilmiş gönderen kuralı yok. Havale onayladıkça otomatik oluşur.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {senderRules.map((r) => (
              <li key={r.id} className="flex items-center justify-between p-2.5 text-sm">
                <span>
                  <strong>{r.pattern}</strong> → <span className="text-primary-700 font-semibold">{r.donor_name || 'Bağışçı'}</span>
                  <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">{r.hits}×</span>
                </span>
                {canEdit && (
                  <button onClick={() => removeRule(r.id, 'sender')} className="text-xs font-bold text-red-600">Sil</button>
                )}
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
              <div className="sm:col-span-2">
                <TextInput label="IBAN" value={form.iban} onChange={(v) => setForm({ ...form, iban: v.toUpperCase() })} placeholder="TR00 0000 0000 0000 0000 0000 00" />
              </div>
              <Label label="Para birimi">
                <select className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
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
              <TextInput
                key={f.key}
                label={f.label}
                type={f.secret ? 'password' : 'text'}
                autoComplete="off"
                placeholder={creds.bank.values[f.key] || ''}
                value={creds.values[f.key] || ''}
                onChange={(v) => setCreds({ ...creds, values: { ...creds.values, [f.key]: v } })}
              />
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
