'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { Card } from '@e-infak/ui'
import { adminApiBase, adminAuthHeaders, apiErrorMessage, exportCsv, formatMoney, hasPermission, useAdminAccess } from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { PageHeader, StatCard, TBody, THead, Table, Td, Th, Tr, confirmDialog } from '../../../../components/admin/ui'

const accGet = <T,>(path: string, params?: Record<string, unknown>) =>
  axios.get<T>(`${adminApiBase()}/api/v1/admin-features/acc${path}`, { headers: adminAuthHeaders(), params })
const accSend = <T,>(method: 'post' | 'put' | 'delete', path: string, data?: unknown) =>
  axios.request<T>({ method, url: `${adminApiBase()}/api/v1/admin-features/acc${path}`, headers: adminAuthHeaders(), data })

interface Account { id: string; name: string; kind: string; kind_label: string; currency: string; bank_name: string | null; iban: string | null; opening_balance_cents: number; opening_date: string | null; default_for: string | null; is_active: boolean; balance_cents: number }
interface CardRow { id: string; name: string; code: string | null; group: string | null; is_active: boolean }
interface Party { id: string; name: string; kind: string; kind_label: string; tax_no: string | null; phone: string | null; iban: string | null; unpaid_cents?: number }
interface ExpenseRow { id: string; card_name: string; amount_cents: number; currency: string; expense_date: string; description: string | null; document_no: string | null; counterparty: string | null; account_name: string | null; paid: boolean }
interface ChequeRow { id: string; kind_label: string; direction: string; direction_label: string; number: string; bank_name: string | null; drawer: string | null; counterparty: string | null; amount_cents: number; currency: string; due_date: string; status: string; status_label: string; days_to_due: number | null; overdue: boolean }
interface EmployeeRow { id: string; full_name: string; title: string | null; iban: string | null; monthly_salary_cents: number; is_active: boolean; open_advance_cents: number }
interface PayrollRow { id: string; full_name: string; salary_cents: number; overtime_cents: number; bonus_cents: number; deduction_cents: number; advance_cents: number; net_cents: number; status: string; iban: string | null }

type Tab = 'summary' | 'accounts' | 'expenses' | 'invoices' | 'stock' | 'parties' | 'cheques' | 'payroll'
type Msg = { type: 'ok' | 'error'; text: string } | null
const fmt = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString('tr-TR') : '—')
/** "1.250,50" (TR) ve "1250.50" yazımlarını kuruşa çevirir; virgül varsa nokta binlik ayırıcıdır. */
const cents = (v: string) => {
  const t = (v || '0').trim()
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d+\.\d{1,2}$/.test(t) ? t : t.replace(/\./g, '')
  return Math.round(Number(normal) * 100)
}
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const DEFAULT_FOR: Record<string, string> = { cash: 'Nakit bağışlar', bank_transfer: 'Havale bağışları', credit_card: 'Kartlı bağışlar' }
const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'SAR', 'CHF']

export default function AccountingPage() {
  const { data: access } = useAdminAccess()
  const canEdit = hasPermission(access, 'finance_manage')
  const [tab, setTab] = useState<Tab>('summary')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [parties, setParties] = useState<Party[]>([])
  const [message, setMessage] = useState<Msg>(null)
  const reloadAccounts = () => accGet<Account[]>('/accounts').then((r) => setAccounts(r.data)).catch((err) => setMessage({ type: 'error', text: apiErrorMessage(err, 'Muhasebe modülü yüklenemedi') }))
  const reloadParties = () => accGet<Party[]>('/counterparties').then((r) => setParties(r.data)).catch(() => {})
  useEffect(() => { reloadAccounts(); reloadParties() }, [])
  const active = accounts.filter((a) => a.is_active)
  const shared = { accounts: active, parties, canEdit, onMessage: setMessage, reloadAccounts, reloadParties }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Muhasebe"
        description={<>Kasa / banka hesapları, giderler, cari kartlar, çek-senet ve personel maaşı. Onaylanan bağışlar, ödeme yöntemine göre varsayılan hesaba otomatik işlenir.</>}
        actions={<button type="button" onClick={() => window.print()} className={ghostButton}>🖨️ Yazdır / PDF</button>}
      />
      <div className="flex gap-1 overflow-x-auto border-b text-sm font-semibold">
        {([['summary', 'Özet'], ['accounts', 'Kasa & Banka'], ['expenses', 'Giderler'], ['invoices', 'Faturalar'], ['stock', 'Stok & Depo'], ['parties', 'Cariler'], ['cheques', 'Çek & Senet'], ['payroll', 'Personel & Maaş']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setMessage(null) }} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 ${tab === k ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500'}`}>{l}</button>
        ))}
      </div>
      <Notice message={message} />
      {tab === 'summary' && <Summary onMessage={setMessage} />}
      {tab === 'accounts' && <Accounts {...shared} all={accounts} />}
      {tab === 'expenses' && <Expenses {...shared} />}
      {tab === 'invoices' && <Invoices {...shared} />}
      {tab === 'stock' && <Stock {...shared} />}
      {tab === 'parties' && <Parties {...shared} />}
      {tab === 'cheques' && <Cheques {...shared} />}
      {tab === 'payroll' && <Payroll {...shared} />}
    </div>
  )
}

interface Shared { accounts: Account[]; parties: Party[]; canEdit: boolean; onMessage: (m: Msg) => void; reloadAccounts: () => void; reloadParties: () => void }

function AccountSelect({ accounts, value, onChange, currency, label = 'Hesap', optional }: { accounts: Account[]; value: string; onChange: (v: string) => void; currency?: string; label?: string; optional?: string }) {
  return (
    <Label label={label}>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{optional || 'Seçin'}</option>
        {accounts.filter((a) => !currency || a.currency === currency).map((a) => <option key={a.id} value={a.id}>{a.name} ({formatMoney(a.balance_cents, a.currency)})</option>)}
      </select>
    </Label>
  )
}

function Summary({ onMessage }: { onMessage: (m: Msg) => void }) {
  const [range, setRange] = useState({ start: monthStart(), end: today() })
  const [data, setData] = useState<any>(null)
  useEffect(() => { accGet('/summary', range).then((r) => setData(r.data)).catch((err) => onMessage({ type: 'error', text: apiErrorMessage(err) })) }, [range]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return <p className="text-sm text-gray-400">Yükleniyor…</p>
  const nonTryIn = Object.entries((data.income_by_currency || {}) as Record<string, number>).filter(([c]) => c !== 'TRY')
  const nonTryOut = Object.entries((data.expense_by_currency || {}) as Record<string, number>).filter(([c]) => c !== 'TRY')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" className={`${inputClass} w-40`} value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} />
        <input type="date" className={`${inputClass} w-40`} value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(data.totals_by_currency as Record<string, number>).map(([cur, v]) => (
          <StatCard
            key={cur}
            label={`Toplam bakiye (${cur})`}
            value={formatMoney(v, cur)}
            detail={{
              title: `${cur} Hesap Bakiyeleri`,
              content: () => (
                <Table inset>
                  <THead><Tr><Th>Hesap</Th><Th>Tür</Th><Th className="text-right">Bakiye</Th></Tr></THead>
                  <TBody>
                    {(data.accounts || []).filter((a: Account) => a.currency === cur && a.is_active).map((a: Account) => (
                      <Tr key={a.id}><Td>{a.name}</Td><Td>{a.kind_label}</Td><Td className="text-right font-mono">{formatMoney(a.balance_cents, cur)}</Td></Tr>
                    ))}
                  </TBody>
                </Table>
              ),
            }}
          />
        ))}
        <StatCard
          label="Dönem geliri (TL)"
          value={formatMoney(data.income_cents)}
          hint={nonTryIn.length ? nonTryIn.map(([c, v]) => formatMoney(v, c)).join(' · ') : undefined}
          tone="good"
          detail={{
            title: 'Dönem Gelir Kırılımı',
            content: () => (
              <Table inset>
                <THead><Tr><Th>Kategori</Th><Th className="text-right">Tutar (TL)</Th></Tr></THead>
                <TBody>
                  {(data.income || []).map((r: any) => (
                    <Tr key={r.category}><Td>{r.category}</Td><Td className="text-right font-mono">{formatMoney(r.total_cents)}</Td></Tr>
                  ))}
                </TBody>
              </Table>
            ),
          }}
        />
        <StatCard
          label="Dönem gideri (TL)"
          value={formatMoney(data.expense_cents)}
          hint={nonTryOut.length ? nonTryOut.map(([c, v]) => formatMoney(v, c)).join(' · ') : undefined}
          tone="bad"
          detail={{
            title: 'Dönem Gider Kırılımı',
            content: () => (
              <Table inset>
                <THead><Tr><Th>Kategori</Th><Th className="text-right">Tutar (TL)</Th></Tr></THead>
                <TBody>
                  {(data.expense || []).map((r: any) => (
                    <Tr key={r.category}><Td>{r.category}</Td><Td className="text-right font-mono">{formatMoney(r.total_cents)}</Td></Tr>
                  ))}
                </TBody>
              </Table>
            ),
          }}
        />
        <StatCard
          label="Ödenmemiş gider"
          value={formatMoney(data.unpaid_expense_cents)}
          tone={data.unpaid_expense_cents > 0 ? 'warn' : 'neutral'}
        />
        <StatCard
          label="Ödenmemiş maaş"
          value={formatMoney(data.draft_payroll_cents)}
          tone={data.draft_payroll_cents > 0 ? 'warn' : 'neutral'}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[['Gelirler', data.income], ['Giderler', data.expense]].map(([title, rows]: any) => (
          <Card key={title} className="border border-gray-100 p-5 shadow-sm">
            <h2 className="mb-2 text-sm font-bold text-gray-900">{title} (TL, virman hariç)</h2>
            <Table><TBody>{rows.map((r: any) => (
              <Tr key={r.category} className="border-t"><Td>{r.category}</Td><Td className="text-right font-semibold">{formatMoney(r.total_cents)}</Td></Tr>
            ))}{!rows.length && <Tr><Td className="text-center text-gray-400">Hareket yok</Td></Tr>}</TBody></Table>
          </Card>
        ))}
      </div>
      <Card className="border border-gray-100 p-5 shadow-sm">
        <h2 className="mb-2 text-sm font-bold text-gray-900">30 gün içinde vadesi gelen çek / senet</h2>
        <Table><TBody>{data.upcoming_cheques.map((c: ChequeRow) => (
          <Tr key={c.id} className="border-t"><Td>{c.direction_label} {c.kind_label.toLowerCase()} {c.number}</Td><Td>{c.drawer || c.counterparty || '—'}</Td><Td>{fmt(c.due_date)}</Td>
            <Td className={c.overdue ? 'font-bold text-red-700' : ''}>{c.overdue ? 'vadesi geçti' : `${c.days_to_due} gün`}</Td><Td className="text-right font-semibold">{formatMoney(c.amount_cents, c.currency)}</Td></Tr>
        ))}{!data.upcoming_cheques.length && <Tr><Td className="text-center text-gray-400">Yok</Td></Tr>}</TBody></Table>
      </Card>
    </div>
  )
}

function Accounts({ all, accounts, canEdit, onMessage, reloadAccounts }: Shared & { all: Account[] }) {
  const empty = { name: '', kind: 'cash', currency: 'TRY', bank_name: '', iban: '', opening: '0', opening_date: '', default_for: '', is_active: true }
  const [form, setForm] = useState<(typeof empty & { id?: string }) | null>(null)
  const [statement, setStatement] = useState<any>(null)
  const [range, setRange] = useState({ start: monthStart(), end: today() })
  const [move, setMove] = useState<{ mode: 'entry' | 'transfer'; account_id: string; to: string; direction: string; amount: string; category: string; description: string; date: string } | null>(null)

  const openStatement = (id: string, r = range) => accGet(`/accounts/${id}/statement`, r).then((res) => setStatement(res.data)).catch((err) => onMessage({ type: 'error', text: apiErrorMessage(err) }))
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    const body = { name: form.name, kind: form.kind, currency: form.currency, bank_name: form.bank_name || null, iban: form.iban || null, opening_balance_cents: cents(form.opening), opening_date: form.opening_date || null, default_for: form.default_for || null, is_active: form.is_active }
    try {
      await (form.id ? accSend('put', `/accounts/${form.id}`, body) : accSend('post', '/accounts', body))
      setForm(null); onMessage({ type: 'ok', text: 'Hesap kaydedildi' }); reloadAccounts()
    } catch (err) { onMessage({ type: 'error', text: apiErrorMessage(err) }) }
  }
  const saveMove = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!move) return
    try {
      if (move.mode === 'transfer') await accSend('post', '/transfers', { from_account_id: move.account_id, to_account_id: move.to, amount_cents: cents(move.amount), entry_date: move.date || null, description: move.description || null })
      else await accSend('post', '/entries', { account_id: move.account_id, direction: move.direction, amount_cents: cents(move.amount), entry_date: move.date || null, category: move.category, description: move.description || null })
      setMove(null); onMessage({ type: 'ok', text: move.mode === 'transfer' ? 'Virman yapıldı' : 'Hareket kaydedildi' }); reloadAccounts()
      if (statement) openStatement(statement.account.id)
    } catch (err) { onMessage({ type: 'error', text: apiErrorMessage(err) }) }
  }
  const removeEntry = async (id: string) => {
    if (!(await confirmDialog('Hareket silinsin mi?'))) return
    try { await accSend('delete', `/entries/${id}`); reloadAccounts(); if (statement) openStatement(statement.account.id) } catch (err) { onMessage({ type: 'error', text: apiErrorMessage(err) }) }
  }
  const src = accounts.find((a) => a.id === move?.account_id)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {canEdit && <>
          <button className={primaryButton} onClick={() => setForm({ ...empty })}>+ Hesap</button>
          <button className={ghostButton} onClick={() => setMove({ mode: 'entry', account_id: '', to: '', direction: 'out', amount: '', category: '', description: '', date: '' })}>+ Elle hareket</button>
          <button className={ghostButton} onClick={() => setMove({ mode: 'transfer', account_id: '', to: '', direction: 'out', amount: '', category: 'Virman', description: '', date: '' })}>⇄ Virman</button>
        </>}
        {all.length > 0 && <button type="button" className={`${ghostButton} ml-auto`} onClick={() => exportCsv('kasa-banka-hesaplari.csv', ['Hesap', 'Tür', 'Para Birimi', 'IBAN', 'Bakiye'], all.map((a) => [a.name, a.kind_label, a.currency, a.iban || '', a.balance_cents / 100]))}>⬇ CSV</button>}
      </div>
      {form && (
        <Card className="border border-gray-100 p-5 shadow-sm"><form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <TextInput label="Hesap adı" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Label label="Tür"><select className={inputClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="cash">Kasa</option><option value="bank">Banka</option><option value="pos">POS / sanal POS</option></select></Label>
            <Label label="Para birimi"><select className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Label>
            <Label label="Otomatik bağış girişi"><select className={inputClass} value={form.default_for} onChange={(e) => setForm({ ...form, default_for: e.target.value })}><option value="">Yok</option>{Object.entries(DEFAULT_FOR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Label>
            <TextInput label="Banka" value={form.bank_name} onChange={(v) => setForm({ ...form, bank_name: v })} />
            <TextInput label="IBAN" value={form.iban} onChange={(v) => setForm({ ...form, iban: v })} />
            <TextInput label="Açılış bakiyesi" inputMode="decimal" value={form.opening} onChange={(v) => setForm({ ...form, opening: v })} />
            <TextInput label="Açılış tarihi" type="date" value={form.opening_date} onChange={(v) => setForm({ ...form, opening_date: v })} />
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Kullanımda</label>
          <div className="flex gap-2"><button className={primaryButton}>Kaydet</button><button type="button" className={ghostButton} onClick={() => setForm(null)}>Vazgeç</button></div>
        </form></Card>
      )}
      {move && (
        <Card className="border border-gray-100 p-5 shadow-sm"><form onSubmit={saveMove} className="space-y-3">
          <h2 className="text-sm font-bold">{move.mode === 'transfer' ? 'Hesaplar arası virman' : 'Elle kasa / banka hareketi'}</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <AccountSelect accounts={accounts} value={move.account_id} onChange={(v) => setMove({ ...move, account_id: v, to: '' })} label={move.mode === 'transfer' ? 'Çıkan hesap' : 'Hesap'} />
            {move.mode === 'transfer'
              ? <AccountSelect accounts={accounts.filter((a) => a.id !== move.account_id)} currency={src?.currency} value={move.to} onChange={(v) => setMove({ ...move, to: v })} label="Giren hesap" />
              : <Label label="Yön"><select className={inputClass} value={move.direction} onChange={(e) => setMove({ ...move, direction: e.target.value })}><option value="in">Giriş</option><option value="out">Çıkış</option></select></Label>}
            <TextInput label="Tutar" required inputMode="decimal" value={move.amount} onChange={(v) => setMove({ ...move, amount: v })} />
            <TextInput label="Tarih" type="date" max={today()} value={move.date} onChange={(v) => setMove({ ...move, date: v })} />
            {move.mode === 'entry' && <TextInput label="Kategori" required value={move.category} onChange={(v) => setMove({ ...move, category: v })} placeholder="ör. Banka masrafı" />}
            <div className="sm:col-span-2"><TextInput label="Açıklama" value={move.description} onChange={(v) => setMove({ ...move, description: v })} /></div>
          </div>
          <div className="flex gap-2"><button className={primaryButton}>Kaydet</button><button type="button" className={ghostButton} onClick={() => setMove(null)}>Vazgeç</button></div>
        </form></Card>
      )}
      <Card className="border border-gray-100 p-5 shadow-sm">
        <Table>
          <THead><Tr><Th>Hesap</Th><Th>Tür</Th><Th>Otomatik giriş</Th><Th>IBAN</Th><Th className="text-right">Bakiye</Th><Th /></Tr></THead>
          <TBody>{all.map((a) => (
            <Tr key={a.id} className={`border-t ${a.is_active ? '' : 'text-gray-400'}`}>
              <Td className="font-semibold">{a.name}</Td><Td>{a.kind_label} · {a.currency}</Td><Td>{a.default_for ? DEFAULT_FOR[a.default_for] : '—'}</Td><Td>{a.iban || '—'}</Td>
              <Td className={`text-right font-bold ${a.balance_cents < 0 ? 'text-red-700' : ''}`}>{formatMoney(a.balance_cents, a.currency)}</Td>
              <Td className="whitespace-nowrap text-right">
                <button className="mr-3 font-bold text-primary-700" onClick={() => openStatement(a.id)}>Ekstre</button>
                {canEdit && <button className="font-bold text-gray-700" onClick={() => setForm({ id: a.id, name: a.name, kind: a.kind, currency: a.currency, bank_name: a.bank_name || '', iban: a.iban || '', opening: String(a.opening_balance_cents / 100), opening_date: a.opening_date || '', default_for: a.default_for || '', is_active: a.is_active })}>Düzenle</button>}
              </Td>
            </Tr>
          ))}{!all.length && <Tr><Td colSpan={6} className="text-center text-gray-400">Henüz hesap yok. Önce kasa ve banka hesaplarını tanımlayın.</Td></Tr>}</TBody>
        </Table>
      </Card>
      {statement && (
        <Card className="space-y-3 border border-gray-100 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold">{statement.account.name} ekstresi</h2>
            <div className="flex gap-2">
              <input type="date" className={`${inputClass} w-40`} value={range.start} onChange={(e) => { const r = { ...range, start: e.target.value }; setRange(r); openStatement(statement.account.id, r) }} />
              <input type="date" className={`${inputClass} w-40`} value={range.end} onChange={(e) => { const r = { ...range, end: e.target.value }; setRange(r); openStatement(statement.account.id, r) }} />
              <button className={ghostButton} onClick={() => exportCsv(`ekstre-${statement.account.name}.csv`, ['Tarih', 'Kategori', 'Açıklama', 'Cari', 'Giriş', 'Çıkış', 'Bakiye'],
                statement.entries.map((e: any) => [fmt(e.entry_date), e.category, e.description, e.counterparty, e.direction === 'in' ? e.amount_cents / 100 : '', e.direction === 'out' ? e.amount_cents / 100 : '', e.balance_cents / 100]))}>⬇ CSV</button>
              <button className={ghostButton} onClick={() => setStatement(null)}>Kapat</button>
            </div>
          </div>
          <p className="text-xs text-gray-600">Dönem başı {formatMoney(statement.opening_cents, statement.account.currency)} · Giriş {formatMoney(statement.in_cents, statement.account.currency)} · Çıkış {formatMoney(statement.out_cents, statement.account.currency)} · Dönem sonu <b>{formatMoney(statement.closing_cents, statement.account.currency)}</b></p>
          <div className="max-h-[480px] overflow-auto">
            <Table>
              <THead className="sticky top-0 bg-white"><Tr><Th>Tarih</Th><Th>Kategori</Th><Th>Açıklama</Th><Th className="text-right">Giriş</Th><Th className="text-right">Çıkış</Th><Th className="text-right">Bakiye</Th><Th /></Tr></THead>
              <TBody>{statement.entries.map((e: any) => (
                <Tr key={e.id} className="border-t"><Td>{fmt(e.entry_date)}</Td><Td>{e.category}</Td><Td>{[e.description, e.counterparty].filter(Boolean).join(' · ') || '—'}</Td>
                  <Td className="text-right text-green-700">{e.direction === 'in' ? formatMoney(e.amount_cents, statement.account.currency) : ''}</Td>
                  <Td className="text-right text-red-700">{e.direction === 'out' ? formatMoney(e.amount_cents, statement.account.currency) : ''}</Td>
                  <Td className="text-right font-semibold">{formatMoney(e.balance_cents, statement.account.currency)}</Td>
                  <Td className="text-right">{canEdit && (e.source_type === 'manual' || e.source_type === 'transfer') && <button className="font-bold text-red-600" onClick={() => removeEntry(e.id)}>Sil</button>}</Td></Tr>
              ))}{!statement.entries.length && <Tr><Td colSpan={7} className="text-center text-gray-400">Bu aralıkta hareket yok.</Td></Tr>}</TBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  )
}

function Expenses({ accounts, parties, canEdit, onMessage, reloadAccounts }: Shared) {
  const [cards, setCards] = useState<CardRow[]>([])
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [filters, setFilters] = useState({ start: monthStart(), end: today(), card_id: '', unpaid: false })
  const [form, setForm] = useState({ expense_card_id: '', amount: '', currency: 'TRY', expense_date: '', description: '', document_no: '', counterparty_id: '', account_id: '' })
  const [newCard, setNewCard] = useState('')
  const load = () => accGet<ExpenseRow[]>('/expenses', { ...filters, card_id: filters.card_id || undefined, unpaid: filters.unpaid || undefined }).then((r) => setRows(r.data)).catch((err) => onMessage({ type: 'error', text: apiErrorMessage(err) }))
  const loadCards = () => accGet<CardRow[]>('/expense-cards').then((r) => setCards(r.data)).catch(() => {})
  useEffect(() => { loadCards() }, [])
  useEffect(() => { load() }, [filters]) // eslint-disable-line react-hooks/exhaustive-deps
  const addCard = async () => {
    if (!newCard.trim()) return
    try { const r = await accSend<CardRow>('post', '/expense-cards', { name: newCard.trim() }); setNewCard(''); await loadCards(); setForm({ ...form, expense_card_id: r.data.id }) } catch (err) { onMessage({ type: 'error', text: apiErrorMessage(err) }) }
  }
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await accSend('post', '/expenses', { ...form, amount_cents: cents(form.amount), expense_date: form.expense_date || null, counterparty_id: form.counterparty_id || null, account_id: form.account_id || null, description: form.description || null, document_no: form.document_no || null })
      setForm({ ...form, amount: '', description: '', document_no: '' }); onMessage({ type: 'ok', text: form.account_id ? 'Gider kaydedildi ve hesaptan düşüldü' : 'Ödenmemiş gider (borç) kaydedildi' }); load(); reloadAccounts()
    } catch (err) { onMessage({ type: 'error', text: apiErrorMessage(err) }) }
  }
  const [payRow, setPayRow] = useState<ExpenseRow | null>(null)
  const [payAccId, setPayAccId] = useState('')
  const pay = (row: ExpenseRow) => {
    const first = accounts.find((a) => a.currency === row.currency)?.id || ''
    setPayAccId(first)
    setPayRow(row)
  }
  const submitPay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payRow || !payAccId) return
    try {
      await accSend('post', `/expenses/${payRow.id}/pay`, { account_id: payAccId })
      setPayRow(null)
      onMessage({ type: 'ok', text: 'Gider ödendi ve hesaptan düşüldü' })
      load(); reloadAccounts()
    } catch (err) { onMessage({ type: 'error', text: apiErrorMessage(err) }) }
  }
  const remove = async (row: ExpenseRow) => {
    if (!(await confirmDialog('Gider ve hesap hareketi silinsin mi?'))) return
    try { await accSend('delete', `/expenses/${row.id}`); load(); reloadAccounts() } catch (err) { onMessage({ type: 'error', text: apiErrorMessage(err) }) }
  }
  const total = rows.reduce((s, r) => ({ ...s, [r.currency]: (s[r.currency] || 0) + r.amount_cents }), {} as Record<string, number>)
  return (
    <div className="space-y-4">
      {canEdit && (
        <Card className="border border-gray-100 p-5 shadow-sm"><form onSubmit={save} className="space-y-3">
          <h2 className="text-sm font-bold">Gider ekle</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <Label label="Gider kartı"><select required className={inputClass} value={form.expense_card_id} onChange={(e) => setForm({ ...form, expense_card_id: e.target.value })}><option value="">Seçin</option>{cards.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Label>
            <TextInput label="Tutar" required inputMode="decimal" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
            <Label label="Para birimi"><select className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value, account_id: '' })}>{['TRY', 'USD', 'EUR', 'GBP'].map((c) => <option key={c}>{c}</option>)}</select></Label>
            <TextInput label="Tarih" type="date" max={today()} value={form.expense_date} onChange={(v) => setForm({ ...form, expense_date: v })} />
            <Label label="Cari (tedarikçi)"><select className={inputClass} value={form.counterparty_id} onChange={(e) => setForm({ ...form, counterparty_id: e.target.value })}><option value="">—</option>{parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Label>
            <AccountSelect accounts={accounts} currency={form.currency} value={form.account_id} onChange={(v) => setForm({ ...form, account_id: v })} label="Ödendiği hesap" optional="Ödenmedi (borç)" />
            <TextInput label="Fatura / fiş no" value={form.document_no} onChange={(v) => setForm({ ...form, document_no: v })} />
            <TextInput label="Açıklama" value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button className={primaryButton}>Kaydet</button>
            <div className="ml-auto flex items-end gap-2"><div className="w-52"><TextInput label="Yeni gider kartı" value={newCard} onChange={setNewCard} placeholder="ör. Elektrik" /></div><button type="button" className={ghostButton} onClick={addCard}>Ekle</button></div>
          </div>
        </form></Card>
      )}
      <Card className="space-y-3 border border-gray-100 p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className={`${inputClass} w-40`} value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value })} />
          <input type="date" className={`${inputClass} w-40`} value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value })} />
          <select className={`${inputClass} w-44`} value={filters.card_id} onChange={(e) => setFilters({ ...filters, card_id: e.target.value })}><option value="">Tüm kartlar</option>{cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <label className="flex items-center gap-1.5 text-xs font-semibold"><input type="checkbox" checked={filters.unpaid} onChange={(e) => setFilters({ ...filters, unpaid: e.target.checked })} /> Yalnız ödenmemiş</label>
          <span className="text-xs text-gray-500">{Object.entries(total).map(([c, v]) => formatMoney(v, c)).join(' · ')}</span>
          <button className={`${ghostButton} ml-auto`} onClick={() => exportCsv('giderler.csv', ['Tarih', 'Kart', 'Açıklama', 'Cari', 'Belge', 'Tutar', 'Para birimi', 'Hesap'], rows.map((r) => [fmt(r.expense_date), r.card_name, r.description, r.counterparty, r.document_no, r.amount_cents / 100, r.currency, r.account_name || 'Ödenmedi']))}>⬇ CSV</button>
        </div>
        <Table>
          <THead><Tr><Th>Tarih</Th><Th>Kart</Th><Th>Açıklama</Th><Th>Cari</Th><Th>Belge</Th><Th className="text-right">Tutar</Th><Th>Hesap</Th><Th /></Tr></THead>
          <TBody>{rows.map((r) => (
            <Tr key={r.id} className="border-t"><Td>{fmt(r.expense_date)}</Td><Td className="font-semibold">{r.card_name}</Td><Td>{r.description || '—'}</Td><Td>{r.counterparty || '—'}</Td><Td>{r.document_no || '—'}</Td>
              <Td className="text-right font-semibold">{formatMoney(r.amount_cents, r.currency)}</Td>
              <Td className={r.paid ? '' : 'font-bold text-amber-700'}>{r.account_name || 'Ödenmedi'}</Td>
              <Td className="whitespace-nowrap text-right">{canEdit && <>{!r.paid && <button className="mr-2 font-bold text-primary-700" onClick={() => pay(r)}>Öde</button>}<button className="font-bold text-red-600" onClick={() => remove(r)}>Sil</button></>}</Td></Tr>
          ))}{!rows.length && <Tr><Td colSpan={8} className="text-center text-gray-400">Bu aralıkta gider yok.</Td></Tr>}</TBody>
        </Table>
      </Card>
      {payRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPayRow(null)}>
          <form onSubmit={submitPay} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-gray-900">Gider Öde — {payRow.card_name}</h3>
            <p className="text-xs text-gray-500">Tutar: <b>{formatMoney(payRow.amount_cents, payRow.currency)}</b></p>
            <AccountSelect accounts={accounts} currency={payRow.currency} value={payAccId} onChange={setPayAccId} label="Ödendiği hesap" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPayRow(null)} className={ghostButton}>Vazgeç</button>
              <button type="submit" disabled={!payAccId} className={primaryButton}>Ödemeyi Kaydet</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function Parties({ parties, canEdit, onMessage, reloadParties }: Shared) {
  const empty = { name: '', kind: 'supplier', tax_no: '', tax_office: '', phone: '', email: '', iban: '', address: '', note: '' }
  const [form, setForm] = useState<(typeof empty & { id?: string }) | null>(null)
  const [statement, setStatement] = useState<any>(null)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    const body = Object.fromEntries(Object.entries(form).filter(([k]) => k !== 'id').map(([k, v]) => [k, v || null]))
    try { await (form.id ? accSend('put', `/counterparties/${form.id}`, { ...body, is_active: true }) : accSend('post', '/counterparties', body)); setForm(null); reloadParties(); onMessage({ type: 'ok', text: 'Cari kaydedildi' }) } catch (err) { onMessage({ type: 'error', text: apiErrorMessage(err) }) }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {canEdit && <button className={primaryButton} onClick={() => setForm({ ...empty })}>+ Cari kart</button>}
        {parties.length > 0 && <button type="button" className={`${ghostButton} ml-auto`} onClick={() => exportCsv('cariler.csv', ['Ünvan', 'Tür', 'Vergi No', 'Telefon', 'IBAN', 'Ödenmemiş Gider'], parties.map((p) => [p.name, p.kind_label, p.tax_no || '', p.phone || '', p.iban || '', (p.unpaid_cents || 0) / 100]))}>⬇ CSV</button>}
      </div>
      {form && (
        <Card className="border border-gray-100 p-5 shadow-sm"><form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <TextInput label="Ünvan / ad" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Label label="Tür"><select className={inputClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="supplier">Tedarikçi</option><option value="customer">Müşteri</option><option value="staff">Personel</option><option value="partner">Ortak kurum</option><option value="other">Diğer</option></select></Label>
            <TextInput label="Vergi no / TC" value={form.tax_no} onChange={(v) => setForm({ ...form, tax_no: v })} />
            <TextInput label="Vergi dairesi" value={form.tax_office} onChange={(v) => setForm({ ...form, tax_office: v })} />
            <TextInput label="Telefon" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <TextInput label="E-posta" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <TextInput label="IBAN" value={form.iban} onChange={(v) => setForm({ ...form, iban: v })} />
            <TextInput label="Adres" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
          </div>
          <div className="flex gap-2"><button className={primaryButton}>Kaydet</button><button type="button" className={ghostButton} onClick={() => setForm(null)}>Vazgeç</button></div>
        </form></Card>
      )}
      <Card className="border border-gray-100 p-5 shadow-sm">
        <Table>
          <THead><Tr><Th>Cari</Th><Th>Tür</Th><Th>Vergi no</Th><Th>Telefon</Th><Th className="text-right">Ödenmemiş gider</Th><Th /></Tr></THead>
          <TBody>{parties.map((p) => (
            <Tr key={p.id} className="border-t"><Td className="font-semibold">{p.name}</Td><Td>{p.kind_label}</Td><Td>{p.tax_no || '—'}</Td><Td>{p.phone || '—'}</Td>
              <Td className={`text-right ${p.unpaid_cents ? 'font-bold text-amber-700' : ''}`}>{p.unpaid_cents ? formatMoney(p.unpaid_cents) : '—'}</Td>
              <Td className="whitespace-nowrap text-right"><button className="mr-3 font-bold text-primary-700" onClick={() => Promise.all([accGet(`/counterparties/${p.id}/statement`), accGet(`/counterparties/${p.id}/ledger`)]).then(([st, lg]) => setStatement({ ...(st.data as object), ledger: lg.data }))}>Ekstre</button>
                {canEdit && <button className="font-bold text-gray-700" onClick={() => setForm({ ...empty, ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v ?? ''])), id: p.id } as any)}>Düzenle</button>}</Td></Tr>
          ))}{!parties.length && <Tr><Td colSpan={6} className="text-center text-gray-400">Cari kart yok.</Td></Tr>}</TBody>
        </Table>
      </Card>
      {statement && (
        <Card className="space-y-3 border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between"><h2 className="text-sm font-bold">{statement.counterparty.name} · bakiye {formatMoney(Math.abs(statement.ledger.balance_cents))} ({statement.ledger.status})</h2>
            <div className="flex gap-2">
              <button className={ghostButton} onClick={() => exportCsv(`cari-${statement.counterparty.name}.csv`, ['Tarih', 'Tür', 'Açıklama', 'Borç', 'Alacak', 'Bakiye'], statement.ledger.rows.map((r: any) => [fmt(r.date), r.type, r.description, r.debit_cents / 100, r.credit_cents / 100, r.balance_cents / 100]))}>⬇ CSV</button>
              <button className={ghostButton} onClick={() => setStatement(null)}>Kapat</button>
            </div>
          </div>
          <h3 className="text-xs font-bold text-gray-500">Borç / alacak defteri (TL) · alacak: kurumun borcu artar, borç: azalır</h3>
          <Table><THead><Tr><Th>Tarih</Th><Th>Tür</Th><Th>Açıklama</Th><Th className="text-right">Borç</Th><Th className="text-right">Alacak</Th><Th className="text-right">Bakiye</Th></Tr></THead>
            <TBody>{statement.ledger.rows.map((r: any, i: number) => (
              <Tr key={i} className="border-t"><Td>{fmt(r.date)}</Td><Td>{r.type}</Td><Td>{r.description || '—'}</Td>
                <Td className="text-right">{r.debit_cents ? formatMoney(r.debit_cents) : ''}</Td><Td className="text-right">{r.credit_cents ? formatMoney(r.credit_cents) : ''}</Td>
                <Td className="text-right font-semibold">{formatMoney(r.balance_cents)}</Td></Tr>
            ))}{!statement.ledger.rows.length && <Tr><Td colSpan={6} className="text-center text-gray-400">Hareket yok</Td></Tr>}</TBody></Table>
          <h3 className="text-xs font-bold text-gray-500">Giderler</h3>
          <Table><TBody>{statement.expenses.map((e: ExpenseRow) => (
            <Tr key={e.id} className="border-t"><Td>{fmt(e.expense_date)}</Td><Td>{e.card_name}</Td><Td>{e.document_no || '—'}</Td><Td className="text-right">{formatMoney(e.amount_cents, e.currency)}</Td><Td>{e.account_name || 'Ödenmedi'}</Td></Tr>
          ))}</TBody></Table>
          <h3 className="text-xs font-bold text-gray-500">Hesap hareketleri</h3>
          <Table><TBody>{statement.movements.map((m: any) => (
            <Tr key={m.id} className="border-t"><Td>{fmt(m.entry_date)}</Td><Td>{m.account}</Td><Td>{m.category}</Td><Td className={`text-right ${m.direction === 'in' ? 'text-green-700' : 'text-red-700'}`}>{m.direction === 'in' ? '+' : '−'}{formatMoney(m.amount_cents, m.currency)}</Td></Tr>
          ))}</TBody></Table>
          {statement.cheques.length > 0 && <><h3 className="text-xs font-bold text-gray-500">Çek / senet</h3>
            <Table><TBody>{statement.cheques.map((c: ChequeRow) => (
              <Tr key={c.id} className="border-t"><Td>{c.direction_label} {c.kind_label} {c.number}</Td><Td>{fmt(c.due_date)}</Td><Td>{c.status_label}</Td><Td className="text-right">{formatMoney(c.amount_cents, c.currency)}</Td></Tr>
            ))}</TBody></Table></>}
        </Card>
      )}
    </div>
  )
}

const NEXT: Record<string, Record<string, [string, string][]>> = {
  received: { portfolio: [['deposited', 'Bankaya ver'], ['collected', 'Tahsil et'], ['endorsed', 'Ciro et'], ['bounced', 'Karşılıksız'], ['cancelled', 'İptal']], deposited: [['collected', 'Tahsil edildi'], ['bounced', 'Karşılıksız'], ['portfolio', 'Portföye geri al']], collected: [['bounced', 'Karşılıksız']], endorsed: [['bounced', 'Karşılıksız']] },
  issued: { portfolio: [['paid', 'Ödendi'], ['cancelled', 'İptal']], paid: [['bounced', 'Karşılıksız']] },
}

function Cheques({ accounts, parties, canEdit, onMessage, reloadAccounts }: Shared) {
  const [rows, setRows] = useState<ChequeRow[]>([])
  const [filters, setFilters] = useState({ direction: '', status: 'open' })
  const empty = { kind: 'cheque', direction: 'received', number: '', bank_name: '', drawer: '', counterparty_id: '', amount: '', currency: 'TRY', issue_date: '', due_date: '', note: '' }
  const [form, setForm] = useState<typeof empty | null>(null)
  const load = () => accGet<ChequeRow[]>('/cheques', { direction: filters.direction || undefined, status: filters.status || undefined }).then((r) => setRows(r.data)).catch((err) => onMessage({ type: 'error', text: apiErrorMessage(err) }))
  useEffect(() => { load() }, [filters]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    try {
      await accSend('post', '/cheques', { ...form, amount_cents: cents(form.amount), counterparty_id: form.counterparty_id || null, issue_date: form.issue_date || null, bank_name: form.bank_name || null, drawer: form.drawer || null, note: form.note || null })
      setForm(null); onMessage({ type: 'ok', text: 'Çek / senet kaydedildi' }); load()
    } catch (err) { onMessage({ type: 'error', text: apiErrorMessage(err) }) }
  }
  const [actionModal, setActionModal] = useState<{ cheque: ChequeRow; status: string; accountId: string; partyId: string } | null>(null)
  const change = async (c: ChequeRow, status: string) => {
    if (status === 'collected' || status === 'paid' || status === 'deposited') {
      const first = accounts.find((a) => a.currency === c.currency && (status !== 'deposited' || a.kind === 'bank'))?.id || ''
      setActionModal({ cheque: c, status, accountId: first, partyId: '' })
      return
    }
    if (status === 'endorsed') {
      setActionModal({ cheque: c, status, accountId: '', partyId: parties[0]?.id || '' })
      return
    }
    if (status === 'bounced' && !(await confirmDialog('Karşılıksız olarak işaretlensin mi? Tahsil kaydı varsa geri alınır.'))) return
    try { await accSend('post', `/cheques/${c.id}/status`, { status }); load(); reloadAccounts() } catch (err) { onMessage({ type: 'error', text: apiErrorMessage(err) }) }
  }
  const submitAction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!actionModal) return
    const { cheque, status, accountId, partyId } = actionModal
    try {
      await accSend('post', `/cheques/${cheque.id}/status`, {
        status,
        account_id: accountId || undefined,
        counterparty_id: partyId || undefined,
      })
      setActionModal(null)
      onMessage({ type: 'ok', text: 'Çek / senet durumu güncellendi' })
      load(); reloadAccounts()
    } catch (err) { onMessage({ type: 'error', text: apiErrorMessage(err) }) }
  }
  return (
    <div className="space-y-4">
      {canEdit && <button className={primaryButton} onClick={() => setForm({ ...empty })}>+ Çek / senet</button>}
      {form && (
        <Card className="border border-gray-100 p-5 shadow-sm"><form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Label label="Tür"><select className={inputClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="cheque">Çek</option><option value="note">Senet</option></select></Label>
            <Label label="Yön"><select className={inputClass} value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}><option value="received">Alınan (bağış / tahsilat)</option><option value="issued">Verilen (ödeme)</option></select></Label>
            <TextInput label="Seri / no" required value={form.number} onChange={(v) => setForm({ ...form, number: v })} />
            <TextInput label="Banka" value={form.bank_name} onChange={(v) => setForm({ ...form, bank_name: v })} />
            <TextInput label="Keşideci / borçlu" value={form.drawer} onChange={(v) => setForm({ ...form, drawer: v })} />
            <Label label="Cari"><select className={inputClass} value={form.counterparty_id} onChange={(e) => setForm({ ...form, counterparty_id: e.target.value })}><option value="">—</option>{parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Label>
            <TextInput label="Tutar" required inputMode="decimal" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
            <Label label="Para birimi"><select className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Label>
            <TextInput label="Düzenleme tarihi" type="date" value={form.issue_date} onChange={(v) => setForm({ ...form, issue_date: v })} />
            <TextInput label="Vade" required type="date" value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} />
            <div className="sm:col-span-2"><TextInput label="Not" value={form.note} onChange={(v) => setForm({ ...form, note: v })} /></div>
          </div>
          <div className="flex gap-2"><button className={primaryButton}>Kaydet</button><button type="button" className={ghostButton} onClick={() => setForm(null)}>Vazgeç</button></div>
        </form></Card>
      )}
      <Card className="space-y-3 border border-gray-100 p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <select className={`${inputClass} w-40`} value={filters.direction} onChange={(e) => setFilters({ ...filters, direction: e.target.value })}><option value="">Alınan + verilen</option><option value="received">Alınan</option><option value="issued">Verilen</option></select>
          <select className={`${inputClass} w-44`} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="open">Açık (portföy / bankada)</option><option value="">Tümü</option><option value="collected">Tahsil edildi</option><option value="paid">Ödendi</option><option value="endorsed">Ciro edildi</option><option value="bounced">Karşılıksız</option></select>
          <span className="self-center text-xs text-gray-500">{rows.length} kayıt · {formatMoney(rows.filter((r) => r.currency === 'TRY').reduce((s, r) => s + r.amount_cents, 0))}</span>
          {rows.length > 0 && <button type="button" className={`${ghostButton} ml-auto`} onClick={() => exportCsv('cek-senet.csv', ['Yön', 'Tür', 'No', 'Banka', 'Keşideci/Cari', 'Vade', 'Tutar', 'Para Birimi', 'Durum'], rows.map((r) => [r.direction_label, r.kind_label, r.number, r.bank_name || '', r.drawer || r.counterparty || '', fmt(r.due_date), r.amount_cents / 100, r.currency, r.status_label]))}>⬇ CSV</button>}
        </div>
        <Table>
          <THead><Tr><Th>Çek / senet</Th><Th>Keşideci / cari</Th><Th>Vade</Th><Th className="text-right">Tutar</Th><Th>Durum</Th><Th /></Tr></THead>
          <TBody>{rows.map((c) => (
            <Tr key={c.id} className="border-t"><Td className="font-semibold">{c.direction_label} {c.kind_label.toLowerCase()} · {c.number}{c.bank_name ? ` · ${c.bank_name}` : ''}</Td><Td>{c.drawer || c.counterparty || '—'}</Td>
              <Td className={c.overdue ? 'font-bold text-red-700' : ''}>{fmt(c.due_date)}{c.days_to_due !== null ? ` (${c.overdue ? 'geçti' : `${c.days_to_due} gün`})` : ''}</Td>
              <Td className="text-right font-semibold">{formatMoney(c.amount_cents, c.currency)}</Td><Td>{c.status_label}</Td>
              <Td className="whitespace-nowrap text-right">{canEdit && (NEXT[c.direction][c.status] || []).map(([s, l]) => <button key={s} className={`ml-2 font-bold ${s === 'bounced' || s === 'cancelled' ? 'text-red-600' : 'text-primary-700'}`} onClick={() => change(c, s)}>{l}</button>)}</Td></Tr>
          ))}{!rows.length && <Tr><Td colSpan={6} className="text-center text-gray-400">Kayıt yok.</Td></Tr>}</TBody>
        </Table>
      </Card>
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setActionModal(null)}>
          <form onSubmit={submitAction} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-gray-900">
              {actionModal.cheque.kind_label} #{actionModal.cheque.number} — {actionModal.status === 'endorsed' ? 'Cariye Ciro Et' : actionModal.status === 'paid' ? 'Ödeme Hesabı Seç' : 'Tahsilat / Banka Hesabı Seç'}
            </h3>
            <p className="text-xs text-gray-500">Tutar: <b>{formatMoney(actionModal.cheque.amount_cents, actionModal.cheque.currency)}</b></p>
            {actionModal.status === 'endorsed' ? (
              <Label label="Ciro edilen cari">
                <select className={inputClass} required value={actionModal.partyId} onChange={(e) => setActionModal({ ...actionModal, partyId: e.target.value })}>
                  <option value="">Seçin</option>
                  {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Label>
            ) : (
              <AccountSelect
                accounts={actionModal.status === 'deposited' ? accounts.filter((a) => a.kind === 'bank') : accounts}
                currency={actionModal.cheque.currency}
                value={actionModal.accountId}
                onChange={(v) => setActionModal({ ...actionModal, accountId: v })}
                label={actionModal.status === 'paid' ? 'Ödendiği hesap' : 'Tahsil edildiği / verildiği hesap'}
              />
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setActionModal(null)} className={ghostButton}>Vazgeç</button>
              <button type="submit" className={primaryButton}>Onayla</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function Payroll({ accounts, canEdit, onMessage, reloadAccounts }: Shared) {
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [period, setPeriod] = useState(today().slice(0, 7))
  const [sheet, setSheet] = useState<{ items: PayrollRow[]; total_net_cents: number; unpaid_net_cents: number } | null>(null)
  const empty = { full_name: '', title: '', national_id: '', iban: '', phone: '', salary: '', start_date: '', is_active: true, note: '' }
  const [form, setForm] = useState<(typeof empty & { id?: string }) | null>(null)
  const [advance, setAdvance] = useState({ employee_id: '', amount: '', account_id: '' })
  const [payAccount, setPayAccount] = useState('')
  const [edit, setEdit] = useState<Record<string, { overtime: string; bonus: string; deduction: string }>>({})
  const loadEmployees = () => accGet<EmployeeRow[]>('/employees').then((r) => setEmployees(r.data)).catch((err) => onMessage({ type: 'error', text: apiErrorMessage(err) }))
  const loadSheet = () => accGet<typeof sheet>('/payroll', { period }).then((r) => setSheet(r.data)).catch(() => setSheet(null))
  useEffect(() => { loadEmployees() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadSheet() }, [period]) // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); onMessage({ type: 'ok', text: ok }); loadEmployees(); loadSheet(); reloadAccounts() } catch (err) { onMessage({ type: 'error', text: apiErrorMessage(err) }) }
  }
  const saveEmployee = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    const body = { full_name: form.full_name, title: form.title || null, national_id: form.national_id || null, iban: form.iban || null, phone: form.phone || null, monthly_salary_cents: cents(form.salary), start_date: form.start_date || null, is_active: form.is_active, note: form.note || null }
    act(() => (form.id ? accSend('put', `/employees/${form.id}`, body) : accSend('post', '/employees', body)), 'Personel kaydedildi').then(() => setForm(null))
  }
  const draft = sheet?.items.filter((i) => i.status === 'draft') || []
  return (
    <div className="space-y-4">
      {canEdit && <div className="flex flex-wrap gap-2"><button className={primaryButton} onClick={() => setForm({ ...empty })}>+ Personel</button></div>}
      {form && (
        <Card className="border border-gray-100 p-5 shadow-sm"><form onSubmit={saveEmployee} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <TextInput label="Ad soyad" required value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} />
            <TextInput label="Görev" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
            <TextInput label="Net aylık maaş (₺)" required inputMode="decimal" value={form.salary} onChange={(v) => setForm({ ...form, salary: v })} />
            <TextInput label="TC kimlik no" value={form.national_id} onChange={(v) => setForm({ ...form, national_id: v.replace(/\D/g, '') })} maxLength={11} hint={form.id ? 'Boşsa kayıtlı numara korunur' : undefined} />
            <TextInput label="IBAN" value={form.iban} onChange={(v) => setForm({ ...form, iban: v })} />
            <TextInput label="Telefon" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <TextInput label="İşe başlama" type="date" value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v })} />
            <label className="flex items-center gap-2 self-end pb-3 text-xs font-semibold"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Çalışıyor</label>
          </div>
          <div className="flex gap-2"><button className={primaryButton}>Kaydet</button><button type="button" className={ghostButton} onClick={() => setForm(null)}>Vazgeç</button></div>
        </form></Card>
      )}
      <Card className="space-y-3 border border-gray-100 p-5 shadow-sm">
        <h2 className="text-sm font-bold">Personel</h2>
        <Table>
          <THead><Tr><Th>Ad</Th><Th>Görev</Th><Th>IBAN</Th><Th className="text-right">Net maaş</Th><Th className="text-right">Açık avans</Th><Th /></Tr></THead>
          <TBody>{employees.map((e) => (
            <Tr key={e.id} className={`border-t ${e.is_active ? '' : 'text-gray-400'}`}><Td className="font-semibold">{e.full_name}</Td><Td>{e.title || '—'}</Td><Td>{e.iban || '—'}</Td>
              <Td className="text-right">{formatMoney(e.monthly_salary_cents)}</Td><Td className="text-right">{e.open_advance_cents ? formatMoney(e.open_advance_cents) : '—'}</Td>
              <Td className="text-right">{canEdit && <button className="font-bold text-gray-700" onClick={() => setForm({ id: e.id, full_name: e.full_name, title: e.title || '', national_id: '', iban: e.iban || '', phone: '', salary: String(e.monthly_salary_cents / 100), start_date: '', is_active: e.is_active, note: '' })}>Düzenle</button>}</Td></Tr>
          ))}{!employees.length && <Tr><Td colSpan={6} className="text-center text-gray-400">Personel yok.</Td></Tr>}</TBody>
        </Table>
        {canEdit && employees.length > 0 && (
          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            <Label label="Avans ver"><select className={inputClass} value={advance.employee_id} onChange={(e) => setAdvance({ ...advance, employee_id: e.target.value })}><option value="">Personel</option>{employees.filter((e) => e.is_active).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></Label>
            <div className="w-32"><TextInput label="Tutar" inputMode="decimal" value={advance.amount} onChange={(v) => setAdvance({ ...advance, amount: v })} /></div>
            <div className="w-56"><AccountSelect accounts={accounts} currency="TRY" value={advance.account_id} onChange={(v) => setAdvance({ ...advance, account_id: v })} /></div>
            <button className={ghostButton} onClick={() => act(() => accSend('post', '/advances', { employee_id: advance.employee_id, amount_cents: cents(advance.amount), account_id: advance.account_id }), 'Avans verildi; bir sonraki maaştan düşülecek').then(() => setAdvance({ employee_id: '', amount: '', account_id: '' }))}>Avans ver</button>
          </div>
        )}
      </Card>
      <Card className="space-y-3 border border-gray-100 p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40"><TextInput label="Bordro dönemi" type="month" value={period} onChange={setPeriod} /></div>
          {canEdit && <button className={ghostButton} onClick={() => act(() => accSend('post', '/payroll/generate', { period }), 'Bordro açıldı; açık avanslar mahsup edildi')}>Maaşları aç</button>}
          {sheet && <span className="text-xs text-gray-500">Toplam net {formatMoney(sheet.total_net_cents)} · ödenmemiş {formatMoney(sheet.unpaid_net_cents)}</span>}
          {sheet && sheet.items.length > 0 && <button className={`${ghostButton} ml-auto`} onClick={() => exportCsv(`bordro-${period}.csv`, ['Ad', 'IBAN', 'Maaş', 'Mesai', 'Prim', 'Kesinti', 'Avans', 'Net', 'Durum'], sheet.items.map((i) => [i.full_name, i.iban, i.salary_cents / 100, i.overtime_cents / 100, i.bonus_cents / 100, i.deduction_cents / 100, i.advance_cents / 100, i.net_cents / 100, i.status === 'paid' ? 'Ödendi' : 'Bekliyor']))}>⬇ CSV (banka talimatı)</button>}
        </div>
        <Table>
          <THead><Tr><Th>Personel</Th><Th className="text-right">Maaş</Th><Th className="text-right">Mesai</Th><Th className="text-right">Prim</Th><Th className="text-right">Kesinti</Th><Th className="text-right">Avans</Th><Th className="text-right">Net</Th><Th>Durum</Th><Th /></Tr></THead>
          <TBody>{sheet?.items.map((i) => {
            const e = edit[i.id]
            return (
              <Tr key={i.id} className="border-t"><Td className="font-semibold">{i.full_name}</Td><Td className="text-right">{formatMoney(i.salary_cents)}</Td>
                {(['overtime', 'bonus', 'deduction'] as const).map((k) => (
                  <Td key={k} className="text-right">{e ? <input className="w-20 rounded border p-1 text-right" value={e[k]} onChange={(ev) => setEdit({ ...edit, [i.id]: { ...e, [k]: ev.target.value } })} /> : formatMoney(i[`${k}_cents`])}</Td>
                ))}
                <Td className="text-right">{formatMoney(i.advance_cents)}</Td><Td className="text-right font-bold">{formatMoney(i.net_cents)}</Td><Td>{i.status === 'paid' ? 'Ödendi' : 'Bekliyor'}</Td>
                <Td className="whitespace-nowrap text-right">{canEdit && i.status === 'draft' && (e
                  ? <button className="font-bold text-primary-700" onClick={() => act(() => accSend('put', `/payroll/${i.id}`, { salary_cents: i.salary_cents, overtime_cents: cents(e.overtime), bonus_cents: cents(e.bonus), deduction_cents: cents(e.deduction) }), 'Bordro güncellendi').then(() => { const n = { ...edit }; delete n[i.id]; setEdit(n) })}>Kaydet</button>
                  : <button className="font-bold text-gray-700" onClick={() => setEdit({ ...edit, [i.id]: { overtime: String(i.overtime_cents / 100), bonus: String(i.bonus_cents / 100), deduction: String(i.deduction_cents / 100) } })}>Düzenle</button>)}</Td></Tr>
            )
          })}{!sheet?.items.length && <Tr><Td colSpan={9} className="text-center text-gray-400">Bu dönem bordrosu açılmamış.</Td></Tr>}</TBody>
        </Table>
        {canEdit && draft.length > 0 && (
          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            <div className="w-64"><AccountSelect accounts={accounts} currency="TRY" value={payAccount} onChange={setPayAccount} label="Ödeme hesabı" /></div>
            <button className={primaryButton} disabled={!payAccount} onClick={async () => (await confirmDialog({ title: `${draft.length} personele toplam ${formatMoney(draft.reduce((s, i) => s + i.net_cents, 0))} ödensin mi?`, danger: false })) && act(() => accSend('post', '/payroll/pay', { item_ids: draft.map((i) => i.id), account_id: payAccount }), 'Maaşlar ödendi ve hesaptan düşüldü')}>Bekleyen maaşları öde</button>
          </div>
        )}
      </Card>
    </div>
  )
}

interface ItemRow { id: string; name: string; code: string | null; unit: string; unit_label: string; category: string | null; min_qty: number; unit_value_cents: number; is_active: boolean; qty: number; low: boolean; value_cents: number; by_warehouse: { warehouse_id: string; warehouse: string; qty: number }[] }
interface MoveRow { id: string; move_date: string; item: string; unit: string; warehouse: string; direction: string; qty: number; kind: string; kind_label: string; value_cents: number; party: string | null; invoice_id: string | null; note: string | null }
const qtyText = (v: string) => v.replace(',', '.')

function Stock({ parties, canEdit, onMessage }: Shared) {
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; is_active: boolean }[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [moves, setMoves] = useState<MoveRow[]>([])
  const [inKind, setInKind] = useState<any>(null)
  const [donorQ, setDonorQ] = useState('')
  const [donors, setDonors] = useState<{ id: string; full_name: string; phone: string | null }[]>([])
  const emptyMove = { mode: 'move', item_id: '', warehouse_id: '', to_warehouse_id: '', direction: 'in', kind: 'in_kind', qty: '', donor_id: '', donor_name: '', counterparty_id: '', note: '', unit_value: '' }
  const [move, setMove] = useState<typeof emptyMove | null>(null)
  const [itemForm, setItemForm] = useState<{ id?: string; name: string; code: string; unit: string; category: string; min_qty: string; unit_value: string } | null>(null)
  const [newWarehouse, setNewWarehouse] = useState('')
  const load = () => Promise.all([accGet<typeof warehouses>('/warehouses'), accGet<ItemRow[]>('/stock-items'), accGet<MoveRow[]>('/stock-moves'), accGet('/in-kind-report')])
    .then(([w, i, m, k]) => { setWarehouses(w.data); setItems(i.data); setMoves(m.data.slice(0, 200)); setInKind(k.data) })
    .catch((err) => onMessage({ type: 'error', text: apiErrorMessage(err) }))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (donorQ.trim().length < 2) { setDonors([]); return }
    const t = setTimeout(() => axios.get(`${adminApiBase()}/api/v1/admin-features/donors`, { headers: adminAuthHeaders(), params: { q: donorQ, page_size: 8 } })
      .then((r) => setDonors(r.data.items)).catch(() => {}), 250)
    return () => clearTimeout(t)
  }, [donorQ])
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); onMessage({ type: 'ok', text: ok }); load(); return true } catch (err) { onMessage({ type: 'error', text: apiErrorMessage(err) }); return false }
  }
  const saveMove = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!move) return
    const inbound = ['in_kind', 'purchase'].includes(move.kind) || (move.kind === 'adjust' && move.direction === 'in')
    const ok = move.mode === 'transfer'
      ? await act(() => accSend('post', '/stock-transfers', { item_id: move.item_id, from_warehouse_id: move.warehouse_id, to_warehouse_id: move.to_warehouse_id, qty: qtyText(move.qty), note: move.note || null }), 'Transfer yapıldı')
      : await act(() => accSend('post', '/stock-moves', {
        item_id: move.item_id, warehouse_id: move.warehouse_id, direction: inbound ? 'in' : 'out', kind: move.kind, qty: qtyText(move.qty),
        donor_id: move.donor_id || null, counterparty_id: move.counterparty_id || null, note: move.note || null,
        unit_value_cents: move.unit_value ? cents(move.unit_value) : null,
      }), move.kind === 'in_kind' ? 'Ayni bağış stoğa girdi' : 'Stok hareketi kaydedildi')
    if (ok) { setMove(null); setDonorQ('') }
  }
  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!itemForm) return
    const body = { name: itemForm.name, code: itemForm.code || null, unit: itemForm.unit, category: itemForm.category || null, min_qty: qtyText(itemForm.min_qty || '0'), unit_value_cents: cents(itemForm.unit_value || '0'), is_active: true }
    if (await act(() => (itemForm.id ? accSend('put', `/stock-items/${itemForm.id}`, body) : accSend('post', '/stock-items', body)), 'Stok kartı kaydedildi')) setItemForm(null)
  }
  const activeWh = warehouses.filter((w) => w.is_active)
  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap items-end gap-2">
          <button className={primaryButton} onClick={() => setMove({ ...emptyMove })}>+ Stok hareketi / ayni bağış</button>
          <button className={ghostButton} onClick={() => setMove({ ...emptyMove, mode: 'transfer', kind: 'transfer' })}>⇄ Depo transferi</button>
          <button className={ghostButton} onClick={() => setItemForm({ name: '', code: '', unit: 'adet', category: '', min_qty: '0', unit_value: '' })}>+ Stok kartı</button>
          <div className="ml-auto flex items-end gap-2"><div className="w-44"><TextInput label="Yeni depo" value={newWarehouse} onChange={setNewWarehouse} /></div>
            <button className={ghostButton} onClick={() => newWarehouse.trim() && act(() => accSend('post', '/warehouses', { name: newWarehouse.trim() }), 'Depo eklendi').then(() => setNewWarehouse(''))}>Ekle</button></div>
        </div>
      )}
      {itemForm && (
        <Card className="border border-gray-100 p-5 shadow-sm"><form onSubmit={saveItem} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <TextInput label="Ad" required value={itemForm.name} onChange={(v) => setItemForm({ ...itemForm, name: v })} />
            <TextInput label="Kod" value={itemForm.code} onChange={(v) => setItemForm({ ...itemForm, code: v })} />
            <Label label="Birim"><select className={inputClass} value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}>{['adet', 'kg', 'lt', 'koli', 'paket', 'metre'].map((u) => <option key={u}>{u}</option>)}</select></Label>
            <TextInput label="Kategori" value={itemForm.category} onChange={(v) => setItemForm({ ...itemForm, category: v })} placeholder="Gıda, giyim…" />
            <TextInput label="Kritik seviye" inputMode="decimal" value={itemForm.min_qty} onChange={(v) => setItemForm({ ...itemForm, min_qty: v })} />
            <TextInput label="Tahmini birim değer (₺)" inputMode="decimal" value={itemForm.unit_value} onChange={(v) => setItemForm({ ...itemForm, unit_value: v })} />
          </div>
          <div className="flex gap-2"><button className={primaryButton}>Kaydet</button><button type="button" className={ghostButton} onClick={() => setItemForm(null)}>Vazgeç</button></div>
        </form></Card>
      )}
      {move && (
        <Card className="border border-gray-100 p-5 shadow-sm"><form onSubmit={saveMove} className="space-y-3">
          <h2 className="text-sm font-bold">{move.mode === 'transfer' ? 'Depolar arası transfer' : 'Stok hareketi'}</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            {move.mode !== 'transfer' && (
              <Label label="Hareket türü"><select className={inputClass} value={move.kind} onChange={(e) => setMove({ ...move, kind: e.target.value })}>
                <option value="in_kind">Ayni bağış (giriş)</option><option value="purchase">Alış (giriş)</option><option value="aid_out">Yardım çıkışı</option>
                <option value="use">Kurum içi kullanım (çıkış)</option><option value="adjust">Sayım düzeltmesi</option>
              </select></Label>
            )}
            {move.kind === 'adjust' && <Label label="Yön"><select className={inputClass} value={move.direction} onChange={(e) => setMove({ ...move, direction: e.target.value })}><option value="in">Fazla (giriş)</option><option value="out">Eksik (çıkış)</option></select></Label>}
            <Label label="Stok kartı"><select required className={inputClass} value={move.item_id} onChange={(e) => setMove({ ...move, item_id: e.target.value })}><option value="">Seçin</option>{items.filter((i) => i.is_active).map((i) => <option key={i.id} value={i.id}>{i.name} ({i.qty} {i.unit})</option>)}</select></Label>
            <Label label={move.mode === 'transfer' ? 'Çıkan depo' : 'Depo'}><select required className={inputClass} value={move.warehouse_id} onChange={(e) => setMove({ ...move, warehouse_id: e.target.value })}><option value="">Seçin</option>{activeWh.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Label>
            {move.mode === 'transfer' && <Label label="Giren depo"><select required className={inputClass} value={move.to_warehouse_id} onChange={(e) => setMove({ ...move, to_warehouse_id: e.target.value })}><option value="">Seçin</option>{activeWh.filter((w) => w.id !== move.warehouse_id).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Label>}
            <TextInput label="Miktar" required inputMode="decimal" value={move.qty} onChange={(v) => setMove({ ...move, qty: v })} />
            {move.kind === 'in_kind' && (
              <div className="relative">
                <TextInput label="Bağışçı" value={move.donor_name || donorQ} onChange={(v) => { setDonorQ(v); setMove({ ...move, donor_id: '', donor_name: '' }) }} placeholder="Ad veya telefon ile ara" />
                {donors.length > 0 && !move.donor_id && (
                  <ul className="absolute z-10 mt-1 w-full rounded-lg border bg-white shadow">{donors.map((d) => (
                    <li key={d.id}><button type="button" className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50" onClick={() => { setMove({ ...move, donor_id: d.id, donor_name: d.full_name }); setDonors([]) }}>{d.full_name} <span className="text-gray-400">{d.phone}</span></button></li>
                  ))}</ul>
                )}
              </div>
            )}
            {move.kind === 'purchase' && <Label label="Tedarikçi"><select className={inputClass} value={move.counterparty_id} onChange={(e) => setMove({ ...move, counterparty_id: e.target.value })}><option value="">—</option>{parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Label>}
            {['in_kind', 'purchase'].includes(move.kind) && <TextInput label="Birim değer (₺)" inputMode="decimal" value={move.unit_value} onChange={(v) => setMove({ ...move, unit_value: v })} hint="Boşsa stok kartındaki tahmini değer" />}
            <div className="sm:col-span-2"><TextInput label="Not" value={move.note} onChange={(v) => setMove({ ...move, note: v })} /></div>
          </div>
          <div className="flex gap-2"><button className={primaryButton} disabled={move.kind === 'in_kind' && !move.donor_id}>Kaydet</button><button type="button" className={ghostButton} onClick={() => setMove(null)}>Vazgeç</button></div>
        </form></Card>
      )}
      <Card className="border border-gray-100 p-5 shadow-sm">
        <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-bold">Stok durumu</h2>
          <button className={ghostButton} onClick={() => exportCsv('stok.csv', ['Kart', 'Kategori', 'Birim', 'Miktar', 'Kritik', 'Tahmini değer'], items.map((i) => [i.name, i.category, i.unit, i.qty, i.min_qty, i.value_cents / 100]))}>⬇ CSV</button></div>
        <Table>
          <THead><Tr><Th>Kart</Th><Th>Kategori</Th><Th>Depolar</Th><Th className="text-right">Miktar</Th><Th className="text-right">Tahmini değer</Th><Th /></Tr></THead>
          <TBody>{items.map((i) => (
            <Tr key={i.id} className="border-t"><Td className="font-semibold">{i.name}</Td><Td>{i.category || '—'}</Td>
              <Td>{i.by_warehouse.map((w) => `${w.warehouse}: ${w.qty}`).join(' · ') || '—'}</Td>
              <Td className={`text-right font-bold ${i.low ? 'text-red-700' : ''}`}>{i.qty} {i.unit}{i.low ? ' ⚠' : ''}</Td>
              <Td className="text-right">{i.value_cents ? formatMoney(i.value_cents) : '—'}</Td>
              <Td className="text-right">{canEdit && <button className="font-bold text-gray-700" onClick={() => setItemForm({ id: i.id, name: i.name, code: i.code || '', unit: i.unit, category: i.category || '', min_qty: String(i.min_qty), unit_value: String(i.unit_value_cents / 100) })}>Düzenle</button>}</Td></Tr>
          ))}{!items.length && <Tr><Td colSpan={6} className="text-center text-gray-400">Stok kartı yok. Önce depo ve stok kartı ekleyin.</Td></Tr>}</TBody>
        </Table>
      </Card>
      {inKind && inKind.by_item.length > 0 && (
        <Card className="border border-gray-100 p-5 shadow-sm">
          <h2 className="mb-2 text-sm font-bold">Ayni bağışlar ({new Date(inKind.start).getFullYear()}) · tahmini {formatMoney(inKind.total_value_cents)}</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <Table><TBody>{inKind.by_item.map((r: any) => <Tr key={r.item} className="border-t"><Td>{r.item}</Td><Td>{r.qty} {r.unit}</Td><Td className="text-right">{formatMoney(r.value_cents)}</Td></Tr>)}</TBody></Table>
            <Table><TBody>{inKind.by_donor.map((r: any) => <Tr key={r.donor_id} className="border-t"><Td>{r.donor}</Td><Td>{r.count} kalem</Td><Td className="text-right">{formatMoney(r.value_cents)}</Td></Tr>)}</TBody></Table>
          </div>
        </Card>
      )}
      <Card className="border border-gray-100 p-5 shadow-sm">
        <h2 className="mb-2 text-sm font-bold">Son hareketler</h2>
        <Table>
          <THead><Tr><Th>Tarih</Th><Th>Tür</Th><Th>Kart</Th><Th>Depo</Th><Th className="text-right">Miktar</Th><Th>Kimden / kime</Th><Th>Not</Th><Th /></Tr></THead>
          <TBody>{moves.map((m) => (
            <Tr key={m.id} className="border-t"><Td>{fmt(m.move_date)}</Td><Td>{m.kind_label}</Td><Td>{m.item}</Td><Td>{m.warehouse}</Td>
              <Td className={`text-right font-semibold ${m.direction === 'in' ? 'text-green-700' : 'text-red-700'}`}>{m.direction === 'in' ? '+' : '−'}{m.qty} {m.unit}</Td>
              <Td>{m.party || '—'}</Td><Td>{m.note || '—'}</Td>
              <Td className="text-right">{canEdit && !m.invoice_id && <button className="font-bold text-red-600" onClick={async () => (await confirmDialog('Hareket silinsin mi?')) && act(() => accSend('delete', `/stock-moves/${m.id}`), 'Hareket silindi')}>Sil</button>}</Td></Tr>
          ))}{!moves.length && <Tr><Td colSpan={8} className="text-center text-gray-400">Hareket yok.</Td></Tr>}</TBody>
        </Table>
      </Card>
    </div>
  )
}

interface InvoiceRow { id: string; kind: string; kind_label: string; number: string; counterparty: string; issue_date: string; due_date: string | null; currency: string; total_cents: number; paid_cents: number; remaining_cents: number; status: string; payment_status: string; overdue: boolean }
const PAY_STATUS: Record<string, [string, string]> = { paid: ['Ödendi', 'text-green-700'], partial: ['Kısmi', 'text-amber-700'], unpaid: ['Açık', 'text-gray-700'], cancelled: ['İptal', 'text-gray-400'] }

function Invoices({ accounts, parties, canEdit, onMessage, reloadAccounts }: Shared) {
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [filters, setFilters] = useState({ kind: '', unpaid: false })
  const [items, setItems] = useState<{ id: string; name: string; unit: string }[]>([])
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([])
  const emptyLine = { description: '', item_id: '', qty: '1', price: '', vat_rate: '20' }
  type Line = typeof emptyLine
  const [form, setForm] = useState<{ kind: string; number: string; counterparty_id: string; issue_date: string; due_date: string; currency: string; warehouse_id: string; note: string; lines: Line[] } | null>(null)
  const load = () => accGet<InvoiceRow[]>('/invoices', { kind: filters.kind || undefined, unpaid: filters.unpaid || undefined }).then((r) => setRows(r.data)).catch((err) => onMessage({ type: 'error', text: apiErrorMessage(err) }))
  useEffect(() => { load() }, [filters]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    accGet<any[]>('/stock-items').then((r) => setItems(r.data.filter((i) => i.is_active))).catch(() => {})
    accGet<any[]>('/warehouses').then((r) => setWarehouses(r.data.filter((w) => w.is_active))).catch(() => {})
  }, [])
  const lineTotal = (l: Line) => Math.round(Number(qtyText(l.qty) || 0) * cents(l.price))
  const totals = (form?.lines || []).reduce((t, l) => { const n = lineTotal(l); return { net: t.net + n, vat: t.vat + Math.round((n * Number(l.vat_rate)) / 100) } }, { net: 0, vat: 0 })
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    try {
      await accSend('post', '/invoices', {
        kind: form.kind, number: form.number, counterparty_id: form.counterparty_id, issue_date: form.issue_date || null, due_date: form.due_date || null,
        currency: form.currency, warehouse_id: form.warehouse_id || null, note: form.note || null,
        lines: form.lines.filter((l) => l.description || l.item_id).map((l) => ({
          description: l.description || items.find((i) => i.id === l.item_id)?.name, item_id: l.item_id || null,
          qty: qtyText(l.qty), unit_price_cents: cents(l.price), vat_rate: Number(l.vat_rate),
        })),
      })
      setForm(null); onMessage({ type: 'ok', text: 'Fatura kaydedildi' }); load()
    } catch (err) { onMessage({ type: 'error', text: apiErrorMessage(err) }) }
  }
  const [payInv, setPayInv] = useState<{ row: InvoiceRow; accountId: string; amount: string } | null>(null)
  const pay = (r: InvoiceRow) => {
    const first = accounts.find((a) => a.currency === r.currency)?.id || ''
    setPayInv({ row: r, accountId: first, amount: String(r.remaining_cents / 100) })
  }
  const submitPayInv = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payInv || !payInv.accountId) return
    try {
      await accSend('post', `/invoices/${payInv.row.id}/pay`, {
        account_id: payInv.accountId,
        amount_cents: payInv.amount.trim() ? cents(payInv.amount) : null,
      })
      setPayInv(null)
      onMessage({ type: 'ok', text: 'Fatura ödemesi kaydedildi' })
      load(); reloadAccounts()
    } catch (err) { onMessage({ type: 'error', text: apiErrorMessage(err) }) }
  }
  const setLine = (i: number, patch: Partial<Line>) => form && setForm({ ...form, lines: form.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  return (
    <div className="space-y-4">
      {canEdit && <button className={primaryButton} onClick={() => setForm({ kind: 'purchase', number: '', counterparty_id: '', issue_date: '', due_date: '', currency: 'TRY', warehouse_id: '', note: '', lines: [{ ...emptyLine }] })}>+ Fatura</button>}
      {form && (
        <Card className="border border-gray-100 p-5 shadow-sm"><form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Label label="Tür"><select className={inputClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="purchase">Alış faturası</option><option value="sales">Satış faturası</option></select></Label>
            <TextInput label="Fatura no" required value={form.number} onChange={(v) => setForm({ ...form, number: v })} />
            <Label label="Cari"><select required className={inputClass} value={form.counterparty_id} onChange={(e) => setForm({ ...form, counterparty_id: e.target.value })}><option value="">Seçin</option>{parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Label>
            <Label label="Para birimi"><select className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Label>
            <TextInput label="Fatura tarihi" type="date" max={today()} value={form.issue_date} onChange={(v) => setForm({ ...form, issue_date: v })} />
            <TextInput label="Vade" type="date" value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} />
            <Label label="Depo (stoklu satırlar için)"><select className={inputClass} value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}><option value="">—</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Label>
            <TextInput label="Not" value={form.note} onChange={(v) => setForm({ ...form, note: v })} />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <THead><Tr><Th>Stok kartı</Th><Th>Açıklama</Th><Th>Miktar</Th><Th>Birim fiyat</Th><Th>KDV %</Th><Th className="text-right">Tutar</Th><Th /></Tr></THead>
              <TBody>{form.lines.map((l, i) => (
                <Tr key={i} className="border-t">
                  <Td><select className="w-40 rounded border p-1" value={l.item_id} onChange={(e) => setLine(i, { item_id: e.target.value })}><option value="">Stoksuz</option>{items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}</select></Td>
                  <Td><input className="w-full rounded border p-1" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder={l.item_id ? 'kart adı' : 'Hizmet / ürün'} /></Td>
                  <Td><input className="w-16 rounded border p-1" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} /></Td>
                  <Td><input className="w-24 rounded border p-1" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} /></Td>
                  <Td><select className="rounded border p-1" value={l.vat_rate} onChange={(e) => setLine(i, { vat_rate: e.target.value })}>{[0, 1, 8, 10, 18, 20].map((v) => <option key={v}>{v}</option>)}</select></Td>
                  <Td className="text-right">{formatMoney(lineTotal(l), form.currency)}</Td>
                  <Td className="text-right">{form.lines.length > 1 && <button type="button" className="font-bold text-red-600" onClick={() => setForm({ ...form, lines: form.lines.filter((_, j) => j !== i) })}>×</button>}</Td>
                </Tr>
              ))}</TBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className={ghostButton} onClick={() => setForm({ ...form, lines: [...form.lines, { ...emptyLine }] })}>+ Satır</button>
            <p className="text-xs">Ara toplam {formatMoney(totals.net, form.currency)} · KDV {formatMoney(totals.vat, form.currency)} · <b>Toplam {formatMoney(totals.net + totals.vat, form.currency)}</b></p>
          </div>
          <div className="flex gap-2"><button className={primaryButton}>Kaydet</button><button type="button" className={ghostButton} onClick={() => setForm(null)}>Vazgeç</button></div>
        </form></Card>
      )}
      <Card className="space-y-3 border border-gray-100 p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <select className={`${inputClass} w-40`} value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value })}><option value="">Alış + satış</option><option value="purchase">Alış</option><option value="sales">Satış</option></select>
          <label className="flex items-center gap-1.5 text-xs font-semibold"><input type="checkbox" checked={filters.unpaid} onChange={(e) => setFilters({ ...filters, unpaid: e.target.checked })} /> Yalnız ödenmemiş</label>
          {rows.length > 0 && <button type="button" className={`${ghostButton} ml-auto`} onClick={() => exportCsv('faturalar.csv', ['Tarih', 'Tür', 'No', 'Cari', 'Vade', 'Toplam', 'Kalan', 'Para Birimi', 'Durum'], rows.map((r) => [fmt(r.issue_date), r.kind_label, r.number, r.counterparty, fmt(r.due_date), r.total_cents / 100, r.remaining_cents / 100, r.currency, PAY_STATUS[r.payment_status][0]]))}>⬇ CSV</button>}
        </div>
        <Table>
          <THead><Tr><Th>Tarih</Th><Th>Tür</Th><Th>No</Th><Th>Cari</Th><Th>Vade</Th><Th className="text-right">Toplam</Th><Th className="text-right">Kalan</Th><Th>Durum</Th><Th /></Tr></THead>
          <TBody>{rows.map((r) => (
            <Tr key={r.id} className="border-t"><Td>{fmt(r.issue_date)}</Td><Td>{r.kind_label}</Td><Td className="font-semibold">{r.number}</Td><Td>{r.counterparty}</Td>
              <Td className={r.overdue ? 'font-bold text-red-700' : ''}>{fmt(r.due_date)}</Td>
              <Td className="text-right">{formatMoney(r.total_cents, r.currency)}</Td><Td className="text-right font-semibold">{r.remaining_cents ? formatMoney(r.remaining_cents, r.currency) : '—'}</Td>
              <Td className={PAY_STATUS[r.payment_status][1]}>{PAY_STATUS[r.payment_status][0]}</Td>
              <Td className="whitespace-nowrap text-right">{canEdit && r.status === 'open' && <>
                {r.remaining_cents > 0 && <button className="mr-2 font-bold text-primary-700" onClick={() => pay(r)}>{r.kind === 'purchase' ? 'Öde' : 'Tahsil et'}</button>}
                {r.paid_cents === 0 && <button className="font-bold text-red-600" onClick={async () => (await confirmDialog('Fatura iptal edilsin mi? Stok hareketleri geri alınır.')) && accSend('post', `/invoices/${r.id}/cancel`).then(load).catch((err) => onMessage({ type: 'error', text: apiErrorMessage(err) }))}>İptal</button>}
              </>}</Td></Tr>
          ))}{!rows.length && <Tr><Td colSpan={9} className="text-center text-gray-400">Fatura yok.</Td></Tr>}</TBody>
        </Table>
      </Card>
      {payInv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPayInv(null)}>
          <form onSubmit={submitPayInv} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-gray-900">
              Fatura #{payInv.row.number} — {payInv.row.kind === 'purchase' ? 'Ödeme Yap' : 'Tahsilat Al'}
            </h3>
            <p className="text-xs text-gray-500">
              {payInv.row.counterparty} · Kalan: <b>{formatMoney(payInv.row.remaining_cents, payInv.row.currency)}</b>
            </p>
            <AccountSelect
              accounts={accounts}
              currency={payInv.row.currency}
              value={payInv.accountId}
              onChange={(v) => setPayInv({ ...payInv, accountId: v })}
              label={payInv.row.kind === 'purchase' ? 'Ödendiği hesap' : 'Tahsil edildiği hesap'}
            />
            <TextInput
              label={`Tutar (${payInv.row.currency})`}
              inputMode="decimal"
              value={payInv.amount}
              onChange={(v) => setPayInv({ ...payInv, amount: v })}
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPayInv(null)} className={ghostButton}>Vazgeç</button>
              <button type="submit" disabled={!payInv.accountId} className={primaryButton}>Kaydet</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
