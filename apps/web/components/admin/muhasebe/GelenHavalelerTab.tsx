'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  BookmarkCheck,
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
import { adminGet, apiErrorMessage, can, useAdminAccess, whatsappUrl } from '@/lib/admin-access';
import { WhatsAppIcon, toast } from '@/components/admin/ui';
import { type SmsTemplate, renderClientSmsTemplate, smsAmount, templatizeSmsText, updateSmsTemplateBody } from '@/lib/sms';
import { GlobalStatCard, MuhasebeStatModal, type MuhasebeStatModalProps, ResponsiveDataToolbar, formatMoney } from './OnMuhasebeUI';
import { BankReconciliationPanel } from '@/components/admin/BankReconciliationPanel';
import { SanalPosHareketleri } from './SanalPosHareketleri';

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

interface ReceiptItem {
  donation_id: string;
  receipt_number: string;
  campaign_title?: string | null;
  amount_cents: number;
}

interface Transfer {
  id: string;
  bank_account_id?: string | null;
  source: string;
  external_id?: string;
  booked_at: string;
  amount_cents: number;
  currency: string;
  sender_name?: string | null;
  description?: string | null;
  status: 'unmatched' | 'ambiguous' | 'matched' | 'ignored';
  donation_id?: string | null;
  possible_duplicate?: boolean;
  suggestion: Suggestion;
  donor?: Candidate | null;
  receipts?: ReceiptItem[];
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

const PAGE_SIZE = 50;

const formatMultiCurrencyTotals = (list: Transfer[]) => {
  const byCur: Record<string, number> = {};
  for (const x of list) {
    const cur = x.currency || 'TRY';
    byCur[cur] = (byCur[cur] || 0) + x.amount_cents;
  }
  const entries = Object.entries(byCur);
  if (entries.length === 0) return formatMoney(0, 'TRY');
  return entries.map(([cur, cents]) => formatMoney(cents, cur)).join(' · ');
};

export interface GelenHavalelerTabProps {
  tabNavigation?: React.ReactNode;
  onDataChanged?: () => void;
  onUnmatchedCountChange?: (count: number) => void;
}

export const GelenHavalelerTab: React.FC<GelenHavalelerTabProps> = ({
  tabNavigation,
  onDataChanged,
  onUnmatchedCountChange,
}) => {
  const [viewMode, setViewMode] = useState<'havaleler' | 'sanal-pos' | 'mutabakat'>('havaleler');
  const [statusTab, setStatusTab] = useState<'unmatched' | 'ambiguous' | 'matched' | 'ignored' | 'duplicates'>('unmatched');
  const [items, setItems] = useState<Transfer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [statModal, setStatModal] = useState<Omit<MuhasebeStatModalProps, 'isOpen' | 'onClose'> | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState(0);
  const [q, setQ] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState({ q: '', amountMin: '', amountMax: '' });
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

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery({ q, amountMin, amountMax });
    }, 300);
    return () => clearTimeout(t);
  }, [q, amountMin, amountMax]);

  useEffect(() => {
    setPage(0);
  }, [statusTab, debouncedQuery.q, debouncedQuery.amountMin, debouncedQuery.amountMax, dateFrom, dateTo, accountFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number | boolean> =
        statusTab === 'duplicates'
          ? { duplicates: true, limit: PAGE_SIZE, offset: page * PAGE_SIZE }
          : { status: statusTab, limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      if (debouncedQuery.q.trim()) params.q = debouncedQuery.q.trim();
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (debouncedQuery.amountMin !== '') params.amount_min = debouncedQuery.amountMin;
      if (debouncedQuery.amountMax !== '') params.amount_max = debouncedQuery.amountMax;
      if (accountFilter) params.account_id = accountFilter;
      const res = await api.get('/admin/incoming-transfers', { params });
      setItems(res.data.items || []);
      const tot = res.data.total || 0;
      setTotal(tot);
      setDuplicateGroups(res.data.duplicate_groups || 0);
      setSelectedIds(new Set());
      const isUnfilteredUnmatched =
        statusTab === 'unmatched' &&
        !debouncedQuery.q.trim() &&
        !debouncedQuery.amountMin &&
        !debouncedQuery.amountMax &&
        !dateFrom &&
        !dateTo &&
        !accountFilter;
      if (isUnfilteredUnmatched && onUnmatchedCountChange) {
        onUnmatchedCountChange(tot);
      }
    } catch (e: any) {
      flash('err', e?.response?.data?.detail || 'Havaleler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [statusTab, page, debouncedQuery, dateFrom, dateTo, accountFilter, onUnmatchedCountChange]);

  useEffect(() => {
    if (!active && !unmatchTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActive(null);
        setUnmatchTarget(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, unmatchTarget]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!loading && items.length === 0 && page > 0) {
      setPage((p) => Math.max(0, p - 1));
    }
  }, [loading, items.length, page]);

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
      const res = await api.post('/admin/bank-statements/import', form, {
        params: accountFilter ? { bank_account_id: accountFilter } : undefined,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const d = res.data;
      flash(
        'ok',
        `${d.imported_count ?? 0} hareket yüklendi (${d.auto_approved || 0} otomatik bağışa dönüştü, ${d.skipped_count || 0} mükerrer atlandı).`,
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

  const decrementTotal = () => {
    setTotal((n) => {
      const next = Math.max(0, n - 1);
      if (statusTab === 'unmatched' && !hasActiveFilters && onUnmatchedCountChange) {
        onUnmatchedCountChange(next);
      }
      return next;
    });
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
      decrementTotal();
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
      decrementTotal();
      flash('ok', 'Hareket yok sayıldı');
    } catch (e: any) {
      flash('err', e?.response?.data?.detail || 'İşlem başarısız');
    } finally {
      setBusyId(null);
    }
  };

  const unignore = async (t: Transfer) => {
    setBusyId(t.id);
    try {
      await api.post(`/admin/incoming-transfers/${t.id}/unignore`);
      setItems((prev) => prev.filter((x) => x.id !== t.id));
      setTotal((n) => Math.max(0, n - 1));
      flash('ok', 'Hareket tekrar bekleyenlere alındı');
    } catch (e: any) {
      flash('err', e?.response?.data?.detail || 'İşlem başarısız');
    } finally {
      setBusyId(null);
    }
  };

  const hasActiveFilters = Boolean(q.trim() || dateFrom || dateTo || amountMin || amountMax || accountFilter);
  const clearFilters = () => {
    setQ('');
    setDateFrom('');
    setDateTo('');
    setAmountMin('');
    setAmountMax('');
    setAccountFilter('');
  };

  const exportCsv = () => {
    if (!items.length) return;
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Tarih', 'Tutar', 'Para Birimi', 'Gönderen', 'Açıklama', 'Kaynak', 'Durum', 'Bağışçı', 'Makbuz No'];
    const rows = items.map((t) => [
      t.booked_at ? new Date(t.booked_at).toLocaleString('tr-TR') : '',
      (t.amount_cents / 100).toFixed(2),
      t.currency || 'TRY',
      t.sender_name || t.suggestion?.sender || '',
      t.description || '',
      t.source === 'api' ? 'Otomatik (API)' : 'Ekstre',
      t.status,
      t.donor?.name || t.suggestion?.donor?.name || '',
      (t.receipts || []).map((r) => r.receipt_number).join(', '),
    ]);
    const csv = '\uFEFF' + [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `banka-hareketleri-${statusTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  const readyItems = items.filter(canQuickApprove);
  const readyTotalLabel = formatMultiCurrencyTotals(readyItems);
  const totalViewLabel = formatMultiCurrencyTotals(items);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
                onClick={() => setViewMode('sanal-pos')}
                className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                  viewMode === 'sanal-pos' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sanal POS Tahsilatları
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

        {viewMode !== 'sanal-pos' ? (
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
            value={readyItems.length}
            subtitle={readyTotalLabel}
            icon={<Sparkles className="h-5 w-5" />}
            gradient="from-blue-500 to-cyan-600"
            onClick={() => {
              const ready = readyItems;
              const max = Math.max(1, ...ready.map((t) => t.amount_cents));
              setStatModal({
                title: 'Tek Tıkla Onaya Hazır Havaleler',
                subtitle: `${ready.length} adet havale · Toplam ${readyTotalLabel}`,
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
            title="Sayfa Toplamı"
            value={totalViewLabel}
            subtitle={`${items.length} / ${total} kayıt`}
            icon={<HeartHandshake className="h-5 w-5" />}
            gradient="from-indigo-500 to-violet-600"
            onClick={() => {
              const sorted = [...items].sort((a, b) => b.amount_cents - a.amount_cents).slice(0, 15);
              const max = Math.max(1, ...sorted.map((t) => t.amount_cents));
              setStatModal({
                title: 'Görünümdeki En Yüksek Havaleler',
                subtitle: `Sayfada ${items.length} kayıt · ${totalViewLabel}`,
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
        ) : null}
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
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={!items.length}
                  className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
                </button>
                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 hover:bg-rose-100"
                  >
                    <X className="h-3.5 w-3.5" /> Temizle
                  </button>
                ) : null}
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

      {/* 3. Sekme Barı (opsiyonel) */}
      {tabNavigation ? <div>{tabNavigation}</div> : null}

      {/* 4. İçerik */}
      {viewMode === 'sanal-pos' ? (
        <SanalPosHareketleri />
      ) : viewMode === 'mutabakat' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <BankReconciliationPanel onBackToTransfers={() => setViewMode('havaleler')} />
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
            <div className="divide-y divide-slate-100">
              {[0, 1, 2, 3, 4].map((idx) => (
                <div key={idx} className="grid animate-pulse grid-cols-1 gap-4 p-4 lg:grid-cols-12 lg:items-center">
                  <div className="space-y-2 lg:col-span-5">
                    <div className="h-4 w-40 rounded bg-slate-200" />
                    <div className="h-4 w-56 rounded bg-slate-200" />
                    <div className="h-3 w-72 rounded bg-slate-100" />
                  </div>
                  <div className="space-y-2 lg:col-span-4">
                    <div className="h-4 w-48 rounded bg-slate-100" />
                    <div className="h-4 w-36 rounded bg-slate-100" />
                  </div>
                  <div className="flex justify-end gap-2 lg:col-span-3">
                    <div className="h-8 w-24 rounded-xl bg-slate-200" />
                    <div className="h-8 w-24 rounded-xl bg-slate-100" />
                  </div>
                </div>
              ))}
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
                const bankAcc = t.bank_account_id ? accounts.find((a) => a.id === t.bank_account_id) : null;
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
                          {bankAcc ? (
                            <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                              {bankAcc.label}
                            </span>
                          ) : null}
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
                      {t.status === 'matched' && (t.donor || (t.receipts && t.receipts.length > 0)) ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs">
                          <div className="flex items-center justify-between gap-2 font-bold text-emerald-900">
                            <span>{t.donor?.name || 'Bağışçı'}</span>
                            <span className="font-mono">
                              {(t.receipts || []).map((r) => r.receipt_number).filter(Boolean).join(', ') || '—'}
                            </span>
                          </div>
                          <div className="mt-1 space-y-0.5 text-emerald-800">
                            {(t.receipts || []).map((p) => (
                              <div key={p.donation_id} className="flex justify-between">
                                <span>{p.campaign_title || 'Kampanya'}</span>
                                <span className="font-semibold">{formatMoney(p.amount_cents, t.currency)}</span>
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
                            ) : t.status === 'ambiguous' || (s as any).candidates?.length ? (
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
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-slate-400">{s.ignored || 'Yok sayıldı'}</span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => unignore(t)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            Bekleyenlere Al
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {total > PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
              <span>
                Toplam <strong className="text-slate-900">{total}</strong> kayıttan{' '}
                <strong className="text-slate-900">{page * PAGE_SIZE + 1}</strong>–
                <strong className="text-slate-900">{Math.min((page + 1) * PAGE_SIZE, total)}</strong> arası
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page === 0 || loading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Önceki
                </button>
                <span className="px-2 font-semibold">
                  {page + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page + 1 >= totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Sonraki
                </button>
              </div>
            </div>
          ) : null}
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
            decrementTotal();
            onDataChanged?.();
          }}
          onError={(msg) => flash('err', msg)}
        />
      ) : null}

      {unmatchTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setUnmatchTarget(null);
          }}
        >
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
  const [donorPhone, setDonorPhone] = useState(s.donor?.phone || '');
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
  const { data: access } = useAdminAccess();
  const canSaveTemplate = can(access, 'sms.templates');
  const [smsTemplates, setSmsTemplates] = useState<SmsTemplate[]>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [note, setNote] = useState(transfer.description || '');
  const [bookId, setBookId] = useState('');
  const [sendReceipt, setSendReceipt] = useState(true);
  const [smsBody, setSmsBody] = useState('');
  const [smsTouched, setSmsTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedBook = books.find((b) => b.id === bookId);
  const nextPaperNo = selectedBook ? `${selectedBook.series}-${String(selectedBook.next_no).padStart(4, '0')}` : undefined;

  useEffect(() => {
    adminGet<SmsTemplate[]>('/sms/templates')
      .then((res) => setSmsTemplates((res.data || []).filter((t) => t.is_active)))
      .catch(() => {});
  }, []);

  const singleCampaignId = lines.length === 1 ? lines[0].campaign_id : '';
  const activeTemplate =
    (singleCampaignId && smsTemplates.find((t) => t.campaign_id === singleCampaignId)) ||
    smsTemplates.find((t) => t.event_key === 'havale_eslesti') ||
    null;

  useEffect(() => {
    if (smsTouched) return;
    const dName = mode === 'existing' ? donorLabel : newName;
    const itemTitles = lines
      .map((l) => campaigns.find((c) => c.id === l.campaign_id)?.title)
      .filter(Boolean)
      .join(', ');
    if (activeTemplate) {
      const cleanName = dName.trim() || 'Hayırseverimiz';
      const currencyLabel = (transfer.currency || 'TRY').toUpperCase() === 'TRY' ? 'TL' : transfer.currency;
      setSmsBody(
        renderClientSmsTemplate(activeTemplate.body, {
          ad_soyad: cleanName,
          ad: cleanName.split(/\s+/)[0] || cleanName,
          tutar: smsAmount(transfer.amount_cents),
          para_birimi: currencyLabel,
          bagis_kalemi: itemTitles || 'bağış',
          makbuz_no: nextPaperNo || '',
        }),
      );
      return;
    }
    setSmsBody(defaultSms(dName, transfer.amount_cents, transfer.currency, itemTitles, nextPaperNo));
  }, [mode, donorLabel, newName, lines, campaigns, transfer.amount_cents, transfer.currency, nextPaperNo, smsTouched, activeTemplate]);

  const handleSaveSmsTemplate = async () => {
    if (!activeTemplate || smsBody.trim().length < 2 || savingTemplate) return;
    setSavingTemplate(true);
    try {
      const dName = (mode === 'existing' ? donorLabel : newName).trim();
      const itemTitles = lines
        .map((l) => campaigns.find((c) => c.id === l.campaign_id)?.title)
        .filter(Boolean)
        .join(', ');
      const nextBody = templatizeSmsText(smsBody, [
        [formatMoney(transfer.amount_cents, transfer.currency), '{tutar} {para_birimi}'],
        [smsAmount(transfer.amount_cents), '{tutar}'],
        [dName, '{ad_soyad}'],
        [itemTitles, '{bagis_kalemi}'],
        [nextPaperNo, '{makbuz_no}'],
      ]);
      const updated = await updateSmsTemplateBody(activeTemplate, nextBody);
      setSmsTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setSmsTouched(false);
      toast.ok(`"${updated.name}" şablonu güncellendi`);
    } catch (err) {
      onError(apiErrorMessage(err, 'SMS şablonu kaydedilemedi'));
    } finally {
      setSavingTemplate(false);
    }
  };

  useEffect(() => {
    if (donorSearch.trim().length < 2) {
      setDonorResults(s.donor?.candidates || []);
      return;
    }
    const t = setTimeout(() => {
      api
        .get('/admin-features/donors', { params: { q: donorSearch.trim(), page_size: 10 } })
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
  }, [donorSearch, s.donor?.candidates]);

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
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
                        setDonorPhone(s.donor!.phone || '');
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
                        setDonorPhone(c.phone || '');
                      }}
                      className={`flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-xs ${
                        donorId === c.id ? 'bg-emerald-50 font-bold text-emerald-900' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span>{c.name}</span>
                      <span className="text-slate-500">{c.phone}</span>
                    </button>
                  ))}
                  {!s.donor && donorResults.length === 0 ? (
                    <p className="px-3 py-3 text-center text-xs text-slate-400">
                      {donorSearch.trim().length < 2
                        ? 'Kayıtlı bağışçı aramak için en az 2 karakter yazın.'
                        : 'Eşleşen bağışçı bulunamadı.'}
                    </p>
                  ) : null}
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
                    ) : (
                      <div className="mt-2">
                        <input
                          value={line.on_behalf_of}
                          onChange={(e) => updateLine(idx, { on_behalf_of: e.target.value })}
                          placeholder="Kimin adına (isteğe bağlı)"
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-500">Kalemler Toplamı: {formatMoney(sumCents, transfer.currency)}</span>
              {diffCents === 0 ? (
                <span className="text-emerald-700">Havale tutarına eşitlendi ✓</span>
              ) : (
                <span className="text-rose-700">
                  {diffCents > 0
                    ? `Kalan: ${formatMoney(diffCents, transfer.currency)}`
                    : `Fazla: ${formatMoney(Math.abs(diffCents), transfer.currency)}`}
                </span>
              )}
            </div>
          </div>

          {books.length > 0 ? (
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Kağıt Makbuz Koçanı (İsteğe Bağlı)</label>
              <select
                value={bookId}
                onChange={(e) => setBookId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
              >
                <option value="">Otomatik Dijital Makbuz</option>
                {books.map((b) => (
                  <option key={b.id} value={b.id}>
                    Seri {b.series} · Sıradaki: {b.series}-{String(b.next_no).padStart(4, '0')} (Kalan: {b.remaining})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

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
              <>
                <textarea
                  rows={2}
                  value={smsBody}
                  onChange={(e) => {
                    setSmsBody(e.target.value);
                    setSmsTouched(true);
                  }}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800"
                />
                {canSaveTemplate && activeTemplate ? (
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500">
                      Aktif şablon: <strong className="font-semibold text-slate-700">{activeTemplate.name}</strong>
                    </span>
                    <button
                      type="button"
                      disabled={savingTemplate || smsBody.trim().length < 2}
                      onClick={handleSaveSmsTemplate}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                    >
                      <BookmarkCheck className="h-3.5 w-3.5" />
                      {savingTemplate ? 'Kaydediliyor…' : 'Şablon olarak kaydet'}
                    </button>
                  </div>
                ) : null}
                {!(mode === 'new' ? newPhone.trim() : donorPhone.trim()) ? (
                  <p className="mt-1.5 text-[11px] font-medium text-amber-700">
                    Bağışçının telefon numarası kayıtlı değil; SMS gönderilmeyecek.
                  </p>
                ) : null}
              </>
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
