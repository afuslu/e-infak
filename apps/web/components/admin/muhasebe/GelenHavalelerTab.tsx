'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  Check,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  HeartHandshake,
  HelpCircle,
  Layers,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/axios';
import { whatsappUrl } from '@/lib/admin-access';
import { WhatsAppIcon } from '@/components/admin/ui';
import { GlobalStatCard, MuhasebeStatModal, type MuhasebeStatModalProps, ResponsiveDataToolbar, formatMoney } from './OnMuhasebeUI';
import { BankReconciliationPanel } from '@/components/admin/BankReconciliationPanel';

interface Candidate {
  id: string;
  name: string;
  phone?: string;
}

interface DonorHit extends Candidate {
  confidence: number;
  reason: string;
  candidates?: Candidate[];
}

interface CampaignHit {
  id: string;
  title: string;
  category: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

interface Suggestion {
  sender?: string;
  sender_phone?: string;
  donor?: DonorHit | null;
  campaign?: CampaignHit | null;
  kurban_type?: string | null;
  on_behalf_of?: string | null;
  note?: string;
  ignored?: string;
}

interface MatchedPart {
  id: string;
  receipt_number: string;
  official_receipt_no?: string | null;
  donor_name?: string | null;
  campaign_title?: string | null;
  amount_cents: number;
  currency: string;
}

interface Transfer {
  id: string;
  bank_account_id?: string | null;
  source: string;
  external_id: string;
  booked_at: string;
  amount_cents: number;
  currency: string;
  sender_name?: string | null;
  description?: string | null;
  status: 'unmatched' | 'ambiguous' | 'matched' | 'ignored';
  donation_id?: string | null;
  possible_duplicate?: boolean;
  suggestion: Suggestion;
  matched?: {
    parts: MatchedPart[];
    official_receipt_no?: string | null;
    receipt_number: string;
    donor_name?: string | null;
  } | null;
}

interface CampaignOption {
  id: string;
  title: string;
  category: string;
  price_per_share_cents?: number | null;
}

interface BankAccountOption {
  id: string;
  label: string;
  bank: string;
  iban?: string | null;
}

interface ReceiptBookOption {
  id: string;
  series: string;
  next_no: number;
  end_no: number;
  remaining: number;
}

interface SplitLine {
  campaign_id: string;
  amount: string;
  on_behalf_of: string;
  kurban_type: string;
  /** Kurban kalemi: hisse başına hissedar adı, her satıra bir ad. */
  kurban_names: string;
}

const KURBAN_LABELS: Record<string, string> = {
  vacip: 'Vacip',
  adak: 'Adak',
  akika: 'Akika',
  sukur: 'Şükür',
  nafile: 'Nafile',
  sadaka: 'Sadaka',
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

const isKurban = (c?: CampaignOption) => c && ['kurban', 'adak', 'akika'].includes(c.category);

const defaultSms = (donorName: string, amountCents: number, currency: string, items: string, receiptNo?: string) => {
  const name = donorName.trim() || 'Hayırseverimiz';
  const amount = formatMoney(amountCents, currency);
  const receipt = receiptNo ? ` Makbuz No: ${receiptNo}.` : '';
  return `Sayın ${name}, ${items || 'bağış'} için gönderdiğiniz ${amount} tutarındaki havale bağışınız tarafımıza ulaşmıştır.${receipt} Allah kabul etsin.`;
};

export interface GelenHavalelerTabProps {
  tabNavigation: React.ReactNode;
  onDataChanged?: () => void;
  onUnmatchedCountChange?: (count: number) => void;
}

export const GelenHavalelerTab: React.FC<GelenHavalelerTabProps> = ({
  tabNavigation,
  onDataChanged,
  onUnmatchedCountChange,
}) => {
  const [viewMode, setViewMode] = useState<'havaleler' | 'mutabakat'>('havaleler');
  const [statusTab, setStatusTab] = useState<'unmatched' | 'ambiguous' | 'matched' | 'ignored' | 'duplicates'>('unmatched');
  const [items, setItems] = useState<Transfer[]>([]);
  const [total, setTotal] = useState(0);
  const [statModal, setStatModal] = useState<Omit<MuhasebeStatModalProps, 'isOpen' | 'onClose'> | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState(0);
  const [q, setQ] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [accounts, setAccounts] = useState<BankAccountOption[]>([]);
  const [books, setBooks] = useState<ReceiptBookOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [active, setActive] = useState<Transfer | null>(null);
  const [unmatchTarget, setUnmatchTarget] = useState<Transfer | null>(null);
  const [unmatchReason, setUnmatchReason] = useState('Hatalı eşleştirme');
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number | boolean> =
        statusTab === 'duplicates' ? { duplicates: true, limit: 200 } : { status: statusTab, limit: 200 };
      if (q.trim()) params.q = q.trim();
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (amountMin !== '') params.amount_min = amountMin;
      if (amountMax !== '') params.amount_max = amountMax;
      if (accountFilter) params.account_id = accountFilter;
      const res = await api.get('/admin/incoming-transfers', { params });
      setItems(res.data.items || []);
      const tot = res.data.total || 0;
      setTotal(tot);
      setDuplicateGroups(res.data.duplicate_groups || 0);
      setSelectedIds(new Set());
      if (statusTab === 'unmatched' && !q.trim() && !dateFrom && !dateTo && onUnmatchedCountChange) {
        onUnmatchedCountChange(tot);
      }
    } catch (e: any) {
      flash('err', e?.response?.data?.detail || 'Havaleler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [statusTab, q, dateFrom, dateTo, amountMin, amountMax, accountFilter, onUnmatchedCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get('/campaigns', { params: { page_size: 100 } })
      .then((res) => {
        const list = res.data.items || res.data || [];
        setCampaigns(
          list.map((c: any) => ({
            id: c.id,
            title: c.title,
            category: c.category,
            price_per_share_cents: c.price_per_share_cents,
          })),
        );
      })
      .catch(() => {});
    api
      .get('/admin/bank-accounts')
      .then((res) => setAccounts(res.data || []))
      .catch(() => {});
    api
      .get('/admin-features/receipt-books')
      .then((res) => setBooks((res.data || []).filter((b: any) => b.status === 'active' && b.remaining > 0)))
      .catch(() => {});
  }, []);

  const uploadStatement = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      if (accountFilter) form.append('bank_account_id', accountFilter);
      const res = await api.post('/admin/reconciliation/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const d = res.data;
      flash(
        'ok',
        `${d.imported} hareket yüklendi (${d.auto_donated || 0} otomatik bağışa dönüştü, ${d.skipped_duplicates || 0} mükerrer atlandı).`,
      );
      load();
      onDataChanged?.();
    } catch (e: any) {
      flash('err', e?.response?.data?.detail || 'Ekstre yüklenemedi');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const reanalyse = async () => {
    setLoading(true);
    try {
      const res = await api.post('/admin/incoming-transfers/reanalyse');
      flash('ok', `${res.data.analysed} hareket yeniden analiz edildi`);
      load();
    } catch (e: any) {
      flash('err', e?.response?.data?.detail || 'Analiz başarısız');
      setLoading(false);
    }
  };

  const quickApprove = async (t: Transfer) => {
    const donorId = t.suggestion.donor?.id;
    const campaignId = t.suggestion.campaign?.id;
    if (!donorId || !campaignId) {
      setActive(t);
      return;
    }
    setBusyId(t.id);
    try {
      const res = await api.post(`/admin/incoming-transfers/${t.id}/approve`, {
        donor_id: donorId,
        campaign_id: campaignId,
        on_behalf_of: t.suggestion.on_behalf_of,
        kurban_type: t.suggestion.kurban_type,
      });
      flash('ok', `Makbuz kesildi ve Gelir/Gider listesine işlendi: ${res.data.official_receipt_no || res.data.receipt_number}`);
      setItems((prev) => prev.filter((x) => x.id !== t.id));
      setTotal((n) => Math.max(0, n - 1));
      onDataChanged?.();
    } catch (e: any) {
      flash('err', e?.response?.data?.detail || 'Onaylanamadı');
    } finally {
      setBusyId(null);
    }
  };

  const canQuickApprove = (t: Transfer) => Boolean(t.suggestion.donor?.id && t.suggestion.campaign?.id);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllReady = () => {
    const ready = items.filter(canQuickApprove).map((t) => t.id);
    setSelectedIds((prev) => (prev.size === ready.length ? new Set() : new Set(ready)));
  };

  const bulkApprove = async () => {
    const targets = items.filter((t) => selectedIds.has(t.id) && canQuickApprove(t));
    if (!targets.length) return;
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    for (const t of targets) {
      try {
        await api.post(`/admin/incoming-transfers/${t.id}/approve`, {
          donor_id: t.suggestion.donor!.id,
          campaign_id: t.suggestion.campaign!.id,
          on_behalf_of: t.suggestion.on_behalf_of,
          kurban_type: t.suggestion.kurban_type,
        });
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setBulkBusy(false);
    flash(
      fail ? 'err' : 'ok',
      `${ok} havale onaylandı ve Gelir/Gider listesine eklendi${fail ? `, ${fail} havale onaylanamadı` : ''}`,
    );
    load();
    onDataChanged?.();
  };

  const ignore = async (t: Transfer) => {
    setBusyId(t.id);
    try {
      await api.post(`/admin/incoming-transfers/${t.id}/ignore`);
      setItems((prev) => prev.filter((x) => x.id !== t.id));
      setTotal((n) => Math.max(0, n - 1));
      flash('ok', 'Hareket yok sayıldı');
    } catch (e: any) {
      flash('err', e?.response?.data?.detail || 'İşlem başarısız');
    } finally {
      setBusyId(null);
    }
  };

  const confirmUnmatch = async () => {
    if (!unmatchTarget) return;
    setBusyId(unmatchTarget.id);
    try {
      const res = await api.post(`/admin/incoming-transfers/${unmatchTarget.id}/unmatch`, {
        reason: unmatchReason.trim() || 'Eşleştirme kaldırıldı',
      });
      const list = (res.data.cancelled_receipts || []).join(', ');
      flash('ok', `Eşleştirme kaldırıldı; makbuz iptal edildi (${list}) ve hareket bekleyenlere döndü.`);
      setUnmatchTarget(null);
      load();
      onDataChanged?.();
    } catch (e: any) {
      flash('err', e?.response?.data?.detail || 'Eşleştirme kaldırılamadı');
    } finally {
      setBusyId(null);
    }
  };

  const readyTotalCents = items.filter(canQuickApprove).reduce((sum, x) => sum + x.amount_cents, 0);
  const totalViewCents = items.reduce((sum, x) => sum + x.amount_cents, 0);

  return (
    <div className="flex flex-col gap-6">
      {toast ? (
        <div
          className={`fixed right-5 top-5 z-50 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${
            toast.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {toast.kind === 'ok' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-600" />}
          {toast.text}
        </div>
      ) : null}

      {/* 1. Üst İstatistik Kartları (e-Medrese GlobalStatCard) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-600">Banka & Tahsilat Otomasyonu</p>
            <h2 className="mt-1 text-lg font-black tracking-tight text-slate-950">Gelen Havaleler & Mutabakat Özeti</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setViewMode('havaleler')}
                className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                  viewMode === 'havaleler' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Gelen Havaleler (Bağış Eşleştirme)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('mutabakat')}
                className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                  viewMode === 'mutabakat' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                HVL- Sipariş Mutabakatı & Gidere Dönüştür
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <GlobalStatCard
            id="bekleyen"
            title="Listelenen Hareket"
            value={total}
            subtitle={statusTab === 'unmatched' ? 'Onay bekleyen havale' : 'Aktif görünüm'}
            icon={<ArrowDownLeft className="h-5 w-5" />}
            gradient="from-emerald-500 to-teal-600"
            onClick={() => {
              setViewMode('havaleler');
              setStatusTab('unmatched');
            }}
          />
          <GlobalStatCard
            id="hazir"
            title="Tek Tıkla Onaya Hazır"
            value={items.filter(canQuickApprove).length}
            subtitle={formatMoney(readyTotalCents, 'TRY')}
            icon={<Sparkles className="h-5 w-5" />}
            gradient="from-blue-500 to-cyan-600"
            onClick={() => {
              const ready = items.filter(canQuickApprove);
              const max = Math.max(1, ...ready.map((t) => t.amount_cents));
              setStatModal({
                title: 'Tek Tıkla Onaya Hazır Havaleler',
                subtitle: `${ready.length} adet havale · Toplam ${formatMoney(readyTotalCents, 'TRY')}`,
                items: ready.slice(0, 15).map((t) => ({
                  label: t.sender_name || t.suggestion.donor?.name || 'Gönderen',
                  value: formatMoney(t.amount_cents, t.currency),
                  sub: `${t.suggestion.campaign?.title || 'Genel'} · ${formatDateTime(t.booked_at)}`,
                  color: 'blue' as const,
                  percent: Math.round((t.amount_cents / max) * 100),
                })),
              });
            }}
          />
          <GlobalStatCard
            id="toplam_tutar"
            title="Görünüm Toplamı"
            value={formatMoney(totalViewCents, 'TRY')}
            subtitle={`${items.length} satır toplamı`}
            icon={<HeartHandshake className="h-5 w-5" />}
            gradient="from-indigo-500 to-violet-600"
            onClick={() => {
              const sorted = [...items].sort((a, b) => b.amount_cents - a.amount_cents).slice(0, 15);
              const max = Math.max(1, ...sorted.map((t) => t.amount_cents));
              setStatModal({
                title: 'Görünümdeki En Yüksek Havaleler',
                subtitle: `Toplam ${items.length} kayıt · ${formatMoney(totalViewCents, 'TRY')}`,
                items: sorted.map((t) => ({
                  label: t.sender_name || t.suggestion.donor?.name || 'Bilinmeyen Gönderen',
                  value: formatMoney(t.amount_cents, t.currency),
                  sub: `${t.source || 'Banka'} · ${formatDateTime(t.booked_at)}`,
                  color: 'indigo' as const,
                  percent: Math.round((t.amount_cents / max) * 100),
                })),
              });
            }}
          />
          <GlobalStatCard
            id="mukerrer"
            title="Olası Mükerrer"
            value={duplicateGroups}
            subtitle={duplicateGroups > 0 ? 'İnceleme bekliyor' : 'Mükerrer yok'}
            icon={<Copy className="h-5 w-5" />}
            gradient="from-amber-500 to-orange-600"
            onClick={() => {
              setViewMode('havaleler');
              setStatusTab('duplicates');
            }}
          />
        </div>
      </div>

      <MuhasebeStatModal
        isOpen={!!statModal}
        onClose={() => setStatModal(null)}
        title={statModal?.title || ''}
        subtitle={statModal?.subtitle}
        items={statModal?.items || []}
      />

      {/* 2. Arama & Filtre Çubuğu */}
      {viewMode === 'havaleler' ? (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <ResponsiveDataToolbar
            search={{
              value: q,
              onChange: setQ,
              placeholder: 'Gönderen adı, açıklama veya referans ara…',
            }}
            filter={{
              activeCount: [dateFrom, dateTo, amountMin, amountMax, accountFilter].filter(Boolean).length,
              onOpen: () => setShowFilters((p) => !p),
              label: 'Gelişmiş Filtreler',
              showOnDesktop: true,
            }}
            extraActions={
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.sta,.mt940,.mt,.xml"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadStatement(e.target.files[0])}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Ekstre Yükle
                </button>
                <button
                  type="button"
                  onClick={reanalyse}
                  className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Yeniden Analiz Et
                </button>
              </div>
            }
          />

          {showFilters ? (
            <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">Banka Hesabı</label>
                <select
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800"
                >
                  <option value="">Tüm Banka Hesapları</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} ({a.bank})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">Başlangıç Tarihi</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">Bitiş Tarihi</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">Min Tutar (₺)</label>
                <input
                  type="number"
                  value={amountMin}
                  onChange={(e) => setAmountMin(e.target.value)}
                  placeholder="0"
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">Max Tutar (₺)</label>
                <input
                  type="number"
                  value={amountMax}
                  onChange={(e) => setAmountMax(e.target.value)}
                  placeholder="Limitsiz"
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800"
                />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* 3. Sekme Barı (e-Medrese Pill Navigation) */}
      <div>{tabNavigation}</div>

      {/* 4. İçerik */}
      {viewMode === 'mutabakat' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <BankReconciliationPanel />
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Alt Durum Sekmeleri */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['unmatched', 'Bekleyenler'],
                  ['ambiguous', 'Belirsiz (Çoklu Aday)'],
                  ['matched', 'Bağışa Dönüşenler'],
                  ['ignored', 'Yok Sayılanlar'],
                  ['duplicates', `Olası Mükerrer${duplicateGroups ? ` (${duplicateGroups})` : ''}`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusTab(key)}
                  className={`cursor-pointer rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                    statusTab === key
                      ? key === 'duplicates'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  {label}
                  {statusTab === key ? <span className="ml-1.5 text-[11px] opacity-80">({total})</span> : null}
                </button>
              ))}
            </div>

            {(statusTab === 'unmatched' || statusTab === 'ambiguous') && items.some(canQuickApprove) ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllReady}
                  className="cursor-pointer rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100"
                >
                  {selectedIds.size === items.filter(canQuickApprove).length
                    ? 'Seçimi Kaldır'
                    : `Hazır Olanları Seç (${items.filter(canQuickApprove).length})`}
                </button>
                {selectedIds.size > 0 ? (
                  <button
                    type="button"
                    onClick={bulkApprove}
                    disabled={bulkBusy}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Seçilen {selectedIds.size} Havaleyi Onayla
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Havaleler yükleniyor…
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center">
              <FileSpreadsheet className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-700">Bu görünümde banka hareketi yok</p>
              <p className="mt-1 text-xs text-slate-500">
                Banka hesaplarınızdan otomatik çekilen veya Excel / CSV / MT940 ekstre ile yüklenen havaleler burada listelenir.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {items.map((t) => {
                const s = t.suggestion || {};
                const ready = Boolean(s.donor?.id && s.campaign?.id);
                const busy = busyId === t.id;
                return (
                  <div key={t.id} className="grid grid-cols-1 gap-4 p-4 hover:bg-slate-50/70 lg:grid-cols-12 lg:items-center">
                    <div className="flex items-start gap-3 lg:col-span-5">
                      {(statusTab === 'unmatched' || statusTab === 'ambiguous') && ready ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(t.id)}
                          onChange={() => toggleSelect(t.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-black text-emerald-700">
                            +{formatMoney(t.amount_cents, t.currency)}
                          </span>
                          <span className="text-xs font-medium text-slate-500">{formatDateTime(t.booked_at)}</span>
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            {t.source === 'api' ? 'Otomatik (API)' : 'Ekstre'}
                          </span>
                          {t.possible_duplicate ? (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                              <Copy className="h-3 w-3" /> Olası Mükerrer
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-sm font-bold text-slate-900">
                          {s.sender || t.sender_name || <span className="italic text-slate-400">Gönderen belirtilmemiş</span>}
                        </div>
                        {t.description ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{t.description}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-1.5 lg:col-span-4">
                      {t.status === 'matched' && t.matched ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs">
                          <div className="flex items-center justify-between font-bold text-emerald-900">
                            <span>{t.matched.donor_name || 'Bağışçı'}</span>
                            <span className="font-mono">{t.matched.official_receipt_no || t.matched.receipt_number}</span>
                          </div>
                          <div className="mt-1 space-y-0.5 text-emerald-800">
                            {t.matched.parts.map((p) => (
                              <div key={p.id} className="flex justify-between">
                                <span>{p.campaign_title || 'Kampanya'}</span>
                                <span className="font-semibold">{formatMoney(p.amount_cents, p.currency)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="w-16 shrink-0 text-slate-400">Bağışçı:</span>
                            {s.donor ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-800">
                                <Sparkles className="h-3 w-3" /> {s.donor.name}
                                <span className="text-[10px] text-emerald-600">({s.donor.reason})</span>
                              </span>
                            ) : s.donor === null && (s as any).donor?.candidates?.length ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 font-semibold text-amber-800">
                                <AlertTriangle className="h-3 w-3" /> Birden fazla aday
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-slate-500">
                                <UserPlus className="h-3 w-3" /> Seçilecek / yeni oluşturulacak
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="w-16 shrink-0 text-slate-400">Kalem:</span>
                            {s.campaign ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 font-semibold text-sky-800">
                                {s.campaign.title}
                                {s.kurban_type ? (
                                  <span className="rounded bg-sky-100 px-1.5 text-[10px]">
                                    {KURBAN_LABELS[s.kurban_type] || s.kurban_type}
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-700">
                                <HelpCircle className="h-3 w-3" /> Açıklamada kalem bulunamadı
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 lg:col-span-3">
                      {t.status === 'unmatched' || t.status === 'ambiguous' ? (
                        <>
                          {ready ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => quickApprove(t)}
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              Hızlı Onayla
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setActive(t)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                          >
                            <Layers className="h-3.5 w-3.5 text-slate-500" />
                            {ready ? 'Düzenle / Böl' : 'Eşleştir & Onayla'}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => ignore(t)}
                            className="cursor-pointer rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          >
                            Yok Say
                          </button>
                        </>
                      ) : t.status === 'matched' ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setUnmatchTarget(t);
                            setUnmatchReason('Hatalı eşleştirme');
                          }}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                          Eşleştirmeyi Kaldır
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">{s.ignored || 'İşlendi'}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {active ? (
        <ApproveDialog
          transfer={active}
          campaigns={campaigns}
          books={books}
          onClose={() => setActive(null)}
          onDone={(msg) => {
            const doneId = active.id;
            setActive(null);
            flash('ok', msg);
            setItems((prev) => prev.filter((x) => x.id !== doneId));
            setTotal((n) => Math.max(0, n - 1));
            onDataChanged?.();
          }}
          onError={(msg) => flash('err', msg)}
        />
      ) : null}

      {unmatchTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-slate-900">Eşleştirmeyi Kaldır</h2>
            <p className="mt-1 text-xs text-slate-600">
              Bu havaleden kesilen bağış makbuzu ve Gelir/Gider kaydı iptal edilir, hareket tekrar bekleyenlere döner.
            </p>
            <label className="mt-4 block text-xs font-semibold text-slate-600">İptal nedeni</label>
            <input
              value={unmatchReason}
              onChange={(e) => setUnmatchReason(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setUnmatchTarget(null)}
                className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={busyId === unmatchTarget.id || unmatchReason.trim().length < 3}
                onClick={confirmUnmatch}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                Makbuzu İptal Et & Kaldır
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

function ApproveDialog({
  transfer,
  campaigns,
  books,
  onClose,
  onDone,
  onError,
}: {
  transfer: Transfer;
  campaigns: CampaignOption[];
  books: ReceiptBookOption[];
  onClose: () => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const s = transfer.suggestion || {};
  const totalLira = (transfer.amount_cents / 100).toFixed(2);
  const [mode, setMode] = useState<'existing' | 'new'>(s.donor?.id ? 'existing' : 'new');
  const [donorId, setDonorId] = useState(s.donor?.id || '');
  const [donorLabel, setDonorLabel] = useState(s.donor?.name || '');
  const [donorSearch, setDonorSearch] = useState('');
  const [donorResults, setDonorResults] = useState<Candidate[]>(s.donor?.candidates || []);
  const [newName, setNewName] = useState(s.sender || transfer.sender_name || '');
  const [newPhone, setNewPhone] = useState(s.sender_phone || '');
  const [lines, setLines] = useState<SplitLine[]>([
    {
      campaign_id: s.campaign?.id || campaigns[0]?.id || '',
      amount: totalLira,
      on_behalf_of: s.on_behalf_of || '',
      kurban_type: s.kurban_type || 'vacip',
      kurban_names: '',
    },
  ]);
  const [note, setNote] = useState(transfer.description || '');
  const [bookId, setBookId] = useState('');
  const [sendReceipt, setSendReceipt] = useState(true);
  const [smsBody, setSmsBody] = useState('');
  const [smsTouched, setSmsTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedBook = books.find((b) => b.id === bookId);
  const nextPaperNo = selectedBook ? `${selectedBook.series}-${String(selectedBook.next_no).padStart(4, '0')}` : undefined;

  useEffect(() => {
    if (smsTouched) return;
    const dName = mode === 'existing' ? donorLabel : newName;
    const itemTitles = lines
      .map((l) => campaigns.find((c) => c.id === l.campaign_id)?.title)
      .filter(Boolean)
      .join(', ');
    setSmsBody(defaultSms(dName, transfer.amount_cents, transfer.currency, itemTitles, nextPaperNo));
  }, [mode, donorLabel, newName, lines, campaigns, transfer.amount_cents, transfer.currency, nextPaperNo, smsTouched]);

  useEffect(() => {
    if (donorSearch.trim().length < 2) return;
    const t = setTimeout(() => {
      api
        .get('/donors', { params: { search: donorSearch.trim(), page_size: 10 } })
        .then((res) => {
          const list = res.data.items || res.data || [];
          setDonorResults(
            list.map((d: any) => ({
              id: d.id,
              name: d.company_name || `${d.first_name || ''} ${d.last_name || ''}`.trim(),
              phone: d.phone,
            })),
          );
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [donorSearch]);

  const toCents = (val: string) => {
    const n = Number(String(val).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  };
  const sumCents = lines.reduce((acc, l) => acc + toCents(l.amount), 0);
  const diffCents = transfer.amount_cents - sumCents;

  const updateLine = (idx: number, patch: Partial<SplitLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    const remaining = Math.max(0, diffCents);
    setLines((prev) => [
      ...prev,
      {
        campaign_id: campaigns[0]?.id || '',
        amount: remaining > 0 ? (remaining / 100).toFixed(2) : '',
        on_behalf_of: s.on_behalf_of || '',
        kurban_type: 'vacip',
        kurban_names: '',
      },
    ]);
  };

  const removeLine = (idx: number) => {
    setLines((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 1) next[0] = { ...next[0], amount: totalLira };
      return next;
    });
  };

  const submit = async () => {
    if (lines.some((l) => !l.campaign_id || toCents(l.amount) <= 0)) {
      onError('Her kalem için kampanya ve geçerli tutar girin');
      return;
    }
    if (diffCents !== 0) {
      onError('Kalemlerin toplamı havale tutarına eşit olmalıdır');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, any> = {
        lines: lines.map((l) => {
          const camp = campaigns.find((c) => c.id === l.campaign_id);
          return {
            campaign_id: l.campaign_id,
            amount_cents: toCents(l.amount),
            on_behalf_of: l.on_behalf_of.trim() || null,
            kurban_type: isKurban(camp) ? l.kurban_type : null,
            kurban_names: isKurban(camp)
              ? l.kurban_names.split(/\r?\n|;/).map((n) => n.trim()).filter(Boolean)
              : [],
          };
        }),
        campaign_id: lines[0].campaign_id,
        on_behalf_of: lines[0].on_behalf_of.trim() || null,
        note: note.trim() || null,
        receipt_book_id: bookId || null,
        send_receipt: sendReceipt,
        sms_body: sendReceipt && smsBody.trim() ? smsBody.trim() : null,
      };
      if (mode === 'existing') {
        if (!donorId) {
          onError('Bağışçı seçin');
          setSaving(false);
          return;
        }
        body.donor_id = donorId;
      } else {
        if (newName.trim().length < 2) {
          onError('Bağışçı adı girin');
          setSaving(false);
          return;
        }
        body.new_donor = { full_name: newName.trim(), phone: newPhone.trim() || null };
      }
      const res = await api.post(`/admin/incoming-transfers/${transfer.id}/approve`, body);
      const list = (res.data.receipts || [res.data.official_receipt_no || res.data.receipt_number]).join(', ');
      onDone(`Makbuz kesildi (${list}) ve Gelir/Gider listesine işlendi`);
    } catch (e: any) {
      onError(e?.response?.data?.detail || 'Onaylanamadı');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-lg font-black text-emerald-700">
              {formatMoney(transfer.amount_cents, transfer.currency)}
            </div>
            <div className="text-sm font-semibold text-slate-900">{transfer.sender_name || 'Banka Havalesi'}</div>
            <div className="mt-0.5 text-xs text-slate-500">{transfer.description}</div>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {/* Donor */}
          <div>
            <div className="flex gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setMode('existing')}
                className={`cursor-pointer rounded-lg px-3 py-1.5 ${
                  mode === 'existing' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                Kayıtlı Bağışçı
              </button>
              <button
                type="button"
                onClick={() => setMode('new')}
                className={`cursor-pointer rounded-lg px-3 py-1.5 ${
                  mode === 'new' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                Yeni Bağışçı Oluştur
              </button>
            </div>

            {mode === 'existing' ? (
              <div className="mt-2 space-y-2">
                <input
                  value={donorSearch}
                  onChange={(e) => setDonorSearch(e.target.value)}
                  placeholder="İsim veya telefon ile bağışçı ara…"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="max-h-36 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                  {s.donor && !donorSearch ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDonorId(s.donor!.id);
                        setDonorLabel(s.donor!.name);
                      }}
                      className={`flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-xs ${
                        donorId === s.donor.id ? 'bg-emerald-50 font-bold text-emerald-900' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span>{s.donor.name} (Önerilen)</span>
                      <span className="text-slate-500">{s.donor.phone}</span>
                    </button>
                  ) : null}
                  {donorResults.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => {
                        setDonorId(c.id);
                        setDonorLabel(c.name);
                      }}
                      className={`flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-xs ${
                        donorId === c.id ? 'bg-emerald-50 font-bold text-emerald-900' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span>{c.name}</span>
                      <span className="text-slate-500">{c.phone}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ad Soyad"
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Telefon (05xx…)"
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>

          {/* Split lines */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">Bağış Kalemleri ({lines.length})</label>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-emerald-700 shadow-xs ring-1 ring-slate-200 hover:bg-emerald-50"
              >
                <Plus className="h-3.5 w-3.5" /> Kaleme Böl
              </button>
            </div>

            <div className="mt-2.5 space-y-2.5">
              {lines.map((line, idx) => {
                const camp = campaigns.find((c) => c.id === line.campaign_id);
                return (
                  <div key={idx} className="rounded-xl border border-slate-200 bg-white p-2.5">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                      <div className="sm:col-span-7">
                        <select
                          value={line.campaign_id}
                          onChange={(e) => updateLine(idx, { campaign_id: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                        >
                          <option value="">Kampanya seçin…</option>
                          {campaigns.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-1.5 sm:col-span-5">
                        <input
                          type="number"
                          step="0.01"
                          value={line.amount}
                          onChange={(e) => updateLine(idx, { amount: e.target.value })}
                          placeholder="Tutar"
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-right text-sm font-semibold"
                        />
                        {lines.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {isKurban(camp) ? (
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-12">
                        <select
                          value={line.kurban_type}
                          onChange={(e) => updateLine(idx, { kurban_type: e.target.value })}
                          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm sm:col-span-4"
                          aria-label="Niyet"
                        >
                          {Object.entries(KURBAN_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                        <textarea
                          value={line.kurban_names}
                          onChange={(e) => updateLine(idx, { kurban_names: e.target.value })}
                          rows={2}
                          placeholder="Hissedar isimleri (her satıra bir; boşsa bağışçının adı)"
                          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm sm:col-span-8"
                          aria-label="Hissedar isimleri"
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* SMS */}
          <div className="rounded-xl border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={sendReceipt}
                onChange={(e) => setSendReceipt(e.target.checked)}
                className="rounded border-slate-300 text-emerald-700"
              />
              <MessageSquare className="h-3.5 w-3.5 text-emerald-700" />
              Bağışçıya teşekkür SMS&apos;i ve makbuz gönder
            </label>
            {sendReceipt ? (
              <textarea
                rows={2}
                value={smsBody}
                onChange={(e) => {
                  setSmsBody(e.target.value);
                  setSmsTouched(true);
                }}
                className="mt-2 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800"
              />
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {(() => {
            const targetPhone = mode === 'new' ? newPhone : s.donor?.phone || s.sender_phone;
            const wa = whatsappUrl(targetPhone, smsBody || defaultSms(s.donor?.name || transfer.sender_name || '', transfer.amount_cents, transfer.currency, ''));
            return wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
              >
                <WhatsAppIcon className="h-4 w-4" /> WhatsApp ile Gönder
              </a>
            ) : null;
          })()}
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={saving || diffCents !== 0}
            onClick={submit}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Makbuz Kes & Onayla
          </button>
        </div>
      </div>
    </div>
  );
}
