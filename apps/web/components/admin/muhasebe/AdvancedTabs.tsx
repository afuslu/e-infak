'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FileText,
  Package,
  Pencil,
  Plus,
  Printer,
  ScrollText,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { api } from '@/lib/axios';
import { GlobalStatCard, formatDateTR, formatMoney } from './OnMuhasebeUI';

const BASE = '/admin-features/acc';
const STOCK_BASE = '/admin-features/acc/stock';
const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'SAR', 'CHF'] as const;
const toCents = (val: string) => Math.round((parseFloat(String(val || '0').replace(',', '.')) || 0) * 100);
const todayISO = () => new Date().toISOString().slice(0, 10);

export interface AdvancedTabsProps {
  activeTab: 'invoices' | 'stock' | 'cheques' | 'payroll';
  tabNavigation: React.ReactNode;
  accounts: any[];
  parties: any[];
  cheques: any[];
  employees: any[];
  payroll: any;
  period: string;
  setPeriod: (p: string) => void;
  warehouses: any[];
  stockItems: any[];
  stockMoves: any[];
  invoices: any[];
  onRefresh: () => Promise<void>;
  flash: (kind: 'ok' | 'err', text: string) => void;
}

export const AdvancedTabs: React.FC<AdvancedTabsProps> = ({
  activeTab,
  tabNavigation,
  accounts,
  parties,
  cheques,
  employees,
  payroll,
  period,
  setPeriod,
  warehouses,
  stockItems,
  stockMoves,
  invoices,
  onRefresh,
  flash,
}) => {
  const activeTryAccounts = accounts.filter((a) => a.is_active && a.currency === 'TRY');

  // Forms
  const [invForm, setInvForm] = useState({
    kind: 'purchase' as 'purchase' | 'sales',
    number: '',
    counterparty_id: '',
    issue_date: todayISO(),
    due_date: '',
    currency: 'TRY',
    warehouse_id: '',
    paid_account_id: '',
    note: '',
  });
  const [invLines, setInvLines] = useState<Array<{ description: string; item_id: string; qty: string; unit_price: string; vat_rate: string }>>([
    { description: '', item_id: '', qty: '1', unit_price: '', vat_rate: '20' },
  ]);
  const [invPayModal, setInvPayModal] = useState<{ invoice: any; account_id: string; amount: string; paid_on: string } | null>(null);
  const [invDetail, setInvDetail] = useState<any | null>(null);

  const [whForm, setWhForm] = useState({ name: '', address: '' });
  const [siForm, setSiForm] = useState({ id: '', name: '', code: '', unit: 'adet', category: '', min_qty: '0', unit_value: '' });
  const [smForm, setSmForm] = useState({
    item_id: '',
    warehouse_id: '',
    to_warehouse_id: '',
    kind: 'in_kind',
    qty: '',
    unit_value: '',
    move_date: todayISO(),
    note: '',
  });

  const [chForm, setChForm] = useState({
    kind: 'cheque' as 'cheque' | 'note',
    direction: 'received' as 'received' | 'issued',
    number: '',
    bank_name: '',
    drawer: '',
    counterparty_id: '',
    amount: '',
    currency: 'TRY',
    issue_date: todayISO(),
    due_date: todayISO(),
    note: '',
  });
  const [chStatusModal, setChStatusModal] = useState<{ cheque: any; status: string; account_id: string; counterparty_id: string; on: string; note: string } | null>(null);

  const [empForm, setEmpForm] = useState({
    id: '',
    full_name: '',
    title: '',
    national_id: '',
    iban: '',
    phone: '',
    salary: '',
    start_date: '',
    is_active: true,
    note: '',
  });
  const [advForm, setAdvForm] = useState({ employee_id: '', amount: '', account_id: '', given_on: todayISO(), note: '' });
  const [payAccountId, setPayAccountId] = useState('');
  const [selectedPayIds, setSelectedPayIds] = useState<string[]>([]);
  const [editPayItem, setEditPayItem] = useState<{ item: any; salary: string; overtime: string; bonus: string; deduction: string; note: string } | null>(null);

  const wrap = async (fn: () => Promise<void>, okText: string) => {
    try {
      await fn();
      flash('ok', okText);
      await onRefresh();
    } catch (err: any) {
      flash('err', err?.response?.data?.detail || 'İşlem başarısız');
    }
  };

  /* ==================== FATURALAR ==================== */
  if (activeTab === 'invoices') {
    const unpaidTotal = invoices
      .filter((i) => i.status === 'open' && i.currency === 'TRY')
      .reduce((s, i) => s + (i.remaining_cents || 0), 0);

    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-600">Fatura Yönetimi</p>
          <h2 className="mt-1 text-lg font-black tracking-tight text-slate-950">Alış & Satış Faturaları Özeti</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <GlobalStatCard
              title="Toplam Fatura"
              value={invoices.length}
              subtitle="Kayıtlı fatura"
              icon={<FileSpreadsheet className="h-5 w-5" />}
              gradient="from-emerald-500 to-teal-600"
            />
            <GlobalStatCard
              title="Açık Fatura Borcu"
              value={formatMoney(unpaidTotal)}
              subtitle="Ödenmeyi bekleyen"
              icon={<Clock className="h-5 w-5" />}
              gradient="from-rose-500 to-red-600"
            />
            <GlobalStatCard
              title="Alış Faturası"
              value={invoices.filter((i) => i.kind === 'purchase').length}
              subtitle="Tedarikçi faturaları"
              icon={<ArrowDownLeft className="h-5 w-5" />}
              gradient="from-blue-500 to-cyan-600"
            />
            <GlobalStatCard
              title="Satış Faturası"
              value={invoices.filter((i) => i.kind === 'sales').length}
              subtitle="Kesilen faturalar"
              icon={<ArrowUpRight className="h-5 w-5" />}
              gradient="from-indigo-500 to-violet-600"
            />
          </div>
        </div>

        {tabNavigation}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            wrap(async () => {
              await api.post(`${STOCK_BASE}/invoices`, {
                ...invForm,
                due_date: invForm.due_date || null,
                warehouse_id: invForm.warehouse_id || null,
                paid_account_id: invForm.paid_account_id || null,
                lines: invLines.map((l) => ({
                  description: l.description,
                  item_id: l.item_id || null,
                  qty: parseFloat(l.qty.replace(',', '.')) || 1,
                  unit_price_cents: toCents(l.unit_price),
                  vat_rate: Number(l.vat_rate),
                })),
              });
              setInvForm({ ...invForm, number: '', note: '', paid_account_id: '' });
              setInvLines([{ description: '', item_id: '', qty: '1', unit_price: '', vat_rate: '20' }]);
            }, 'Fatura kaydedildi');
          }}
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h3 className="text-sm font-black text-slate-900">Yeni Fatura Kaydet</h3>
          <div className="grid gap-3 md:grid-cols-4">
            <select
              value={invForm.kind}
              onChange={(e) => setInvForm({ ...invForm, kind: e.target.value as any })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="purchase">Alış Faturası (Gider/Stok Girişi)</option>
              <option value="sales">Satış Faturası (Gelir/Stok Çıkışı)</option>
            </select>
            <input
              required
              placeholder="Fatura No *"
              value={invForm.number}
              onChange={(e) => setInvForm({ ...invForm, number: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              required
              value={invForm.counterparty_id}
              onChange={(e) => setInvForm({ ...invForm, counterparty_id: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Cari Seçin *</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={invForm.issue_date}
              onChange={(e) => setInvForm({ ...invForm, issue_date: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            {invLines.map((l, idx) => (
              <div key={idx} className="grid gap-2 md:grid-cols-12">
                <input
                  required
                  placeholder="Kalem açıklaması *"
                  value={l.description}
                  onChange={(e) => setInvLines(invLines.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)))}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm md:col-span-5"
                />
                <input
                  required
                  type="number"
                  step="0.001"
                  placeholder="Miktar"
                  value={l.qty}
                  onChange={(e) => setInvLines(invLines.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm md:col-span-2"
                />
                <input
                  required
                  type="number"
                  step="0.01"
                  placeholder="Birim Fiyat"
                  value={l.unit_price}
                  onChange={(e) => setInvLines(invLines.map((x, i) => (i === idx ? { ...x, unit_price: e.target.value } : x)))}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm md:col-span-3"
                />
                <select
                  value={l.vat_rate}
                  onChange={(e) => setInvLines(invLines.map((x, i) => (i === idx ? { ...x, vat_rate: e.target.value } : x)))}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm md:col-span-2"
                >
                  {[0, 1, 10, 20].map((v) => (
                    <option key={v} value={v}>
                      KDV %{v}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={() => setInvLines([...invLines, { description: '', item_id: '', qty: '1', unit_price: '', vat_rate: '20' }])}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" /> Satır Ekle
            </button>
            <div className="flex items-center gap-2">
              <select
                value={invForm.paid_account_id}
                onChange={(e) => setInvForm({ ...invForm, paid_account_id: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
              >
                <option value="">Açık Fatura (Sonra Ödenecek)</option>
                {accounts
                  .filter((a) => a.is_active && a.currency === invForm.currency)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      Peşin Ödendi: {a.name}
                    </option>
                  ))}
              </select>
              <button
                type="submit"
                className="cursor-pointer rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                Faturayı Kaydet
              </button>
            </div>
          </div>
        </form>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3">Tarih</th>
                <th className="px-4 py-3">Tür</th>
                <th className="px-4 py-3">Fatura No</th>
                <th className="px-4 py-3">Cari</th>
                <th className="px-4 py-3 text-right">Toplam</th>
                <th className="px-4 py-3 text-right">Kalan</th>
                <th className="px-4 py-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">{formatDateTR(inv.issue_date)}</td>
                  <td className="px-4 py-3">{inv.kind_label}</td>
                  <td className="px-4 py-3 font-mono font-semibold">{inv.number}</td>
                  <td className="px-4 py-3">{inv.counterparty}</td>
                  <td className="px-4 py-3 text-right font-bold">{formatMoney(inv.total_cents, inv.currency)}</td>
                  <td className="px-4 py-3 text-right font-bold text-rose-600">
                    {formatMoney(inv.remaining_cents, inv.currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => api.get(`${STOCK_BASE}/invoices/${inv.id}`).then((r) => setInvDetail(r.data))}
                      className="cursor-pointer rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Detay
                    </button>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Henüz fatura kaydı yok.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {invDetail ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">
                  {invDetail.kind_label} · {invDetail.number}
                </h3>
                <button type="button" onClick={() => setInvDetail(null)}>
                  <X className="h-5 w-5 text-slate-400" />
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">{invDetail.counterparty}</p>
              <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {(invDetail.lines || []).map((l: any) => (
                  <div key={l.id} className="flex justify-between px-3 py-2 text-xs">
                    <span>
                      {l.description} ({l.qty} adet, KDV %{l.vat_rate})
                    </span>
                    <span className="font-bold">{formatMoney(l.line_total_cents, invDetail.currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  /* ==================== STOK & DEPO ==================== */
  if (activeTab === 'stock') {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-600">Ayni Yardım & Stok</p>
          <h2 className="mt-1 text-lg font-black tracking-tight text-slate-950">Depo ve Stok Özeti</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <GlobalStatCard
              title="Depo Sayısı"
              value={warehouses.length}
              subtitle="Aktif depo"
              icon={<Package className="h-5 w-5" />}
              gradient="from-emerald-500 to-teal-600"
            />
            <GlobalStatCard
              title="Stok Kartı"
              value={stockItems.length}
              subtitle="Tanımlı malzeme"
              icon={<Package className="h-5 w-5" />}
              gradient="from-blue-500 to-cyan-600"
            />
            <GlobalStatCard
              title="Kritik Stok"
              value={stockItems.filter((i) => i.low_stock).length}
              subtitle="Azalan kalem"
              icon={<AlertTriangle className="h-5 w-5" />}
              gradient="from-amber-500 to-orange-600"
            />
            <GlobalStatCard
              title="Stok Hareketi"
              value={stockMoves.length}
              subtitle="Giriş / çıkış"
              icon={<ArrowRightLeft className="h-5 w-5" />}
              gradient="from-indigo-500 to-violet-600"
            />
          </div>
        </div>

        {tabNavigation}

        <div className="grid gap-4 lg:grid-cols-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              wrap(async () => {
                await api.post(`${STOCK_BASE}/warehouses`, whForm);
                setWhForm({ name: '', address: '' });
              }, 'Depo eklendi');
            }}
            className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h3 className="text-sm font-black text-slate-900">Depo Ekle</h3>
            <input
              required
              placeholder="Depo Adı (Örn: Merkez Depo)"
              value={whForm.name}
              onChange={(e) => setWhForm({ ...whForm, name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Adres"
              value={whForm.address}
              onChange={(e) => setWhForm({ ...whForm, address: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button type="submit" className="w-full cursor-pointer rounded-xl bg-slate-900 py-2 text-xs font-bold text-white">
              Depo Kaydet
            </button>
          </form>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              wrap(async () => {
                await api.post(`${STOCK_BASE}/items`, {
                  name: siForm.name,
                  code: siForm.code || null,
                  unit: siForm.unit,
                  category: siForm.category || null,
                  min_qty: parseFloat(siForm.min_qty) || 0,
                  unit_value_cents: toCents(siForm.unit_value),
                });
                setSiForm({ id: '', name: '', code: '', unit: 'adet', category: '', min_qty: '0', unit_value: '' });
              }, 'Stok kartı kaydedildi');
            }}
            className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h3 className="text-sm font-black text-slate-900">Stok Kartı Ekle</h3>
            <input
              required
              placeholder="Malzeme Adı (Örn: Gıda Kolisi)"
              value={siForm.name}
              onChange={(e) => setSiForm({ ...siForm, name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={siForm.unit}
                onChange={(e) => setSiForm({ ...siForm, unit: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {['adet', 'koli', 'kg', 'lt', 'paket'].map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                placeholder="Birim Değer (₺)"
                value={siForm.unit_value}
                onChange={(e) => setSiForm({ ...siForm, unit_value: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button type="submit" className="w-full cursor-pointer rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white">
              Stok Kartı Kaydet
            </button>
          </form>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              wrap(async () => {
                await api.post(`${STOCK_BASE}/moves`, {
                  item_id: smForm.item_id,
                  warehouse_id: smForm.warehouse_id,
                  to_warehouse_id: smForm.kind === 'transfer' ? smForm.to_warehouse_id : null,
                  kind: smForm.kind,
                  qty: parseFloat(smForm.qty.replace(',', '.')),
                  unit_value_cents: toCents(smForm.unit_value),
                  move_date: smForm.move_date,
                  note: smForm.note || null,
                });
                setSmForm({ ...smForm, qty: '', note: '' });
              }, 'Stok hareketi işlendi');
            }}
            className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h3 className="text-sm font-black text-slate-900">Stok Giriş / Çıkış</h3>
            <select
              required
              value={smForm.item_id}
              onChange={(e) => setSmForm({ ...smForm, item_id: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Malzeme Seçin *</option>
              {stockItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.qty} {i.unit})
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select
                required
                value={smForm.warehouse_id}
                onChange={(e) => setSmForm({ ...smForm, warehouse_id: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Depo Seçin *</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <input
                required
                type="number"
                step="0.001"
                placeholder="Miktar *"
                value={smForm.qty}
                onChange={(e) => setSmForm({ ...smForm, qty: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button type="submit" className="w-full cursor-pointer rounded-xl bg-blue-600 py-2 text-xs font-bold text-white">
              Hareketi Kaydet
            </button>
          </form>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3">Malzeme</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3 text-right">Mevcut Miktar</th>
                <th className="px-4 py-3 text-right">Tahmini Değer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {stockItems.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900">{i.name}</td>
                  <td className="px-4 py-3 text-slate-600">{i.category || '-'}</td>
                  <td className="px-4 py-3 text-right font-bold">
                    {i.qty} {i.unit}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-700">{formatMoney(i.total_value_cents)}</td>
                </tr>
              ))}
              {stockItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    Henüz stok kartı yok.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ==================== ÇEK & SENET ==================== */
  if (activeTab === 'cheques') {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-600">Vadeli Kıymetli Evrak</p>
          <h2 className="mt-1 text-lg font-black tracking-tight text-slate-950">Çek & Senet Portföyü</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <GlobalStatCard
              title="Portföydeki Evrak"
              value={cheques.filter((c) => c.status === 'portfolio').length}
              subtitle="Tahsil bekleyen"
              icon={<ScrollText className="h-5 w-5" />}
              gradient="from-emerald-500 to-teal-600"
            />
            <GlobalStatCard
              title="Alınan Çek/Senet"
              value={cheques.filter((c) => c.direction === 'received').length}
              subtitle="Alacak evrakları"
              icon={<ArrowDownLeft className="h-5 w-5" />}
              gradient="from-blue-500 to-cyan-600"
            />
            <GlobalStatCard
              title="Verilen Çek/Senet"
              value={cheques.filter((c) => c.direction === 'issued').length}
              subtitle="Borç evrakları"
              icon={<ArrowUpRight className="h-5 w-5" />}
              gradient="from-rose-500 to-red-600"
            />
            <GlobalStatCard
              title="Vadesi Geçen"
              value={cheques.filter((c) => c.overdue).length}
              subtitle="Takip gerektiren"
              icon={<AlertTriangle className="h-5 w-5" />}
              gradient="from-amber-500 to-orange-600"
            />
          </div>
        </div>

        {tabNavigation}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            wrap(async () => {
              await api.post(`${BASE}/cheques`, {
                ...chForm,
                amount_cents: toCents(chForm.amount),
                counterparty_id: chForm.counterparty_id || null,
              });
              setChForm({ ...chForm, number: '', amount: '', drawer: '', note: '' });
            }, 'Çek / senet kaydedildi');
          }}
          className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-5"
        >
          <select
            value={chForm.direction}
            onChange={(e) => setChForm({ ...chForm, direction: e.target.value as any })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="received">Alınan Çek/Senet</option>
            <option value="issued">Verilen Çek/Senet</option>
          </select>
          <input
            required
            placeholder="Evrak No *"
            value={chForm.number}
            onChange={(e) => setChForm({ ...chForm, number: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            required
            type="number"
            step="0.01"
            placeholder="Tutar *"
            value={chForm.amount}
            onChange={(e) => setChForm({ ...chForm, amount: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            required
            type="date"
            value={chForm.due_date}
            onChange={(e) => setChForm({ ...chForm, due_date: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="cursor-pointer rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white">
            Evrak Ekle
          </button>
        </form>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3">Evrak</th>
                <th className="px-4 py-3">Vade</th>
                <th className="px-4 py-3 text-right">Tutar</th>
                <th className="px-4 py-3">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {cheques.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {c.direction_label} {c.kind_label} · #{c.number}
                  </td>
                  <td className="px-4 py-3">{formatDateTR(c.due_date)}</td>
                  <td className="px-4 py-3 text-right font-bold">{formatMoney(c.amount_cents, c.currency)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                      {c.status_label}
                    </span>
                  </td>
                </tr>
              ))}
              {cheques.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    Kayıtlı çek veya senet yok.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ==================== PERSONEL & MAAŞ ==================== */
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-600">İnsan Kaynakları & Bordro</p>
        <h2 className="mt-1 text-lg font-black tracking-tight text-slate-950">Personel, Maaş ve Avans Yönetimi</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <GlobalStatCard
            title="Aktif Personel"
            value={employees.filter((e) => e.is_active).length}
            subtitle={`${employees.length} toplam kayıt`}
            icon={<UserCheck className="h-5 w-5" />}
            gradient="from-emerald-500 to-teal-600"
          />
          <GlobalStatCard
            title="Dönem Bordro Toplamı"
            value={formatMoney(payroll?.total_net_cents || 0)}
            subtitle={period}
            icon={<FileText className="h-5 w-5" />}
            gradient="from-blue-500 to-cyan-600"
          />
          <GlobalStatCard
            title="Ödenmemiş Maaş"
            value={formatMoney(payroll?.unpaid_net_cents || 0)}
            subtitle="Taslak bordro"
            icon={<Clock className="h-5 w-5" />}
            gradient="from-rose-500 to-red-600"
          />
          <GlobalStatCard
            title="Açık Avanslar"
            value={formatMoney(employees.reduce((s, e) => s + (e.open_advance_cents || 0), 0))}
            subtitle="Maaştan mahsup bekleyen"
            icon={<ArrowUpRight className="h-5 w-5" />}
            gradient="from-amber-500 to-orange-600"
          />
        </div>
      </div>

      {tabNavigation}

      <div className="grid gap-4 lg:grid-cols-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            wrap(async () => {
              await api.post(`${BASE}/employees`, {
                full_name: empForm.full_name,
                title: empForm.title || null,
                iban: empForm.iban || null,
                phone: empForm.phone || null,
                monthly_salary_cents: toCents(empForm.salary),
                is_active: true,
              });
              setEmpForm({ id: '', full_name: '', title: '', national_id: '', iban: '', phone: '', salary: '', start_date: '', is_active: true, note: '' });
            }, 'Personel kaydedildi');
          }}
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h3 className="text-sm font-black text-slate-900">Yeni Personel Ekle</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              required
              placeholder="Ad Soyad *"
              value={empForm.full_name}
              onChange={(e) => setEmpForm({ ...empForm, full_name: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Görev / Unvan"
              value={empForm.title}
              onChange={(e) => setEmpForm({ ...empForm, title: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Aylık Net Maaş (₺)"
              value={empForm.salary}
              onChange={(e) => setEmpForm({ ...empForm, salary: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="IBAN"
              value={empForm.iban}
              onChange={(e) => setEmpForm({ ...empForm, iban: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            />
          </div>
          <button type="submit" className="cursor-pointer rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white">
            Personeli Kaydet
          </button>
        </form>

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-black text-slate-900">Dönem Bordrosu ({period})</h3>
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold"
              />
              <button
                type="button"
                onClick={() => wrap(() => api.post(`${BASE}/payroll/generate`, { period }).then(() => {}), 'Bordro oluşturuldu')}
                className="cursor-pointer rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white"
              >
                Bordro Oluştur
              </button>
            </div>
          </div>

          <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
            {(payroll?.items || []).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between px-3 py-2 text-xs">
                <div>
                  <span className="font-bold text-slate-900">{p.full_name}</span>
                  <span className="ml-2 text-slate-500">{p.status === 'paid' ? 'Ödendi' : 'Taslak'}</span>
                </div>
                <span className="font-black text-emerald-700">{formatMoney(p.net_cents)}</span>
              </div>
            ))}
            {!(payroll?.items || []).length ? (
              <p className="py-6 text-center text-xs text-slate-500">Bu dönem için henüz bordro oluşturulmadı.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
