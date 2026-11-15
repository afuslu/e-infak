'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronDown,
  Filter,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  HESAP_RENK_ADLARI,
  HESAP_RENK_NOKTALARI,
  getHesapRenkIndeksi,
  hesapRenkAnahtari,
  type HesapTuru,
} from './hesapGorunum';

export const CURRENCY_SYMBOLS: Record<string, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
  GBP: '£',
  SAR: '﷼',
  CHF: 'CHF',
};

export const formatMoney = (cents = 0, currency = 'TRY'): string => {
  const sym = CURRENCY_SYMBOLS[currency] || currency;
  const val = (Number(cents || 0) / 100).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'TRY' ? `${val} ₺` : `${sym}${val}`;
};

export const formatAmount = (amount = 0, currency = 'TRY'): string => {
  const sym = CURRENCY_SYMBOLS[currency] || currency;
  const val = Number(amount || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'TRY' ? `${val} ₺` : `${sym}${val}`;
};

export const formatDateTR = (value?: string | null): string => {
  if (!value) return '-';
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/* ============================================================================
 * 1. AppPageHeader (e-Medrese birebir üst başlık kartı)
 * ========================================================================== */
export interface AppPageHeaderProps {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  meta?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  chips?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export const AppPageHeader: React.FC<AppPageHeaderProps> = ({
  title,
  eyebrow,
  meta,
  icon,
  actions,
  chips,
  children,
  className = '',
}) => (
  <section
    data-modern-header="true"
    className={`rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}
  >
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex min-w-[240px] flex-1 items-center gap-3.5 sm:gap-4">
        {icon ? (
          <span
            data-modern-icon="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600/10 text-emerald-700 ring-1 ring-emerald-600/15"
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-0.5 text-xl font-black leading-tight tracking-tight text-slate-900 sm:text-2xl">
            {title}
          </h1>
          {meta ? (
            <p className="mt-1 text-xs font-semibold text-slate-600">
              {meta}
            </p>
          ) : null}
          {chips ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {chips}
            </div>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-slate-100 pt-2 xl:justify-end xl:border-t-0 xl:pt-0">
          {actions}
        </div>
      ) : null}
    </div>
    {children ? <div className="mt-4">{children}</div> : null}
  </section>
);

/* ============================================================================
 * 2. GlobalStatCard (e-Medrese birebir 4'lü istatistik kartı)
 * ========================================================================== */
export interface GlobalStatCardProps {
  id?: string;
  title: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  icon: React.ReactNode;
  gradient: string;
  onClick?: (id?: string) => void;
  selected?: boolean;
  className?: string;
}

const getValueFontSize = (val: React.ReactNode) => {
  if (typeof val === 'string' || typeof val === 'number') {
    const str = String(val);
    if (str.length > 15) return 'text-xs sm:text-sm md:text-base lg:text-lg';
    if (str.length > 12) return 'text-sm sm:text-base md:text-lg lg:text-xl';
    if (str.length > 9) return 'text-base sm:text-lg md:text-xl lg:text-2xl';
  }
  return 'text-lg sm:text-xl md:text-2xl';
};

export const GlobalStatCard: React.FC<GlobalStatCardProps> = ({
  id,
  title,
  value,
  subtitle,
  icon,
  gradient,
  onClick,
  selected = false,
  className = '',
}) => {
  const isClickable = !!onClick;
  const Tag = isClickable ? 'button' : 'div';

  return (
    <Tag
      type={isClickable ? 'button' : undefined}
      onClick={() => isClickable && onClick(id)}
      className={`group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-3 text-left shadow-xs transition-all duration-300 sm:p-4 ${
        isClickable
          ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-500/20 active:scale-[0.98]'
          : ''
      } ${selected ? 'ring-2 ring-slate-900 shadow-md' : ''} ${className}`}
    >
      <div
        className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br opacity-15 blur-2xl transition-opacity group-hover:opacity-25 ${gradient}`}
      />
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div className="mb-1.5 flex items-start justify-between gap-2 sm:mb-2">
          <p className="text-xs font-bold uppercase leading-tight tracking-wider text-slate-500">
            {title}
          </p>
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xs text-white shadow-inner sm:h-8 sm:w-8 sm:text-sm ${gradient}`}
          >
            {icon}
          </div>
        </div>
        <div className="min-w-0">
          <h3
            className={`font-black leading-tight tracking-tight text-slate-900 tabular-nums ${getValueFontSize(value)}`}
            title={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}
          >
            {value}
          </h3>
          {subtitle ? (
            <div className="mt-1 text-xs font-semibold leading-snug text-slate-500">
              {subtitle}
            </div>
          ) : null}
        </div>
      </div>
    </Tag>
  );
};

/* ============================================================================
 * 3. ResponsiveDataToolbar (e-Medrese arama + sıralama + filtre barı)
 * ========================================================================== */
export interface SortOption {
  value: string;
  label: string;
}

export interface ResponsiveDataToolbarProps {
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  sort?: {
    value: string;
    onChange: (value: string) => void;
    options: SortOption[];
  };
  filter?: {
    activeCount?: number;
    onOpen: () => void;
    label?: string;
    showOnDesktop?: boolean;
  };
  extraActions?: React.ReactNode;
  activeChips?: React.ReactNode;
  className?: string;
}

export const ResponsiveDataToolbar: React.FC<ResponsiveDataToolbarProps> = ({
  search,
  sort,
  filter,
  extraActions,
  activeChips,
  className = '',
}) => (
  <div className={`flex w-full flex-col gap-2.5 ${className}`}>
    <div className="flex flex-row flex-wrap items-center justify-between gap-2 sm:gap-3">
      {search ? (
        <div className="flex min-w-[180px] flex-1 items-center gap-2 sm:max-w-md sm:min-w-[240px]">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
            <input
              type="text"
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder || 'Ara...'}
              className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50/70 pl-10 pr-9 text-sm font-semibold text-slate-900 placeholder:text-slate-500 outline-none transition hover:bg-white focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 sm:text-xs"
            />
            {search.value ? (
              <button
                type="button"
                onClick={() => search.onChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer p-1 text-slate-400 hover:text-slate-600"
                aria-label="Aramayı temizle"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex w-auto max-w-full flex-wrap items-center justify-end gap-2">
        {filter ? (
          <button
            type="button"
            onClick={filter.onOpen}
            className={`inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
              filter.showOnDesktop ? '' : 'sm:hidden'
            } ${
              filter.activeCount && filter.activeCount > 0
                ? 'border-teal-500 bg-teal-600 text-white shadow-sm hover:bg-teal-700'
                : 'border-teal-300/80 bg-teal-50/70 text-teal-800 hover:bg-teal-100/70'
            }`}
          >
            <Filter
              className={`h-3.5 w-3.5 shrink-0 ${
                filter.activeCount && filter.activeCount > 0 ? 'text-white' : 'text-teal-600'
              }`}
            />
            <span className="truncate">{filter.label || 'Filtreler'}</span>
            {filter.activeCount && filter.activeCount > 0 ? (
              <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-xs font-black leading-none text-teal-700">
                {filter.activeCount}
              </span>
            ) : null}
          </button>
        ) : null}

        {sort ? (
          <div className="relative min-w-[145px] flex-1 sm:w-52 sm:flex-initial">
            <select
              value={sort.value}
              onChange={(e) => sort.onChange(e.target.value)}
              className="h-10 w-full cursor-pointer appearance-none truncate rounded-xl border border-slate-300 bg-white pl-8 pr-7 text-sm font-bold text-slate-700 outline-none transition hover:bg-slate-50 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 sm:text-xs"
            >
              {sort.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          </div>
        ) : null}

        {extraActions}
      </div>
    </div>

    {activeChips ? <div className="flex flex-wrap items-center gap-1.5 pt-0.5">{activeChips}</div> : null}
  </div>
);

/* ============================================================================
 * 4. HesapRenkSecici (e-Medrese 12'li Kasa/Banka renk paleti seçicisi)
 * ========================================================================== */
export interface HesapRenkSeciciProps {
  tur: HesapTuru;
  hesapId: string;
  hesapAdi?: string | null;
  renkler: Record<string, number>;
  onSelect: (renkIndeksi: number | null) => void;
}

export const HesapRenkSecici: React.FC<HesapRenkSeciciProps> = ({
  tur,
  hesapId,
  hesapAdi,
  renkler,
  onSelect,
}) => {
  const [acik, setAcik] = useState(false);
  const kapsayiciRef = useRef<HTMLDivElement | null>(null);
  const secili = renkler[hesapRenkAnahtari(tur, hesapId)];
  const gecerliIndeks = getHesapRenkIndeksi(tur, hesapId, hesapAdi, renkler);

  useEffect(() => {
    if (!acik) return undefined;
    const disariTiklama = (event: MouseEvent) => {
      if (!kapsayiciRef.current?.contains(event.target as Node)) setAcik(false);
    };
    const escKapat = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAcik(false);
    };
    document.addEventListener('mousedown', disariTiklama);
    document.addEventListener('keydown', escKapat);
    return () => {
      document.removeEventListener('mousedown', disariTiklama);
      document.removeEventListener('keydown', escKapat);
    };
  }, [acik]);

  return (
    <div className="relative inline-flex" ref={kapsayiciRef}>
      <button
        type="button"
        onClick={() => setAcik((current) => !current)}
        title="Renk seç"
        aria-label="Renk seç"
        className="cursor-pointer rounded p-1 hover:bg-slate-100"
      >
        <span
          className={`block h-4 w-4 rounded-full border border-white shadow-sm ring-1 ring-slate-300 ${HESAP_RENK_NOKTALARI[gecerliIndeks]}`}
        />
      </button>
      {acik ? (
        <div className="absolute right-0 top-full z-40 mt-1 w-44 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <div className="grid grid-cols-6 gap-1.5">
            {HESAP_RENK_NOKTALARI.map((nokta, index) => (
              <button
                key={nokta}
                type="button"
                title={HESAP_RENK_ADLARI[index]}
                onClick={() => {
                  onSelect(index);
                  setAcik(false);
                }}
                className={`flex h-5 w-5 cursor-pointer items-center justify-center rounded-full ${nokta} ring-offset-1 ring-offset-white transition hover:scale-110 ${
                  secili === index ? 'ring-2 ring-slate-900' : ''
                }`}
              >
                {secili === index ? <Check className="h-3 w-3 text-white" /> : null}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              setAcik(false);
            }}
            className="mt-2 w-full cursor-pointer rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Otomatik
          </button>
        </div>
      ) : null}
    </div>
  );
};

/* ============================================================================
 * 5. BankaMutabakatDrawer (e-Medrese Kasa/Banka Hareketleri & Mutabakat Çekmecesi)
 * ========================================================================== */
export interface StatementEntry {
  id: string;
  entry_date: string;
  direction: 'in' | 'out';
  amount_cents: number;
  category: string;
  description?: string | null;
  source_type: string;
  counterparty?: string | null;
  balance_cents: number;
}

export interface StatementData {
  account: {
    id: string;
    name: string;
    kind: 'cash' | 'bank' | 'pos';
    currency: string;
    bank_name?: string | null;
    iban?: string | null;
    opening_balance_cents: number;
    balance_cents: number;
  };
  start: string;
  end: string;
  opening_cents: number;
  closing_cents: number;
  in_cents: number;
  out_cents: number;
  entries: StatementEntry[];
}

export interface BankaMutabakatDrawerProps {
  statement: StatementData | null;
  loading: boolean;
  start: string;
  end: string;
  onDateChange: (start: string, end: string) => void;
  onDeleteManualEntry?: (entryId: string) => void;
  onClose: () => void;
}

export const BankaMutabakatDrawer: React.FC<BankaMutabakatDrawerProps> = ({
  statement,
  loading,
  start,
  end,
  onDateChange,
  onDeleteManualEntry,
  onClose,
}) => {
  const [ekstreBakiyesiInput, setEkstreBakiyesiInput] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'in' | 'out'>('ALL');

  if (!statement && !loading) return null;

  const acc = statement?.account;
  const cur = acc?.currency || 'TRY';
  const sistemBakiyeLira = (statement?.closing_cents || 0) / 100;
  const girilenEkstre = ekstreBakiyesiInput.trim() !== '' ? Number(ekstreBakiyesiInput.replace(',', '.')) : null;
  const mutabakatFarki =
    girilenEkstre !== null && Number.isFinite(girilenEkstre) ? girilenEkstre - sistemBakiyeLira : null;

  const filteredEntries = (statement?.entries || []).filter((e) => {
    if (directionFilter !== 'ALL' && e.direction !== directionFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const hay = `${e.category || ''} ${e.description || ''} ${e.counterparty || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-6 py-4">
          <div className="min-w-0 pr-2">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
              {acc?.kind === 'cash' ? 'Kasa Hareketleri & Mutabakat' : 'Banka Hesap Hareketleri & Mutabakat'}
            </span>
            <h2 className="mt-0.5 truncate text-lg font-bold text-slate-900">
              {acc?.name || 'Hesap Yükleniyor...'}
            </h2>
            {acc?.iban ? (
              <p className="mt-0.5 font-mono text-xs text-slate-500">{acc.iban}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Date range */}
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <label className="text-xs font-bold text-slate-600">
              Başlangıç
              <input
                type="date"
                value={start}
                onChange={(e) => onDateChange(e.target.value, end)}
                className="mt-1 block h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800"
              />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Bitiş
              <input
                type="date"
                value={end}
                onChange={(e) => onDateChange(start, e.target.value)}
                className="mt-1 block h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800"
              />
            </label>
          </div>

          {/* Summary Cards */}
          {statement ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-500">Dönem Başı</p>
                <p className="mt-1 text-sm font-black text-slate-900">
                  {formatMoney(statement.opening_cents, cur)}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <p className="text-xs font-semibold text-emerald-700">Dönem Giriş (+)</p>
                <p className="mt-1 text-sm font-black text-emerald-700">
                  +{formatMoney(statement.in_cents, cur)}
                </p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3">
                <p className="text-xs font-semibold text-rose-700">Dönem Çıkış (-)</p>
                <p className="mt-1 text-sm font-black text-rose-700">
                  -{formatMoney(statement.out_cents, cur)}
                </p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
                <p className="text-xs font-semibold text-blue-700">Güncel Bakiye</p>
                <p className="mt-1 text-sm font-black text-blue-700">
                  {formatMoney(statement.closing_cents, cur)}
                </p>
              </div>
            </div>
          ) : null}

          {/* Mutabakat Kontrolü */}
          {statement ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Mutabakat Kontrolü ({acc?.kind === 'cash' ? 'Fiili Kasa Sayımı' : 'Gerçek Banka Ekstresi'})
                </h3>
                {mutabakatFarki !== null ? (
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${
                      Math.abs(mutabakatFarki) < 0.01
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {Math.abs(mutabakatFarki) < 0.01 ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Uyumlu
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3.5 w-3.5" /> Fark Var
                      </>
                    )}
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-500">
                    {acc?.kind === 'cash' ? 'Kasada Sayılan Gerçek Tutar' : 'Banka Ekstresindeki Gerçek Bakiye'} ({cur})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Örn: 125450.00"
                    value={ekstreBakiyesiInput}
                    onChange={(e) => setEkstreBakiyesiInput(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                {mutabakatFarki !== null ? (
                  <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                    <span className="block text-xs text-slate-500">Hesaplanan Fark (Gerçek - Sistem)</span>
                    <span
                      className={`text-sm font-black ${
                        Math.abs(mutabakatFarki) < 0.01
                          ? 'text-emerald-600'
                          : mutabakatFarki > 0
                            ? 'text-blue-600'
                            : 'text-rose-600'
                      }`}
                    >
                      {mutabakatFarki > 0 ? '+' : ''}
                      {formatAmount(mutabakatFarki, cur)}
                    </span>
                  </div>
                ) : (
                  <div className="text-xs italic text-slate-500">
                    Gerçek bakiyeyi girerek sistemdeki kayıtlarla kuruşu kuruşuna uyuşup uyuşmadığını test edebilirsiniz.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Search & filter */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Kategori, kişi veya açıklama ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>
            <div className="flex rounded-lg bg-slate-100 p-1">
              {(['ALL', 'in', 'out'] as const).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => setDirectionFilter(dir)}
                  className={`cursor-pointer rounded-md px-3 py-1 text-xs font-bold transition ${
                    directionFilter === dir
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {dir === 'ALL' ? 'Tümü' : dir === 'in' ? 'Giriş (+)' : 'Çıkış (-)'}
                </button>
              ))}
            </div>
          </div>

          {/* Movements List */}
          <div className="space-y-2">
            {loading ? (
              <p className="py-8 text-center text-sm text-slate-500">Hareketler yükleniyor...</p>
            ) : filteredEntries.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">Seçilen dönemde hareket bulunamadı.</p>
            ) : (
              filteredEntries.map((item) => {
                const isGiris = item.direction === 'in';
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 transition hover:border-slate-300"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        className={`mt-0.5 rounded-lg p-2 ${
                          isGiris ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                        }`}
                      >
                        {isGiris ? (
                          <ArrowUpCircle className="h-4 w-4" />
                        ) : (
                          <ArrowDownCircle className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">{item.category}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                            {formatDateTR(item.entry_date)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-600">
                          {[item.counterparty, item.description].filter(Boolean).join(' · ') || '-'}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="text-right">
                        <p
                          className={`text-sm font-black tabular-nums ${
                            isGiris ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {isGiris ? '+' : '-'}
                          {formatMoney(item.amount_cents, cur)}
                        </p>
                        <p className="text-[11px] font-semibold text-slate-400 tabular-nums">
                          Bakiye: {formatMoney(item.balance_cents, cur)}
                        </p>
                      </div>
                      {onDeleteManualEntry && (item.source_type === 'manual' || item.source_type === 'transfer') ? (
                        <button
                          type="button"
                          onClick={() => onDeleteManualEntry(item.id)}
                          title="Hareketi Sil"
                          className="cursor-pointer rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 6. MuhasebeStatModal (4'lü İstatistik Kartlarına Tıklanınca Açılan Detay Modalı)
 * ========================================================================== */
export interface MuhasebeStatModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  items: Array<{
    label: string;
    value: string;
    sub?: string;
    color?: 'emerald' | 'rose' | 'blue' | 'amber' | 'indigo';
    percent?: number;
  }>;
}

export const MuhasebeStatModal: React.FC<MuhasebeStatModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  items,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <h3 className="text-base font-black text-slate-900">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-xs font-semibold text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-xl p-1.5 text-slate-500 hover:bg-slate-200/60"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-2.5 overflow-y-auto p-5">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Bu görünüm için detaylı kayıt bulunamadı.</p>
          ) : (
            items.map((it, idx) => (
              <div key={idx} className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-800">{it.label}</span>
                  <span
                    className={`text-sm font-black tabular-nums ${
                      it.color === 'emerald'
                        ? 'text-emerald-600'
                        : it.color === 'rose'
                          ? 'text-rose-600'
                          : it.color === 'amber'
                            ? 'text-amber-600'
                            : 'text-blue-600'
                    }`}
                  >
                    {it.value}
                  </span>
                </div>
                {it.sub ? <p className="mt-0.5 text-xs text-slate-500">{it.sub}</p> : null}
                {typeof it.percent === 'number' ? (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full ${
                        it.color === 'rose' ? 'bg-rose-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(3, it.percent))}%` }}
                    />
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
