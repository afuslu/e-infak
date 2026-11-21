'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, CreditCard, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { adminGet, apiErrorMessage } from '@/lib/admin-access';
import { GlobalStatCard, ResponsiveDataToolbar, formatMoney } from './OnMuhasebeUI';

interface PosRow {
  id: string;
  receipt_number: string;
  campaign_title?: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  source?: string | null;
  paid_at: string;
  donor_id: string;
  donor_name: string;
  is_anonymous?: boolean;
  on_behalf_of?: string | null;
}

interface PosResult {
  total: number;
  totals: { currency: string; count: number; total_cents: number }[];
  items: PosRow[];
}

const PAGE_SIZE = 50;

const PROVIDER_LABELS: Record<string, string> = {
  ziraatpay: 'Ziraat Pay',
  ziraat_pay: 'Ziraat Pay',
  iyzico: 'iyzico',
  nestpay: 'NestPay',
  paytr: 'PayTR',
  vakifkatilim: 'Vakıf Katılım',
  vakif_katilim: 'Vakıf Katılım',
  param: 'Param',
  sipay: 'Sipay',
  moka: 'Moka',
  paynet: 'Paynet',
};

const providerLabel = (p?: string | null) => (p ? PROVIDER_LABELS[p.toLowerCase()] || p : 'Sanal POS');

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: 'Tahsil edildi', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pending: { label: 'Bekliyor', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  failed: { label: 'Başarısız', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  refunded: { label: 'İade', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  cancelled: { label: 'İptal', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const formatDateTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const totalsLabel = (totals: PosResult['totals']) =>
  totals.length ? totals.map((t) => formatMoney(t.total_cents, t.currency)).join(' · ') : formatMoney(0);

/** Sanal POS'tan (kartla online) gelen tahsilatlar: bağış kaydı otomatik oluştuğu için eşleştirme gerektirmez. */
export const SanalPosHareketleri: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<'confirmed' | 'refunded' | 'failed' | ''>('confirmed');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PosResult>({ total: 0, totals: [], items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => setPage(1), [statusFilter, debouncedQ, start, end]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, unknown> = {
        payment_method: 'credit_card',
        issued_by: 'pos',
        page,
        page_size: PAGE_SIZE,
      };
      if (statusFilter) params.status = statusFilter;
      if (debouncedQ) params.q = debouncedQ;
      if (start) params.start = start;
      if (end) params.end = end;
      const res = await adminGet<PosResult>('/donations', params);
      setData({ total: res.data.total || 0, totals: res.data.totals || [], items: res.data.items || [] });
    } catch (e) {
      setError(apiErrorMessage(e, 'Sanal POS tahsilatları yüklenemedi'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, debouncedQ, start, end, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <GlobalStatCard
          id="pos_adet"
          title="Kartlı Tahsilat"
          value={data.total}
          subtitle={statusFilter ? STATUS[statusFilter]?.label : 'Tüm durumlar'}
          icon={<CreditCard className="h-5 w-5" />}
          gradient="from-emerald-500 to-teal-600"
        />
        <GlobalStatCard
          id="pos_tutar"
          title="Toplam Tutar"
          value={totalsLabel(data.totals)}
          subtitle="Brüt (POS komisyonu düşülmeden)"
          icon={<CheckCircle2 className="h-5 w-5" />}
          gradient="from-indigo-500 to-violet-600"
        />
      </div>

      <p className="rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs text-blue-900">
        Kartla yapılan bağışlar ödeme anında bağışçıya ve makbuza otomatik bağlanır, eşleştirme gerekmez. Banka,
        bu tahsilatları komisyon düşülmüş toplu tutar olarak birkaç gün sonra hesabınıza aktarır; o toplu giriş
        &ldquo;Gelen Havaleler&rdquo; listesinde görünürse bağış olarak onaylamayın, &ldquo;Yok Say&rdquo; ile geçin.
      </p>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <ResponsiveDataToolbar
          search={{ value: q, onChange: setQ, placeholder: 'Bağışçı adı, telefon veya makbuz no ara…' }}
          extraActions={
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                title="Başlangıç tarihi"
              />
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                title="Bitiş tarihi"
              />
              <button
                type="button"
                onClick={load}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Yenile
              </button>
            </div>
          }
        />
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['confirmed', 'Tahsil Edilenler'],
              ['refunded', 'İadeler'],
              ['failed', 'Başarısız'],
              ['', 'Tümü'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key || 'all'}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                statusFilter === key ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {error ? (
          <div className="flex items-center gap-2 p-6 text-sm text-rose-700">
            <XCircle className="h-4 w-4" /> {error}
          </div>
        ) : loading && !data.items.length ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
          </div>
        ) : !data.items.length ? (
          <div className="p-10 text-center text-sm text-slate-500">Bu filtrede sanal POS tahsilatı yok.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Tarih</th>
                  <th className="px-4 py-3">Bağışçı</th>
                  <th className="px-4 py-3">Bağış</th>
                  <th className="px-4 py-3">Sağlayıcı</th>
                  <th className="px-4 py-3 text-right">Tutar</th>
                  <th className="px-4 py-3">Durum</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((d) => {
                  const st = STATUS[d.status] || { label: d.status, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
                  return (
                    <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{formatDateTime(d.paid_at)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/bagiscilar/${d.donor_id}`} className="font-semibold text-slate-900 hover:text-emerald-700">
                          {d.donor_name}
                        </Link>
                        {d.on_behalf_of ? <p className="text-xs text-slate-500">{d.on_behalf_of} adına</p> : null}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-800">{d.campaign_title || 'Genel'}</p>
                        <p className="font-mono text-xs text-slate-500">{d.receipt_number}</p>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700">{providerLabel(d.source)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-slate-900">
                        {formatMoney(d.amount_cents, d.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-200 p-3 text-xs">
            <span className="text-slate-500">
              Sayfa {page} / {totalPages} · {data.total} kayıt
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => p - 1)}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Önceki
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Sonraki
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
