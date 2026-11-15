'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertCircle,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUp,
  ArrowDown,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  Download,
  Edit2,
  FileSpreadsheet,
  FileText,
  GripVertical,
  Landmark,
  Layers,
  List,
  Package,
  PieChart,
  Plus,
  RefreshCw,
  ScrollText,
  Star,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { api } from '@/lib/axios';
import {
  AppPageHeader,
  BankaMutabakatDrawer,
  CURRENCY_SYMBOLS,
  GlobalStatCard,
  HesapRenkSecici,
  MuhasebeStatModal,
  ResponsiveDataToolbar,
  formatAmount,
  formatDateTR,
  formatMoney,
  type StatementData,
} from '@/components/admin/muhasebe/OnMuhasebeUI';
import {
  BOS_HESAP_GORUNUMU,
  applyUserOrder,
  formatIban,
  getBankLogoOrIcon,
  getHesapRenkSinifi,
  hesapRenkAnahtari,
  moveInOrder,
  type HesapGorunumTercihleri,
  type HesapTuru,
} from '@/components/admin/muhasebe/hesapGorunum';
import { GelenHavalelerTab } from '@/components/admin/muhasebe/GelenHavalelerTab';
import { BankaEntegrasyonPanel } from '@/components/admin/muhasebe/BankaEntegrasyonPanel';

const BASE = '/admin-features/acc';

export type TabKey =
  | 'gelir-gider'
  | 'kasa-banka'
  | 'gelen-havaleler';

const LEGACY_TAB_MAP: Record<string, TabKey> = {
  summary: 'gelir-gider',
  expenses: 'gelir-gider',
  accounts: 'kasa-banka',
  'gelir-gider': 'gelir-gider',
  'kasa-banka': 'kasa-banka',
  'gelen-havaleler': 'gelen-havaleler',
};

const AYLAR = [
  { value: '1', label: 'Ocak' },
  { value: '2', label: 'Şubat' },
  { value: '3', label: 'Mart' },
  { value: '4', label: 'Nisan' },
  { value: '5', label: 'Mayıs' },
  { value: '6', label: 'Haziran' },
  { value: '7', label: 'Temmuz' },
  { value: '8', label: 'Ağustos' },
  { value: '9', label: 'Eylül' },
  { value: '10', label: 'Ekim' },
  { value: '11', label: 'Kasım' },
  { value: '12', label: 'Aralık' },
];

const GELIR_GIDER_SORT_OPTIONS = [
  { value: 'tarih_desc', label: 'Tarih (Yeni -> Eski)' },
  { value: 'tarih_asc', label: 'Tarih (Eski -> Yeni)' },
  { value: 'miktar_desc', label: 'Tutar (Büyük -> Küçük)' },
  { value: 'miktar_asc', label: 'Tutar (Küçük -> Büyük)' },
  { value: 'kategori_asc', label: 'Kategoriye Göre (A-Z)' },
  { value: 'kategori_desc', label: 'Kategoriye Göre (Z-A)' },
];

const KASA_BANKA_SORT_OPTIONS = [
  { value: 'custom', label: 'Özel Sıralama (Sürükle)' },
  { value: 'bakiye_desc', label: 'Bakiye (Büyük -> Küçük)' },
  { value: 'bakiye_asc', label: 'Bakiye (Küçük -> Büyük)' },
  { value: 'ad_asc', label: 'Hesap Adı (A-Z)' },
  { value: 'ad_desc', label: 'Hesap Adı (Z-A)' },
];

const CARI_SORT_OPTIONS = [
  { value: 'ad_asc', label: 'Cari Adı (A-Z)' },
  { value: 'ad_desc', label: 'Cari Adı (Z-A)' },
  { value: 'bakiye_desc', label: 'Borç/Bakiye (Büyük -> Küçük)' },
  { value: 'bakiye_asc', label: 'Borç/Bakiye (Küçük -> Büyük)' },
];

const GELIR_KATEGORILERI = [
  { value: 'Aidat', label: 'Aidat' },
  { value: 'Servis Ücreti', label: 'Servis Ücreti' },
  { value: 'Kumbara Tahsilatı', label: 'Kumbara Tahsilatı' },
  { value: 'Kurban', label: 'Kurban' },
  { value: 'Zekât', label: 'Zekât' },
  { value: 'Fitre', label: 'Fitre' },
  { value: 'Fidye', label: 'Fidye' },
  { value: 'Genel Bağış', label: 'Genel Bağış' },
  { value: 'Kurs Ücreti', label: 'Kurs Ücreti' },
  { value: 'Diğer Gelir', label: 'Diğer Gelir' },
];

const GIDER_GRUPLARI: { grup: string; items: { value: string; label: string }[] }[] = [
  {
    grup: 'Maaş Giderleri',
    items: [
      { value: 'Maaş', label: 'Maaş' },
      { value: 'Fazla Mesai', label: 'Fazla Mesai' },
      { value: 'Ek Ders', label: 'Ek Ders' },
      { value: 'Prim', label: 'Prim' },
      { value: 'Avans', label: 'Avans' },
    ],
  },
  {
    grup: 'Enerji Giderleri',
    items: [
      { value: 'Elektrik', label: 'Elektrik' },
      { value: 'Su', label: 'Su' },
      { value: 'Doğalgaz', label: 'Doğalgaz' },
    ],
  },
  {
    grup: 'Haberleşme Giderleri',
    items: [
      { value: 'Telefon', label: 'Telefon' },
      { value: 'İnternet', label: 'İnternet' },
    ],
  },
  {
    grup: 'Kira Giderleri',
    items: [{ value: 'Kira', label: 'Kira' }],
  },
  {
    grup: 'Bakım ve Onarım',
    items: [
      { value: 'Temizlik', label: 'Temizlik' },
      { value: 'Bakım', label: 'Bakım' },
      { value: 'Küçük Onarım', label: 'Küçük Onarım' },
    ],
  },
  {
    grup: 'Ulaşım Giderleri',
    items: [
      { value: 'Yolluk', label: 'Yolluk' },
      { value: 'Araba', label: 'Araba' },
      { value: 'Muayene', label: 'Muayene' },
      { value: 'Vergi', label: 'Vergi' },
    ],
  },
  {
    grup: 'Yemek Giderleri',
    items: [
      { value: 'Et', label: 'Et' },
      { value: 'Bakliyat', label: 'Bakliyat' },
      { value: 'Ekmek', label: 'Ekmek' },
      { value: 'Sebze', label: 'Sebze' },
      { value: 'Meyve', label: 'Meyve' },
      { value: 'İçecek', label: 'İçecek' },
      { value: 'Yemek (Diğer)', label: 'Yemek (Diğer)' },
    ],
  },
  {
    grup: 'İnşaat Giderleri',
    items: [
      { value: 'Külliye İnşaatı', label: 'Külliye İnşaatı' },
      { value: 'Kız Medresesi İnşaatı', label: 'Kız Medresesi İnşaatı' },
      { value: 'Cami İnşaatı', label: 'Cami İnşaatı' },
    ],
  },
  {
    grup: 'Hakder / Sosyal Hizmet',
    items: [
      { value: 'Hakder Yemek', label: 'Hakder Yemek' },
      { value: 'Erzak', label: 'Erzak' },
      { value: 'Su Kuyusu', label: 'Su Kuyusu' },
      { value: 'Kumanya', label: 'Kumanya' },
    ],
  },
  {
    grup: 'Diğer',
    items: [
      { value: 'Malzeme', label: 'Malzeme' },
      { value: 'Diğer Gider', label: 'Diğer Gider' },
    ],
  },
];

const ODEME_YONTEMLERI_GG: Array<{ value: 'NAKIT' | 'BANKA' | 'KREDI_KARTI' | 'POS' | 'DIGER'; label: string }> = [
  { value: 'NAKIT', label: 'Nakit' },
  { value: 'BANKA', label: 'Banka Transferi' },
  { value: 'KREDI_KARTI', label: 'Kredi Kartı' },
  { value: 'POS', label: 'POS ile Ödeme' },
  { value: 'DIGER', label: 'Diğer' },
];

interface OzelKategori {
  id: string;
  islem_tipi: 'GELIR' | 'GIDER';
  ad: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStartISO = () => `${new Date().toISOString().slice(0, 7)}-01`;
const thisPeriod = () => new Date().toISOString().slice(0, 7);
const toCents = (val: string | number) =>
  Math.round((parseFloat(String(val || '0').replace(',', '.')) || 0) * 100);

export default function OnMuhasebePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentYear = String(new Date().getFullYear());
  const currentMonth = String(new Date().getMonth() + 1);

  const initialTab = useMemo<TabKey>(() => {
    const raw = searchParams.get('sekme') || searchParams.get('tab') || 'gelir-gider';
    return LEGACY_TAB_MAP[raw] || 'gelir-gider';
  }, [searchParams]);

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleTabChange = (next: TabKey) => {
    setActiveTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set('sekme', next);
    router.replace(`/admin/muhasebe?${params.toString()}`, { scroll: false });
  };

  // Global state & notifications
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [flashMsg, setFlashMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [unmatchedTransferCount, setUnmatchedTransferCount] = useState<number>(0);

  const flash = useCallback((kind: 'ok' | 'err', text: string) => {
    setFlashMsg({ kind, text });
    setTimeout(() => setFlashMsg(null), 4000);
  }, []);

  // Preferences (Sürükle-bırak sıralama, renkler, varsayılan dönem, özel kategoriler)
  const [hesapGorunumu, setHesapGorunumu] = useState<HesapGorunumTercihleri>(BOS_HESAP_GORUNUMU);
  const [defaultGelirGiderView, setDefaultGelirGiderView] = useState<'aylik' | 'yillik'>('yillik');
  const [ozelKategoriler, setOzelKategoriler] = useState<OzelKategori[]>([]);
  const [showKategoriYonetimModal, setShowKategoriYonetimModal] = useState(false);
  const [showYeniKategoriInline, setShowYeniKategoriInline] = useState(false);
  const [yeniKategoriAd, setYeniKategoriAd] = useState('');
  const [editingKategoriId, setEditingKategoriId] = useState<string | null>(null);
  const [editingKategoriAd, setEditingKategoriAd] = useState('');
  const [deletingKategoriId, setDeletingKategoriId] = useState<string | null>(null);

  // Data stores
  const [accounts, setAccounts] = useState<any[]>([]);
  const [gelirGiderItems, setGelirGiderItems] = useState<any[]>([]);
  const [gelirGiderSummary, setGelirGiderSummary] = useState<any>({
    toplam_gelir_cents: 0,
    toplam_gider_cents: 0,
    net_cents: 0,
    gelir_adedi: 0,
    gider_adedi: 0,
    toplam_kayit: 0,
    doviz_gelir: {},
    doviz_gider: {},
    kategori_dagilimi: [],
    mevcut_kategoriler: [],
  });
  const [parties, setParties] = useState<any[]>([]);
  const [tahsilatData, setTahsilatData] = useState<{ items: any[]; summary: any }>({
    items: [],
    summary: {
      toplam_cents: 0,
      nakit_cents: 0,
      banka_cents: 0,
      kart_cents: 0,
      toplam_adet: 0,
      odeme_dagilimi: [],
      tip_dagilimi: [],
      son_7_gun: [],
      liderler: [],
    },
  });
  const [cheques, setCheques] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any>(null);
  const [period, setPeriod] = useState(thisPeriod());
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [stockMoves, setStockMoves] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  // Gelir/Gider filters & UI states
  const [ggFilters, setGgFilters] = useState({
    search: '',
    islemTipi: '' as '' | 'GELIR' | 'GIDER',
    kategori: '',
    kasaId: '',
    bankaId: '',
    odemeYontemi: '',
    yil: currentYear,
    ay: '',
    gun: '',
    startDate: '',
    endDate: '',
    minTutar: '',
    maxTutar: '',
  });
  const [ggSort, setGgSort] = useState('tarih_desc');
  const [showFilters, setShowFilters] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [ggPage, setGgPage] = useState(1);
  const [ggPageSize, setGgPageSize] = useState(25);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  // Kasa & Banka filters & UI states
  const [kbFilters, setKbFilters] = useState({
    search: '',
    kasaId: '',
    bankaId: '',
    minTutar: '',
    maxTutar: '',
  });
  const [kbSort, setKbSort] = useState('custom');
  const [draggedAccountId, setDraggedAccountId] = useState<string | null>(null);

  // Cari Hesap filters & UI states
  const [cariSubTab, setCariSubTab] = useState<'hesaplar' | 'hareketler'>('hesaplar');
  const [cariFilters, setCariFilters] = useState({
    search: '',
    tip: '',
    bakiyeDurum: '',
  });
  const [cariSort, setCariSort] = useState('ad_asc');
  const [partyStatement, setPartyStatement] = useState<any | null>(null);

  // Tahsilat filters
  const [tahsilatFilters, setTahsilatFilters] = useState({
    search: '',
    odemeYontemi: '',
    tip: '',
    startDate: '',
    endDate: '',
  });

  // Modals & Drawers
  const [statModal, setStatModal] = useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    items: Array<{ label: string; value: string; sub?: string; color?: 'emerald' | 'rose' | 'blue' | 'amber' | 'indigo'; percent?: number }>;
  }>({ isOpen: false, title: '', items: [] });

  const [statementDrawer, setStatementDrawer] = useState<{
    accountId: string | null;
    data: StatementData | null;
    loading: boolean;
    start: string;
    end: string;
  }>({ accountId: null, data: null, loading: false, start: monthStartISO(), end: todayISO() });

  // + Gelir Ekle / + Gider Ekle Modal
  const [showGgModal, setShowGgModal] = useState(false);
  const [editingGgItem, setEditingGgItem] = useState<any | null>(null);
  const [ggSubmitting, setGgSubmitting] = useState(false);
  const [ggForm, setGgForm] = useState({
    islem_tipi: 'GELIR' as 'GELIR' | 'GIDER',
    kategori: '',
    miktar: '',
    para_birimi: 'TRY',
    tarih: todayISO(),
    odeme_yontemi: 'NAKIT' as 'NAKIT' | 'BANKA' | 'KREDI_KARTI' | 'POS' | 'DIGER',
    account_id: '',
    counterparty_id: '',
    kisi_adi: '',
    belge_no: '',
    aciklama: '',
  });

  // İptal Et Modal
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  // ⇄ Devir İşlemleri (Virman) Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferForm, setTransferForm] = useState({
    from_account_id: '',
    to_account_id: '',
    miktar: '',
    tarih: todayISO(),
    aciklama: '',
  });

  // Kasa / Banka Ekle-Düzenle Modal
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any | null>(null);
  const [accountForm, setAccountForm] = useState({
    kind: 'cash' as 'cash' | 'bank' | 'pos',
    name: '',
    currency: 'TRY',
    bank_name: '',
    iban: '',
    opening_balance: '0',
    default_for: '' as '' | 'cash' | 'bank_transfer' | 'credit_card',
    is_active: true,
  });

  // Cari Ekle-Düzenle Modal
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [editingParty, setEditingParty] = useState<any | null>(null);
  const [partyForm, setPartyForm] = useState({
    name: '',
    kind: 'supplier' as 'supplier' | 'customer' | 'staff' | 'partner' | 'other',
    tax_no: '',
    tax_office: '',
    phone: '',
    email: '',
    iban: '',
    address: '',
    note: '',
  });

  // Compute active date range from year/month/day or explicit start/end
  const computedDateRange = useMemo(() => {
    if (ggFilters.startDate || ggFilters.endDate) {
      return { start: ggFilters.startDate || undefined, end: ggFilters.endDate || undefined };
    }
    if (ggFilters.yil) {
      const y = Number(ggFilters.yil);
      if (ggFilters.ay) {
        const m = String(ggFilters.ay).padStart(2, '0');
        const lastDay = new Date(y, Number(ggFilters.ay), 0).getDate();
        if (ggFilters.gun) {
          const d = String(ggFilters.gun).padStart(2, '0');
          return { start: `${y}-${m}-${d}`, end: `${y}-${m}-${d}` };
        }
        return { start: `${y}-${m}-01`, end: `${y}-${m}-${String(lastDay).padStart(2, '0')}` };
      }
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    }
    return { start: undefined, end: undefined };
  }, [ggFilters.startDate, ggFilters.endDate, ggFilters.yil, ggFilters.ay, ggFilters.gun]);

  // Load Preferences once
  useEffect(() => {
    api
      .get(`${BASE}/preferences`)
      .then((res) => {
        const d = res.data || {};
        const donem = d.varsayilan_donem === 'aylik' ? 'aylik' : 'yillik';
        setHesapGorunumu({
          kasaSirasi: Array.isArray(d.kasa_sirasi) ? d.kasa_sirasi : [],
          bankaSirasi: Array.isArray(d.banka_sirasi) ? d.banka_sirasi : [],
          renkler: d.hesap_renkleri || {},
          varsayilanDonem: donem,
        });
        if (Array.isArray(d.ozel_kategoriler)) {
          setOzelKategoriler(d.ozel_kategoriler);
        }
        setDefaultGelirGiderView(donem);
        if (donem === 'aylik') {
          setGgFilters((prev) => ({ ...prev, yil: currentYear, ay: currentMonth }));
        }
      })
      .catch(() => {});

    // Unmatched incoming transfers count badge
    api
      .get('/admin/incoming-transfers', { params: { status: 'unmatched', limit: 1 } })
      .then((res) => setUnmatchedTransferCount(res.data?.total || 0))
      .catch(() => {});
  }, [currentMonth, currentYear]);

  // Load main data
  const loadData = useCallback(async () => {
    setUpdating(true);
    try {
      const ggParams: Record<string, any> = {};
      if (computedDateRange.start) ggParams.start = computedDateRange.start;
      if (computedDateRange.end) ggParams.end = computedDateRange.end;

      const [accRes, ggRes] = await Promise.all([
        api.get(`${BASE}/accounts`),
        api.get(`${BASE}/gelir-gider`, { params: ggParams }),
      ]);

      setAccounts(accRes.data || []);
      setGelirGiderItems(ggRes.data?.items || []);
      if (ggRes.data?.summary) setGelirGiderSummary(ggRes.data.summary);
    } catch (e: any) {
      flash('err', e?.response?.data?.detail || 'Finans verileri yüklenemedi');
    } finally {
      setLoading(false);
      setUpdating(false);
    }
  }, [computedDateRange.start, computedDateRange.end, flash]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Split accounts into Kasalar & Bankalar
  const kasalar = useMemo(() => accounts.filter((a) => a.kind === 'cash'), [accounts]);
  const bankaHesaplari = useMemo(() => accounts.filter((a) => a.kind !== 'cash'), [accounts]);

  const siraliKasalar = useMemo(
    () => applyUserOrder(kasalar, hesapGorunumu.kasaSirasi),
    [kasalar, hesapGorunumu.kasaSirasi],
  );
  const siraliBankaHesaplari = useMemo(
    () => applyUserOrder(bankaHesaplari, hesapGorunumu.bankaSirasi),
    [bankaHesaplari, hesapGorunumu.bankaSirasi],
  );

  const savePreferences = useCallback(
    async (next: HesapGorunumTercihleri) => {
      setHesapGorunumu(next);
      try {
        await api.put(`${BASE}/preferences`, {
          kasa_sirasi: next.kasaSirasi,
          banka_sirasi: next.bankaSirasi,
          hesap_renkleri: next.renkler,
          varsayilan_donem: next.varsayilanDonem,
        });
      } catch {
        // ignore
      }
    },
    [],
  );

  const handleHesapRengi = (tur: HesapTuru, hesapId: string, renkIndeksi: number | null) => {
    const anahtar = hesapRenkAnahtari(tur, hesapId);
    const renkler = { ...hesapGorunumu.renkler };
    if (renkIndeksi === null) delete renkler[anahtar];
    else renkler[anahtar] = renkIndeksi;
    void savePreferences({ ...hesapGorunumu, renkler });
  };

  const handleReorderAccount = (tur: HesapTuru, sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const currentList = (tur === 'kasa' ? siraliKasalar : siraliBankaHesaplari).map((x) => x.id);
    const nextOrder = moveInOrder(currentList, sourceId, targetId);
    void savePreferences(
      tur === 'kasa'
        ? { ...hesapGorunumu, kasaSirasi: nextOrder }
        : { ...hesapGorunumu, bankaSirasi: nextOrder },
    );
  };

  const handleToggleDefaultPeriod = (mode: 'aylik' | 'yillik') => {
    setDefaultGelirGiderView(mode);
    if (mode === 'aylik') {
      setGgFilters((prev) => ({
        ...prev,
        yil: currentYear,
        ay: prev.ay || currentMonth,
        gun: '',
        startDate: '',
        endDate: '',
      }));
      flash('ok', 'Varsayılan görünüm "Aylık (Sadece Bu Ay)" olarak kaydedildi.');
    } else {
      setGgFilters((prev) => ({
        ...prev,
        yil: currentYear,
        ay: '',
        gun: '',
        startDate: '',
        endDate: '',
      }));
      flash('ok', 'Varsayılan görünüm "Yıllık (Tüm Aylar)" olarak kaydedildi.');
    }
    void savePreferences({ ...hesapGorunumu, varsayilanDonem: mode });
  };

  // Filtered & Sorted Gelir-Gider List
  const filteredGelirGiderler = useMemo(() => {
    const q = ggFilters.search.trim().toLowerCase();
    const minC = ggFilters.minTutar !== '' ? toCents(ggFilters.minTutar) : null;
    const maxC = ggFilters.maxTutar !== '' ? toCents(ggFilters.maxTutar) : null;

    const list = gelirGiderItems.filter((item) => {
      if (ggFilters.islemTipi && item.islem_tipi !== ggFilters.islemTipi) return false;
      if (ggFilters.kategori && item.kategori !== ggFilters.kategori) return false;
      if (ggFilters.kasaId && item.account_id !== ggFilters.kasaId) return false;
      if (ggFilters.bankaId && item.account_id !== ggFilters.bankaId) return false;
      if (ggFilters.odemeYontemi && item.odeme_yontemi !== ggFilters.odemeYontemi) return false;
      if (minC !== null && item.miktar_cents < minC) return false;
      if (maxC !== null && item.miktar_cents > maxC) return false;
      if (q) {
        const hay = `${item.kategori || ''} ${item.aciklama || ''} ${item.kisi_adi || ''} ${item.belge_no || ''} ${item.kampanya_adi || ''} ${item.account_name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (ggSort === 'tarih_desc') return `${b.tarih}${b.olusturma_tarihi || ''}`.localeCompare(`${a.tarih}${a.olusturma_tarihi || ''}`);
      if (ggSort === 'tarih_asc') return `${a.tarih}${a.olusturma_tarihi || ''}`.localeCompare(`${b.tarih}${b.olusturma_tarihi || ''}`);
      if (ggSort === 'miktar_desc') return b.miktar_cents - a.miktar_cents;
      if (ggSort === 'miktar_asc') return a.miktar_cents - b.miktar_cents;
      if (ggSort === 'kategori_asc') return (a.kategori || '').localeCompare(b.kategori || '', 'tr');
      if (ggSort === 'kategori_desc') return (b.kategori || '').localeCompare(a.kategori || '', 'tr');
      return 0;
    });
  }, [gelirGiderItems, ggFilters, ggSort]);

  // Dynamic summary from filtered items
  const liveSummary = useMemo(() => {
    let gelirCents = 0;
    let giderCents = 0;
    let gelirAdedi = 0;
    let giderAdedi = 0;
    const dovizGelir: Record<string, number> = {};
    const dovizGider: Record<string, number> = {};

    filteredGelirGiderler.forEach((it) => {
      const cur = it.para_birimi || 'TRY';
      if (it.islem_tipi === 'GELIR') {
        gelirAdedi += 1;
        if (cur === 'TRY') gelirCents += it.miktar_cents;
        else dovizGelir[cur] = (dovizGelir[cur] || 0) + it.miktar_cents;
      } else {
        giderAdedi += 1;
        if (cur === 'TRY') giderCents += it.miktar_cents;
        else dovizGider[cur] = (dovizGider[cur] || 0) + it.miktar_cents;
      }
    });

    return {
      gelirCents,
      giderCents,
      netCents: gelirCents - giderCents,
      gelirAdedi,
      giderAdedi,
      toplamKayit: filteredGelirGiderler.length,
      dovizGelir,
      dovizGider,
    };
  }, [filteredGelirGiderler]);

  const ggTotalPages = Math.max(1, Math.ceil(filteredGelirGiderler.length / ggPageSize));
  const paginatedGelirGiderler = useMemo(() => {
    const startIdx = (ggPage - 1) * ggPageSize;
    return filteredGelirGiderler.slice(startIdx, startIdx + ggPageSize);
  }, [filteredGelirGiderler, ggPage, ggPageSize]);

  const activeFilterCount = useMemo(
    () =>
      [
        ggFilters.islemTipi,
        ggFilters.kategori,
        ggFilters.kasaId,
        ggFilters.bankaId,
        ggFilters.odemeYontemi,
        ggFilters.startDate,
        ggFilters.endDate,
        ggFilters.minTutar,
        ggFilters.maxTutar,
      ].filter(Boolean).length,
    [ggFilters],
  );

  // Open account statement drawer
  const openStatement = async (accountId: string, start = statementDrawer.start, end = statementDrawer.end) => {
    setStatementDrawer({ accountId, data: null, loading: true, start, end });
    try {
      const res = await api.get(`${BASE}/accounts/${accountId}/statement`, { params: { start, end } });
      setStatementDrawer({ accountId, data: res.data, loading: false, start, end });
    } catch (e: any) {
      flash('err', e?.response?.data?.detail || 'Hesap hareketleri yüklenemedi');
      setStatementDrawer((prev) => ({ ...prev, loading: false }));
    }
  };

  // Özel Kategorileri Kaydet / Ekle / Düzenle / Sil (e-Medrese Birebir)
  const saveOzelKategoriler = useCallback(async (nextList: OzelKategori[]) => {
    setOzelKategoriler(nextList);
    try {
      await api.put(`${BASE}/preferences`, {
        ozel_kategoriler: nextList,
      });
    } catch {
      // ignore
    }
  }, []);

  const handleYeniKategoriKaydet = async (tipOverride?: 'GELIR' | 'GIDER') => {
    const ad = yeniKategoriAd.trim();
    if (!ad) {
      flash('err', 'Lütfen kategori adı girin');
      return;
    }
    const tip = tipOverride || ggForm.islem_tipi;
    const exists = ozelKategoriler.some(
      (k) => k.islem_tipi === tip && k.ad.toLowerCase() === ad.toLowerCase(),
    );
    if (exists) {
      flash('err', 'Bu isimde bir özel kategori zaten mevcut');
      return;
    }
    const yeniKat: OzelKategori = {
      id: `ozel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ad,
      islem_tipi: tip,
    };
    const nextList = [...ozelKategoriler, yeniKat];
    await saveOzelKategoriler(nextList);
    setGgForm((prev) => ({ ...prev, kategori: ad }));
    setYeniKategoriAd('');
    setShowYeniKategoriInline(false);
    flash('ok', `"${ad}" kategorisi eklendi ve seçildi`);
  };

  const handleKategoriDuzenle = async (id: string) => {
    const yeniAd = editingKategoriAd.trim();
    if (!yeniAd) return;
    const eskiKat = ozelKategoriler.find((k) => k.id === id);
    const nextList = ozelKategoriler.map((k) => (k.id === id ? { ...k, ad: yeniAd } : k));
    await saveOzelKategoriler(nextList);
    if (eskiKat && ggForm.kategori === eskiKat.ad) {
      setGgForm((prev) => ({ ...prev, kategori: yeniAd }));
    }
    setEditingKategoriId(null);
    setEditingKategoriAd('');
    flash('ok', 'Kategori güncellendi');
  };

  const handleKategoriSil = async (id: string) => {
    const silinen = ozelKategoriler.find((k) => k.id === id);
    const nextList = ozelKategoriler.filter((k) => k.id !== id);
    await saveOzelKategoriler(nextList);
    if (silinen && ggForm.kategori === silinen.ad) {
      setGgForm((prev) => ({ ...prev, kategori: prev.islem_tipi === 'GELIR' ? 'Genel Bağış' : '' }));
    }
    setDeletingKategoriId(null);
    flash('ok', 'Özel kategori silindi');
  };

  // Open + Gelir Ekle / + Gider Ekle modal (e-Medrese Birebir)
  const openCreateGgModal = (tip: 'GELIR' | 'GIDER') => {
    setEditingGgItem(null);
    setShowYeniKategoriInline(false);
    setYeniKategoriAd('');
    const defaultCash = siraliKasalar.find((k) => k.is_active)?.id || siraliKasalar[0]?.id || '';
    setGgForm({
      islem_tipi: tip,
      kategori: tip === 'GELIR' ? 'Genel Bağış' : '',
      miktar: '',
      para_birimi: 'TRY',
      tarih: todayISO(),
      odeme_yontemi: 'NAKIT',
      account_id: defaultCash,
      counterparty_id: '',
      kisi_adi: '',
      belge_no: '',
      aciklama: '',
    });
    setShowGgModal(true);
  };

  const openEditGgModal = (item: any) => {
    if (item.source_type === 'donation') {
      flash('err', 'Bağış makbuzundan oluşan gelirler Gelen Havaleler veya Bağışlar ekranından yönetilir.');
      return;
    }
    setEditingGgItem(item);
    setShowYeniKategoriInline(false);
    setYeniKategoriAd('');
    setGgForm({
      islem_tipi: item.islem_tipi,
      kategori: item.kategori || '',
      miktar: String(item.miktar || (item.miktar_cents / 100).toFixed(2)),
      para_birimi: item.para_birimi || 'TRY',
      tarih: item.tarih || todayISO(),
      odeme_yontemi: item.odeme_yontemi || 'NAKIT',
      account_id: item.account_id || '',
      counterparty_id: item.counterparty_id || '',
      kisi_adi: item.kisi_adi || '',
      belge_no: item.belge_no || '',
      aciklama: item.aciklama || '',
    });
    setShowGgModal(true);
  };

  const handleSaveGelirGider = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = toCents(ggForm.miktar);
    if (amountCents <= 0) {
      flash('err', 'Lütfen 0’dan büyük geçerli bir tutar girin');
      return;
    }
    if (!ggForm.kategori.trim()) {
      flash('err', 'Lütfen bir kategori seçin');
      return;
    }
    if (ggForm.odeme_yontemi === 'NAKIT' && !ggForm.account_id && siraliKasalar.length > 0) {
      flash('err', 'Nakit işlem için lütfen bir Kasa seçin');
      return;
    }
    if (
      (ggForm.odeme_yontemi === 'BANKA' || ggForm.odeme_yontemi === 'KREDI_KARTI' || ggForm.odeme_yontemi === 'POS') &&
      !ggForm.account_id &&
      siraliBankaHesaplari.length > 0
    ) {
      flash('err', 'Banka / Kart işlemi için lütfen bir Banka Hesabı seçin');
      return;
    }
    setGgSubmitting(true);
    try {
      const payload = {
        islem_tipi: ggForm.islem_tipi,
        kategori: ggForm.kategori.trim() || (ggForm.islem_tipi === 'GELIR' ? 'Genel Bağış' : 'Diğer Gider'),
        amount_cents: amountCents,
        currency: ggForm.para_birimi,
        tarih: ggForm.tarih,
        odeme_yontemi: ggForm.odeme_yontemi,
        account_id: ggForm.odeme_yontemi === 'DIGER' ? null : ggForm.account_id || null,
        counterparty_id: ggForm.counterparty_id || null,
        kisi_adi: ggForm.kisi_adi.trim() || null,
        belge_no: ggForm.belge_no.trim() || null,
        aciklama: ggForm.aciklama.trim() || null,
      };
      if (editingGgItem) {
        await api.put(`${BASE}/gelir-gider/${editingGgItem.id}`, payload);
        flash('ok', 'Kayıt güncellendi (Düzeltildi geçmişine işlendi)');
      } else {
        await api.post(`${BASE}/gelir-gider`, payload);
        flash('ok', ggForm.islem_tipi === 'GELIR' ? 'Gelir kaydı eklendi' : 'Gider kaydı eklendi');
      }
      setShowGgModal(false);
      setEditingGgItem(null);
      await loadData();
    } catch (err: any) {
      flash('err', err?.response?.data?.detail || 'Kayıt kaydedilemedi');
    } finally {
      setGgSubmitting(false);
    }
  };

  const handleConfirmCancelGg = async () => {
    if (!cancelTarget) return;
    if (cancelReason.trim().length < 3) {
      flash('err', 'Lütfen en az 3 karakterlik iptal sebebi yazın');
      return;
    }
    setCancelSubmitting(true);
    try {
      await api.post(`${BASE}/gelir-gider/${cancelTarget.id}/cancel`, { reason: cancelReason.trim() });
      flash('ok', 'Finans kaydı iptal edildi ve denetim geçmişine işlendi');
      setCancelTarget(null);
      setCancelReason('');
      await loadData();
    } catch (err: any) {
      flash('err', err?.response?.data?.detail || 'Kayıt iptal edilemedi');
    } finally {
      setCancelSubmitting(false);
    }
  };

  // Devir İşlemleri (Virman)
  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = toCents(transferForm.miktar);
    if (!transferForm.from_account_id || !transferForm.to_account_id) {
      flash('err', 'Gönderen ve alıcı hesabı seçin');
      return;
    }
    if (transferForm.from_account_id === transferForm.to_account_id) {
      flash('err', 'Aynı hesaplar arasında devir yapılamaz');
      return;
    }
    if (amountCents <= 0) {
      flash('err', 'Geçerli bir tutar girin');
      return;
    }
    setTransferSubmitting(true);
    try {
      await api.post(`${BASE}/transfers`, {
        from_account_id: transferForm.from_account_id,
        to_account_id: transferForm.to_account_id,
        amount_cents: amountCents,
        entry_date: transferForm.tarih,
        description: transferForm.aciklama.trim() || null,
      });
      flash('ok', 'Kasa / Banka devir işlemi başarıyla gerçekleşti');
      setShowTransferModal(false);
      setTransferForm({ from_account_id: '', to_account_id: '', miktar: '', tarih: todayISO(), aciklama: '' });
      await loadData();
    } catch (err: any) {
      flash('err', err?.response?.data?.detail || 'Devir işlemi başarısız');
    } finally {
      setTransferSubmitting(false);
    }
  };

  // Save Kasa / Banka Account
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: accountForm.name.trim(),
        kind: accountForm.kind,
        currency: accountForm.currency,
        bank_name: accountForm.bank_name.trim() || null,
        iban: accountForm.iban.trim() || null,
        opening_balance_cents: toCents(accountForm.opening_balance),
        default_for: accountForm.default_for || null,
        is_active: accountForm.is_active,
      };
      if (editingAccount) {
        await api.put(`${BASE}/accounts/${editingAccount.id}`, payload);
        flash('ok', 'Hesap güncellendi');
      } else {
        await api.post(`${BASE}/accounts`, payload);
        flash('ok', accountForm.kind === 'cash' ? 'Yeni kasa eklendi' : 'Yeni banka hesabı eklendi');
      }
      setShowAccountModal(false);
      setEditingAccount(null);
      await loadData();
    } catch (err: any) {
      flash('err', err?.response?.data?.detail || 'Hesap kaydedilemedi');
    }
  };

  const handleDeleteAccount = async (acc: any) => {
    if (!window.confirm(`"${acc.name}" hesabını silmek/pasife almak istediğinize emin misiniz?`)) return;
    try {
      const res = await api.delete(`${BASE}/accounts/${acc.id}`);
      flash('ok', res.data?.deactivated ? 'Hareketi olan hesap pasife alındı' : 'Hesap silindi');
      await loadData();
    } catch (err: any) {
      flash('err', err?.response?.data?.detail || 'Hesap silinemedi');
    }
  };

  // Save Counterparty (Cari)
  const handleSaveParty = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingParty) {
        await api.put(`${BASE}/counterparties/${editingParty.id}`, partyForm);
        flash('ok', 'Cari kart güncellendi');
      } else {
        await api.post(`${BASE}/counterparties`, partyForm);
        flash('ok', 'Yeni cari kart eklendi');
      }
      setShowPartyModal(false);
      setEditingParty(null);
      await loadData();
    } catch (err: any) {
      flash('err', err?.response?.data?.detail || 'Cari kaydedilemedi');
    }
  };

  // Export CSV / Excel & DERBİS
  const exportGelirGiderCSV = () => {
    const headers = ['Tarih', 'Tip', 'Kategori', 'Miktar', 'Para Birimi', 'Ödeme Yöntemi', 'Kasa / Banka', 'Kişi / Kurum', 'Belge No', 'Açıklama'];
    const rows = filteredGelirGiderler.map((it) => [
      it.tarih,
      it.islem_tipi_display,
      it.kategori,
      (it.miktar_cents / 100).toFixed(2).replace('.', ','),
      it.para_birimi,
      it.odeme_yontemi_display,
      it.banka_hesabi_adi || it.kasa_adi || '-',
      it.kisi_adi || '-',
      it.belge_no || '-',
      (it.aciklama || '').replace(/;/g, ','),
    ]);
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gelir_gider_listesi_${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadDerbis = async (format: 'xlsx' | 'csv') => {
    try {
      const res = await api.get('/finance/derbis-export', {
        params: { start: computedDateRange.start, end: computedDateRange.end, format },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `derbis_bagis_defteri.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      flash('err', err?.response?.data?.detail || 'DERBİS raporu indirilemedi');
    }
  };

  const scrollTable = (dir: 'left' | 'right') => {
    if (!tableContainerRef.current) return;
    tableContainerRef.current.scrollBy({ left: dir === 'left' ? -320 : 320, behavior: 'smooth' });
  };

  // ==================== PILL TAB NAVIGATION ====================
  const TABS: Array<{ id: TabKey; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }> = [
    { id: 'gelir-gider', label: 'Gelir/Gider', icon: TrendingUp },
    { id: 'kasa-banka', label: 'Kasa & Banka', icon: Wallet },
    { id: 'gelen-havaleler', label: 'Gelen Havaleler', icon: ArrowDownLeft, badge: unmatchedTransferCount },
  ];

  const renderTabNavigation = () => (
    <div
      data-modern-surface="card"
      className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
    >
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold transition-all sm:px-4 sm:text-sm ${
                isActive
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{tab.label}</span>
              {tab.badge && tab.badge > 0 ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-black leading-none ${
                    isActive ? 'bg-white text-emerald-800' : 'bg-amber-500 text-white'
                  }`}
                >
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );

  // ==================== RENDER HELPERS (e-Medrese Rozetleri) ====================
  const renderDovizBadges = (dovizObj: Record<string, number>, isGelir: boolean) => {
    const entries = Object.entries(dovizObj || {}).filter(([pb, val]) => pb !== 'TRY' && Number(val) > 0);
    if (entries.length === 0) return null;
    return (
      <span className="mt-1 flex flex-wrap gap-1">
        {entries.map(([pb, val]) => (
          <span
            key={pb}
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-bold border ${
              isGelir
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}
          >
            +{formatMoney(val, pb)}
          </span>
        ))}
      </span>
    );
  };

  const renderKasaWithIcon = (kasaAdi?: string | null, kasaId?: string | null) => {
    const label = kasaAdi || 'Merkez Kasa';
    const renkSinifi = getHesapRenkSinifi('kasa', kasaId, label, hesapGorunumu.renkler);
    return (
      <div className="flex items-center gap-2" title={label}>
        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${renkSinifi}`}>
          <Wallet className="h-3.5 w-3.5" />
        </div>
        <span className="max-w-[140px] truncate text-xs font-semibold text-slate-700">{label}</span>
      </div>
    );
  };

  const renderBankaWithLogo = (bankaAdi?: string | null) => {
    if (!bankaAdi) return null;
    return (
      <div className="flex items-center gap-2" title={bankaAdi}>
        {getBankLogoOrIcon(bankaAdi, 'w-6 h-6')}
        <span className="max-w-[150px] truncate text-xs font-semibold text-slate-700">{bankaAdi}</span>
      </div>
    );
  };

  const renderDuzeltmeBadge = (item: any) => {
    const count = Number(item.duzeltme_sayisi || 0);
    if (count <= 0) return null;
    const gecmis = Array.isArray(item.duzeltme_gecmisi) ? item.duzeltme_gecmisi : [];
    return (
      <div className="group/duzeltme relative inline-flex items-center">
        <span className="inline-flex cursor-help items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">
          <Clock className="h-3 w-3 shrink-0" />
          <span>Düzeltildi{count > 1 ? ` (${count})` : ''}</span>
        </span>
        {gecmis.length > 0 ? (
          <div className="pointer-events-none invisible absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 text-left opacity-0 shadow-2xl transition-all duration-150 group-hover/duzeltme:visible group-hover/duzeltme:opacity-100">
            <div className="mb-1.5 border-b border-slate-100 pb-1 text-xs font-bold text-slate-800">
              Düzeltme Geçmişi ({count})
            </div>
            <div className="space-y-2 text-[11px]">
              {gecmis.slice(0, 3).map((rev: any) => (
                <div key={rev.id} className="rounded-lg bg-slate-50 p-2">
                  <div className="flex justify-between font-semibold text-slate-700">
                    <span>{rev.kullanici}</span>
                    <span className="text-slate-400">{formatDateTR(rev.tarih)}</span>
                  </div>
                  {rev.degisiklikler?.miktar_cents ? (
                    <div className="mt-1">
                      <span className="text-rose-500 line-through">
                        {formatMoney(rev.degisiklikler.miktar_cents.eski)}
                      </span>{' '}
                      →{' '}
                      <span className="font-bold text-emerald-600">
                        {formatMoney(rev.degisiklikler.miktar_cents.yeni)}
                      </span>
                    </div>
                  ) : null}
                  {rev.degisiklikler?.kategori ? (
                    <div className="mt-0.5">
                      <span className="text-rose-500 line-through">{rev.degisiklikler.kategori.eski}</span> →{' '}
                      <span className="font-bold text-emerald-600">{rev.degisiklikler.kategori.yeni}</span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  // ==================== SEKME 1: GELİR / GİDER (e-Medrese Birebir) ====================
  const renderGelirGider = () => {
    const isCurrentSelectionDefault =
      (defaultGelirGiderView === 'aylik' && ggFilters.yil === currentYear && ggFilters.ay === currentMonth) ||
      (defaultGelirGiderView === 'yillik' && ggFilters.yil === currentYear && !ggFilters.ay);

    const activePeriodLabel =
      ggFilters.startDate || ggFilters.endDate
        ? `📅 Özel Tarih Aralığı: ${ggFilters.startDate || '...'} - ${ggFilters.endDate || '...'}`
        : ggFilters.yil && ggFilters.ay
          ? `📅 ${AYLAR.find((a) => a.value === ggFilters.ay)?.label || ggFilters.ay} ${ggFilters.yil} dönemi verileri listeleniyor`
          : ggFilters.yil
            ? `📅 ${ggFilters.yil} Yılı (Tüm Aylar) verileri listeleniyor`
            : '📅 Tüm Zamanlar verileri listeleniyor';

    const pageStart = filteredGelirGiderler.length === 0 ? 0 : (ggPage - 1) * ggPageSize + 1;
    const pageEnd = Math.min(filteredGelirGiderler.length, ggPage * ggPageSize);

    return (
      <div className="space-y-6">
        {/* 1. 4'lü GlobalStatCard Kartları */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <GlobalStatCard
            id="gelir"
            title="Toplam Gelir"
            value={formatMoney(liveSummary.gelirCents)}
            subtitle={
              <div className="flex flex-col">
                <span>{liveSummary.gelirAdedi} İşlem</span>
                {renderDovizBadges(liveSummary.dovizGelir, true)}
              </div>
            }
            icon={<TrendingUp className="h-5 w-5" />}
            gradient="from-emerald-500 to-teal-600"
            onClick={() => {
              const cats = (gelirGiderSummary.kategori_dagilimi || []).filter((k: any) => k.tip === 'GELIR');
              setStatModal({
                isOpen: true,
                title: 'Gelir Kalemleri Detayı',
                subtitle: `${liveSummary.gelirAdedi} işlem · Toplam ${formatMoney(liveSummary.gelirCents)}`,
                items: cats.map((k: any) => ({
                  label: k.kategori,
                  value: formatMoney(k.toplam_cents),
                  sub: `${k.adet} işlem`,
                  color: 'emerald',
                  percent: liveSummary.gelirCents > 0 ? Math.round((k.toplam_cents / liveSummary.gelirCents) * 100) : 0,
                })),
              });
            }}
          />

          <GlobalStatCard
            id="gider"
            title="Toplam Gider"
            value={formatMoney(liveSummary.giderCents)}
            subtitle={
              <div className="flex flex-col">
                <span>{liveSummary.giderAdedi} İşlem</span>
                {renderDovizBadges(liveSummary.dovizGider, false)}
              </div>
            }
            icon={<TrendingDown className="h-5 w-5" />}
            gradient="from-rose-500 to-red-600"
            onClick={() => {
              const cats = (gelirGiderSummary.kategori_dagilimi || []).filter((k: any) => k.tip === 'GIDER');
              setStatModal({
                isOpen: true,
                title: 'Gider Kalemleri Detayı',
                subtitle: `${liveSummary.giderAdedi} işlem · Toplam ${formatMoney(liveSummary.giderCents)}`,
                items: cats.map((k: any) => ({
                  label: k.kategori,
                  value: formatMoney(k.toplam_cents),
                  sub: `${k.adet} işlem`,
                  color: 'rose',
                  percent: liveSummary.giderCents > 0 ? Math.round((k.toplam_cents / liveSummary.giderCents) * 100) : 0,
                })),
              });
            }}
          />

          <GlobalStatCard
            id="net"
            title="Net Durum"
            value={formatMoney(liveSummary.netCents)}
            subtitle={liveSummary.netCents >= 0 ? 'Kâr' : 'Zarar'}
            icon={<span className="text-base font-black">₺</span>}
            gradient={liveSummary.netCents >= 0 ? 'from-cyan-500 to-blue-600' : 'from-amber-500 to-orange-600'}
            onClick={() =>
              setStatModal({
                isOpen: true,
                title: 'Net Durum Özeti',
                subtitle: activePeriodLabel,
                items: [
                  { label: 'Toplam Gelir (+)', value: formatMoney(liveSummary.gelirCents), color: 'emerald' },
                  { label: 'Toplam Gider (-)', value: formatMoney(liveSummary.giderCents), color: 'rose' },
                  {
                    label: 'Net Bakiye',
                    value: formatMoney(liveSummary.netCents),
                    color: liveSummary.netCents >= 0 ? 'blue' : 'amber',
                  },
                ],
              })
            }
          />

          <GlobalStatCard
            id="islem"
            title="Akış"
            value={`${liveSummary.toplamKayit} İşlem`}
            subtitle={activeFilterCount > 0 ? 'Filtreli' : 'Tümü'}
            icon={<Activity className="h-5 w-5" />}
            gradient="from-indigo-500 to-violet-600"
            onClick={() =>
              setStatModal({
                isOpen: true,
                title: 'Son Finansal Hareketler',
                subtitle: `Toplam ${liveSummary.toplamKayit} kayıt`,
                items: filteredGelirGiderler.slice(0, 10).map((it) => ({
                  label: `${it.kategori} (${it.kisi_adi || it.odeme_yontemi_display})`,
                  value: `${it.islem_tipi === 'GELIR' ? '+' : '-'}${formatMoney(it.miktar_cents, it.para_birimi)}`,
                  sub: `${formatDateTR(it.tarih)} · ${it.aciklama || '-'}`,
                  color: it.islem_tipi === 'GELIR' ? 'emerald' : 'rose',
                })),
              })
            }
          />
        </div>

        {/* 2. Arama & Sıralama Çubuğu (ResponsiveDataToolbar) */}
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <ResponsiveDataToolbar
            search={{
              value: ggFilters.search,
              onChange: (val) => {
                setGgFilters((prev) => ({ ...prev, search: val }));
                setGgPage(1);
              },
              placeholder: 'Kategori, kişi/kurum, belge no veya açıklama ara…',
            }}
            sort={{
              value: ggSort,
              onChange: setGgSort,
              options: GELIR_GIDER_SORT_OPTIONS,
            }}
          />
        </section>

        {/* 3. Açılır/Kapanır Gelişmiş Filtreler Akordiyonu */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setShowFilters((p) => !p)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowFilters((p) => !p);
              }
            }}
            className="flex w-full cursor-pointer items-center justify-between p-4 transition-colors hover:bg-slate-50/70"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-700" />
              <span className="text-sm font-semibold text-slate-800">Gelişmiş Filtreler</span>
              {activeFilterCount > 0 ? (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                  {activeFilterCount} aktif
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setGgFilters({
                      search: '',
                      islemTipi: '',
                      kategori: '',
                      kasaId: '',
                      bankaId: '',
                      odemeYontemi: '',
                      yil: currentYear,
                      ay: defaultGelirGiderView === 'aylik' ? currentMonth : '',
                      gun: '',
                      startDate: '',
                      endDate: '',
                      minTutar: '',
                      maxTutar: '',
                    });
                  }}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                >
                  <X className="h-3.5 w-3.5" /> Filtreleri Temizle
                </button>
              ) : null}
              <ChevronDown
                className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`}
              />
            </div>
          </div>

          {showFilters ? (
            <div className="space-y-4 border-t border-slate-100 p-4">
              {/* Dönem ve Varsayılan Görünüm Seçici */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Dönem Seçimi:</span>
                  <select
                    value={ggFilters.yil}
                    onChange={(e) => setGgFilters((prev) => ({ ...prev, yil: e.target.value, startDate: '', endDate: '' }))}
                    className="h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-800"
                  >
                    <option value="">Tüm Yıllar</option>
                    {[2024, 2025, 2026, 2027].map((y) => (
                      <option key={y} value={String(y)}>
                        {y} Yılı
                      </option>
                    ))}
                  </select>
                  <select
                    value={ggFilters.ay}
                    onChange={(e) => setGgFilters((prev) => ({ ...prev, ay: e.target.value, startDate: '', endDate: '' }))}
                    className="h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-800"
                  >
                    <option value="">Tüm Aylar (Yıllık)</option>
                    {AYLAR.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Varsayılan Görünüm:</span>
                  <button
                    type="button"
                    onClick={() => handleToggleDefaultPeriod('aylik')}
                    className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                      defaultGelirGiderView === 'aylik'
                        ? 'border-teal-600 bg-teal-600 text-white shadow-xs'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-teal-500'
                    }`}
                  >
                    📅 Aylık (Sadece Bu Ay)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleDefaultPeriod('yillik')}
                    className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                      defaultGelirGiderView === 'yillik'
                        ? 'border-teal-600 bg-teal-600 text-white shadow-xs'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-teal-500'
                    }`}
                  >
                    📆 Yıllık (Tüm Yıl)
                  </button>
                </div>
              </div>

              {/* Select & Range Filters */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">İşlem Tipi</label>
                  <select
                    value={ggFilters.islemTipi}
                    onChange={(e) => setGgFilters((p) => ({ ...p, islemTipi: e.target.value as any }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                  >
                    <option value="">Tümü (Gelir + Gider)</option>
                    <option value="GELIR">Gelir (+)</option>
                    <option value="GIDER">Gider (-)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Kategori</label>
                  <select
                    value={ggFilters.kategori}
                    onChange={(e) => setGgFilters((p) => ({ ...p, kategori: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                  >
                    <option value="">Tüm Kategoriler</option>
                    {(gelirGiderSummary.mevcut_kategoriler || []).map((kat: string) => (
                      <option key={kat} value={kat}>
                        {kat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Kasa</label>
                  <select
                    value={ggFilters.kasaId}
                    onChange={(e) => setGgFilters((p) => ({ ...p, kasaId: e.target.value, bankaId: '' }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                  >
                    <option value="">Tüm Kasalar</option>
                    {siraliKasalar.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Banka Hesabı</label>
                  <select
                    value={ggFilters.bankaId}
                    onChange={(e) => setGgFilters((p) => ({ ...p, bankaId: e.target.value, kasaId: '' }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                  >
                    <option value="">Tüm Bankalar</option>
                    {siraliBankaHesaplari.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Ödeme Yöntemi</label>
                  <select
                    value={ggFilters.odemeYontemi}
                    onChange={(e) => setGgFilters((p) => ({ ...p, odemeYontemi: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                  >
                    <option value="">Tümü</option>
                    <option value="NAKIT">Nakit</option>
                    <option value="BANKA">Banka / Havale</option>
                    <option value="KREDI_KARTI">Kredi Kartı / POS</option>
                    <option value="DIGER">Diğer / Borç</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Başlangıç Tarihi</label>
                  <input
                    type="date"
                    value={ggFilters.startDate}
                    onChange={(e) => setGgFilters((p) => ({ ...p, startDate: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Bitiş Tarihi</label>
                  <input
                    type="date"
                    value={ggFilters.endDate}
                    onChange={(e) => setGgFilters((p) => ({ ...p, endDate: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Min Tutar (₺)</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={ggFilters.minTutar}
                    onChange={(e) => setGgFilters((p) => ({ ...p, minTutar: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Max Tutar (₺)</label>
                  <input
                    type="number"
                    placeholder="Limitsiz"
                    value={ggFilters.maxTutar}
                    onChange={(e) => setGgFilters((p) => ({ ...p, maxTutar: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* 4. Yuvarlak Pill Sekme Çubuğu */}
        {renderTabNavigation()}

        {/* 5. Gelir-Gider Listesi Ana Kartı (e-Medrese Birebir) */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Üst Başlık & Aksiyon Butonları */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-lg font-bold text-slate-900">Gelir-Gider Listesi</h3>

              {/* Aktif Dönem Rozeti & Hızlı Ay Seçici + ★ VARSAYILAN */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                  {activePeriodLabel}
                </span>

                <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                  <select
                    aria-label="Hızlı Ay Seçimi"
                    value={ggFilters.ay}
                    onChange={(e) =>
                      setGgFilters((prev) => ({
                        ...prev,
                        yil: prev.yil || currentYear,
                        ay: e.target.value,
                        gun: '',
                        startDate: '',
                        endDate: '',
                      }))
                    }
                    className="cursor-pointer rounded-md bg-transparent px-2 py-1 text-xs font-bold text-slate-700 outline-none hover:text-teal-600"
                  >
                    <option value="">Tüm Aylar (Yıllık)</option>
                    {AYLAR.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => handleToggleDefaultPeriod(ggFilters.ay ? 'aylik' : 'yillik')}
                    title={
                      isCurrentSelectionDefault
                        ? 'Şu anki görünüm varsayılan olarak kayıtlı.'
                        : 'Şu an seçili olan görünümü varsayılan olarak kaydet'
                    }
                    className={`ml-1 inline-flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
                      isCurrentSelectionDefault
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-xs ring-1 ring-amber-400/50'
                        : 'border border-amber-300/80 bg-white text-amber-700 shadow-2xs hover:bg-amber-50'
                    }`}
                  >
                    <Star className={`h-3.5 w-3.5 ${isCurrentSelectionDefault ? 'fill-white text-white' : 'text-amber-500'}`} />
                    <span>{isCurrentSelectionDefault ? 'VARSAYILAN' : 'Varsayılan Yap'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Sağ Aksiyon Butonları: < > + Dışa Aktar + Devir İşlemleri + Gelir Ekle + Gider Ekle */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="mr-1 hidden items-center gap-1 md:flex">
                <button
                  type="button"
                  onClick={() => scrollTable('left')}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-2xs transition hover:bg-slate-50"
                  title="Sola Kaydır"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollTable('right')}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-2xs transition hover:bg-slate-50"
                  title="Sağa Kaydır"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowExportMenu((p) => !p)}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-2xs transition hover:border-teal-500"
                >
                  <Download className="h-4 w-4" /> Dışa Aktar
                </button>
                {showExportMenu ? (
                  <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-2 shadow-2xl">
                    <button
                      type="button"
                      onClick={() => {
                        exportGelirGiderCSV();
                        setShowExportMenu(false);
                      }}
                      className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                        <FileSpreadsheet className="h-4 w-4" />
                      </div>
                      Excel / CSV İndir (.csv)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void downloadDerbis('xlsx');
                        setShowExportMenu(false);
                      }}
                      className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                        <FileText className="h-4 w-4" />
                      </div>
                      DERBİS Bağış Defteri (.xlsx)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void downloadDerbis('csv');
                        setShowExportMenu(false);
                      }}
                      className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <FileText className="h-4 w-4" />
                      </div>
                      DERBİS Bağış Defteri (.csv)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowExportMenu(false);
                        window.print();
                      }}
                      className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                        <FileText className="h-4 w-4" />
                      </div>
                      PDF / Yazdır
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => {
                  setTransferForm({
                    from_account_id: siraliKasalar[0]?.id || '',
                    to_account_id: siraliBankaHesaplari[0]?.id || '',
                    miktar: '',
                    tarih: todayISO(),
                    aciklama: '',
                  });
                  setShowTransferModal(true);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-2xs transition hover:bg-blue-700"
              >
                <ArrowRightLeft className="h-4 w-4" /> Devir İşlemleri
              </button>

              <button
                type="button"
                onClick={() => openCreateGgModal('GELIR')}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-2xs transition hover:bg-green-700"
              >
                <Plus className="h-4 w-4" /> Gelir Ekle
              </button>

              <button
                type="button"
                onClick={() => openCreateGgModal('GIDER')}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-2xs transition hover:bg-red-700"
              >
                <Plus className="h-4 w-4" /> Gider Ekle
              </button>
            </div>
          </div>

          {/* Mobil Kart Görünümü */}
          <div className="space-y-3 p-3 md:hidden">
            {paginatedGelirGiderler.map((item) => (
              <div
                key={item.id}
                className={`rounded-2xl border p-4 shadow-xs ${
                  item.islem_tipi === 'GELIR'
                    ? 'border-emerald-200/80 bg-gradient-to-br from-white to-emerald-50/50'
                    : 'border-rose-200/80 bg-gradient-to-br from-white to-rose-50/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-slate-500">{formatDateTR(item.tarih)}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-bold text-slate-900">{item.kategori}</span>
                      {renderDuzeltmeBadge(item)}
                    </div>
                  </div>
                  <span
                    className={`text-base font-black tabular-nums ${
                      item.islem_tipi === 'GELIR' ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {item.islem_tipi === 'GELIR' ? '+' : '-'}
                    {formatMoney(item.miktar_cents, item.para_birimi)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold">{item.odeme_yontemi_display}</span>
                  {item.account_name ? <span>· {item.account_name}</span> : null}
                  {item.kisi_adi ? <span>· {item.kisi_adi}</span> : null}
                </div>
                {item.aciklama ? <p className="mt-2 text-xs text-slate-600">{item.aciklama}</p> : null}
              </div>
            ))}
          </div>

          {/* Masaüstü Tablo Görünümü (e-Medrese Sütunları) */}
          <div
            ref={tableContainerRef}
            className="hidden min-h-[320px] overflow-x-auto md:block"
          >
            <table className="w-full min-w-[860px] border-collapse text-xs sm:text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600">
                <tr>
                  <th className="border-r border-slate-200/60 px-3 py-3">Tarih</th>
                  <th className="border-r border-slate-200/60 px-3 py-3 text-center">Tip</th>
                  <th className="border-r border-slate-200/60 px-3 py-3">Kategori</th>
                  <th className="border-r border-slate-200/60 px-4 py-3 text-right">Miktar</th>
                  <th className="border-r border-slate-200/60 px-3 py-3">Ödeme Yöntemi</th>
                  <th className="border-r border-slate-200/60 px-3 py-3">Kasa / Banka</th>
                  <th className="border-r border-slate-200/60 px-3 py-3">Kişi / Kurum</th>
                  <th className="border-r border-slate-200/60 px-3 py-3">Açıklama</th>
                  <th className="px-3 py-3 text-center">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-sm text-slate-500">
                      Gelir ve gider kayıtları yükleniyor…
                    </td>
                  </tr>
                ) : paginatedGelirGiderler.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-sm text-slate-500">
                      Seçilen dönem veya filtreye uygun gelir/gider kaydı bulunamadı.
                    </td>
                  </tr>
                ) : (
                  paginatedGelirGiderler.map((item) => (
                    <tr
                      key={item.id}
                      className="group/row transition-colors hover:bg-slate-50"
                    >
                      <td
                        className={`whitespace-nowrap border-l-2 border-r border-l-transparent border-r-slate-200/60 px-3 py-2.5 font-mono text-xs text-slate-600 transition-all ${
                          item.islem_tipi === 'GELIR'
                            ? 'group-hover/row:border-l-emerald-500'
                            : 'group-hover/row:border-l-rose-500'
                        }`}
                      >
                        {formatDateTR(item.tarih)}
                      </td>
                      <td className="border-r border-slate-200/60 px-3 py-2.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-extrabold uppercase tracking-wider ${
                            item.islem_tipi === 'GELIR' ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              item.islem_tipi === 'GELIR' ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          {item.islem_tipi_display}
                        </span>
                      </td>
                      <td className="border-r border-slate-200/60 px-3 py-2.5 font-semibold text-slate-900">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{item.kategori}</span>
                          {renderDuzeltmeBadge(item)}
                        </div>
                      </td>
                      <td
                        className={`whitespace-nowrap border-r border-slate-200/60 px-4 py-2.5 text-right text-sm font-extrabold tabular-nums sm:text-base ${
                          item.islem_tipi === 'GELIR' ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {item.islem_tipi === 'GELIR' ? '+' : '-'}
                        {formatMoney(item.miktar_cents, item.para_birimi)}
                      </td>
                      <td className="border-r border-slate-200/60 px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                          <CreditCard className="h-3.5 w-3.5 text-indigo-500" />
                          {item.odeme_yontemi_display}
                        </span>
                      </td>
                      <td className="border-r border-slate-200/60 px-3 py-2.5">
                        {item.banka_hesabi_adi ? (
                          renderBankaWithLogo(item.banka_hesabi_adi)
                        ) : item.kasa_adi || item.odeme_yontemi === 'NAKIT' ? (
                          renderKasaWithIcon(item.kasa_adi, item.account_id)
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="border-r border-slate-200/60 px-3 py-2.5 text-xs font-semibold text-slate-700">
                        {item.kisi_adi || '-'}
                        {item.belge_no ? (
                          <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                            {item.belge_no}
                          </span>
                        ) : null}
                      </td>
                      <td
                        className="max-w-[200px] truncate border-r border-slate-200/60 px-3 py-2.5 text-xs text-slate-600"
                        title={item.aciklama || ''}
                      >
                        {item.aciklama || '-'}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditGgModal(item)}
                            title={item.source_type === 'donation' ? 'Bağış makbuzu kaydı' : 'Düzenle'}
                            className={`cursor-pointer rounded-lg p-1.5 transition ${
                              item.source_type === 'donation'
                                ? 'text-slate-300'
                                : 'text-blue-600 hover:bg-blue-50'
                            }`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (item.source_type === 'donation') {
                                flash('err', 'Bağış makbuzundan oluşan kayıtlar Gelen Havaleler veya Bağışlar ekranından iptal edilir.');
                                return;
                              }
                              setCancelTarget(item);
                              setCancelReason('');
                            }}
                            title="İptal Et"
                            className={`cursor-pointer rounded-lg p-1.5 transition ${
                              item.source_type === 'donation'
                                ? 'text-slate-300'
                                : 'text-rose-600 hover:bg-rose-50'
                            }`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Sayfalama (Pagination) */}
          {filteredGelirGiderler.length > 0 ? (
            <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3.5 text-xs sm:flex-row sm:items-center sm:justify-between">
              <div className="font-semibold text-slate-600">
                {pageStart}-{pageEnd} / {filteredGelirGiderler.length} kayıt
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={ggPageSize}
                  onChange={(e) => {
                    setGgPageSize(Number(e.target.value));
                    setGgPage(1);
                  }}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700"
                >
                  {[25, 50, 100, 250].map((size) => (
                    <option key={size} value={size}>
                      {size}/sayfa
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={ggPage <= 1}
                  onClick={() => setGgPage((p) => Math.max(1, p - 1))}
                  className="h-9 cursor-pointer rounded-lg border border-slate-200 px-3 font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Önceki
                </button>
                <span className="inline-flex h-9 items-center rounded-lg bg-slate-100 px-3 font-bold text-slate-700">
                  {ggPage} / {ggTotalPages}
                </span>
                <button
                  type="button"
                  disabled={ggPage >= ggTotalPages}
                  onClick={() => setGgPage((p) => Math.min(ggTotalPages, p + 1))}
                  className="h-9 cursor-pointer rounded-lg border border-slate-200 px-3 font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Sonraki
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* 6. Alt Kategori & Gelir/Gider Dağılım Analitiği */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900">Gelir Kalemleri Dağılımı</h3>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="space-y-2.5">
              {(gelirGiderSummary.kategori_dagilimi || [])
                .filter((k: any) => k.tip === 'GELIR')
                .sort((a: any, b: any) => b.toplam_cents - a.toplam_cents)
                .slice(0, 6)
                .map((k: any) => {
                  const pct =
                    liveSummary.gelirCents > 0 ? Math.min(100, Math.round((k.toplam_cents / liveSummary.gelirCents) * 100)) : 0;
                  return (
                    <div key={k.kategori}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="font-semibold text-slate-700">
                          {k.kategori} <span className="text-slate-400">({k.adet} işlem)</span>
                        </span>
                        <span className="font-bold text-emerald-700">{formatMoney(k.toplam_cents)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(4, pct)}%` }} />
                      </div>
                    </div>
                  );
                })}
              {(gelirGiderSummary.kategori_dagilimi || []).filter((k: any) => k.tip === 'GELIR').length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">Bu dönemde gelir kaydı yok.</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900">En Yüksek Gider Kalemleri</h3>
              <TrendingDown className="h-4 w-4 text-rose-600" />
            </div>
            <div className="space-y-2.5">
              {(gelirGiderSummary.kategori_dagilimi || [])
                .filter((k: any) => k.tip === 'GIDER')
                .sort((a: any, b: any) => b.toplam_cents - a.toplam_cents)
                .slice(0, 6)
                .map((k: any) => {
                  const pct =
                    liveSummary.giderCents > 0 ? Math.min(100, Math.round((k.toplam_cents / liveSummary.giderCents) * 100)) : 0;
                  return (
                    <div key={k.kategori}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="font-semibold text-slate-700">
                          {k.kategori} <span className="text-slate-400">({k.adet} işlem)</span>
                        </span>
                        <span className="font-bold text-rose-600">{formatMoney(k.toplam_cents)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.max(4, pct)}%` }} />
                      </div>
                    </div>
                  );
                })}
              {(gelirGiderSummary.kategori_dagilimi || []).filter((k: any) => k.tip === 'GIDER').length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">Bu dönemde gider kaydı yok.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ==================== SEKME 2: KASA & BANKA (e-Medrese Birebir + Banka Entegrasyonları) ====================
  const renderKasaBanka = () => {
    const toplamKasaCents = kasalar
      .filter((k) => k.is_active && k.currency === 'TRY')
      .reduce((sum, k) => sum + Number(k.balance_cents || 0), 0);
    const toplamBankaCents = bankaHesaplari
      .filter((b) => b.is_active && b.currency === 'TRY')
      .reduce((sum, b) => sum + Number(b.balance_cents || 0), 0);
    const toplamVarlikCents = toplamKasaCents + toplamBankaCents;

    const q = kbFilters.search.trim().toLowerCase();
    const filteredKasalar = siraliKasalar
      .filter((k) => {
        if (kbFilters.kasaId && k.id !== kbFilters.kasaId) return false;
        if (q && !`${k.name || ''}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if (kbSort === 'bakiye_desc') return b.balance_cents - a.balance_cents;
        if (kbSort === 'bakiye_asc') return a.balance_cents - b.balance_cents;
        if (kbSort === 'ad_asc') return (a.name || '').localeCompare(b.name || '', 'tr');
        if (kbSort === 'ad_desc') return (b.name || '').localeCompare(a.name || '', 'tr');
        return 0;
      });

    const filteredBankalar = siraliBankaHesaplari
      .filter((b) => {
        if (kbFilters.bankaId && b.id !== kbFilters.bankaId) return false;
        if (q && !`${b.name || ''} ${b.bank_name || ''} ${b.iban || ''}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if (kbSort === 'bakiye_desc') return b.balance_cents - a.balance_cents;
        if (kbSort === 'bakiye_asc') return a.balance_cents - b.balance_cents;
        if (kbSort === 'ad_asc') return (a.name || '').localeCompare(b.name || '', 'tr');
        if (kbSort === 'ad_desc') return (b.name || '').localeCompare(a.name || '', 'tr');
        return 0;
      });

    return (
      <div className="flex flex-col gap-6">
        {/* 1. Hesap Özeti & 4'lü GlobalStatCard */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-600">Kasa & Banka</p>
              <h2 className="mt-1 text-lg font-black tracking-tight text-slate-950">Hesap Özeti</h2>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <GlobalStatCard
              id="kasa"
              title="Toplam Kasa"
              value={formatMoney(toplamKasaCents)}
              subtitle={`${kasalar.filter((k) => k.is_active).length}/${kasalar.length} aktif`}
              icon={<Wallet className="h-5 w-5" />}
              gradient="from-emerald-500 to-teal-600"
              onClick={() =>
                setStatModal({
                  isOpen: true,
                  title: 'Kasa Bakiyeleri',
                  items: siraliKasalar.map((k) => ({
                    label: k.name,
                    value: formatMoney(k.balance_cents, k.currency),
                    sub: k.is_active ? 'Aktif' : 'Pasif',
                    color: 'emerald',
                  })),
                })
              }
            />
            <GlobalStatCard
              id="banka"
              title="Toplam Banka"
              value={formatMoney(toplamBankaCents)}
              subtitle={`${bankaHesaplari.filter((b) => b.is_active).length}/${bankaHesaplari.length} aktif`}
              icon={<Landmark className="h-5 w-5" />}
              gradient="from-blue-500 to-cyan-600"
              onClick={() =>
                setStatModal({
                  isOpen: true,
                  title: 'Banka & POS Hesap Detayları',
                  items: siraliBankaHesaplari.map((b) => ({
                    label: `${b.name} ${b.bank_name ? `(${b.bank_name})` : ''}`,
                    value: formatMoney(b.balance_cents, b.currency),
                    sub: b.iban ? formatIban(b.iban) : b.kind_label,
                    color: 'blue',
                  })),
                })
              }
            />
            <GlobalStatCard
              id="toplam_varlik"
              title="Toplam Varlık"
              value={formatMoney(toplamVarlikCents)}
              subtitle="Kasa + Banka (TL)"
              icon={<span className="text-base font-black">₺</span>}
              gradient="from-indigo-500 to-purple-600"
            />
            <GlobalStatCard
              id="kasa_hareket"
              title="Dönem İşlem"
              value={liveSummary.toplamKayit}
              subtitle={`${formatMoney(liveSummary.gelirCents)} giriş / ${formatMoney(liveSummary.giderCents)} çıkış`}
              icon={<Activity className="h-5 w-5" />}
              gradient="from-amber-500 to-orange-600"
            />
          </div>
        </div>

        {/* 2. Arama + Sıralama + Yeni Kasa / Yeni Banka Butonları */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <ResponsiveDataToolbar
            search={{
              value: kbFilters.search,
              onChange: (val) => setKbFilters((p) => ({ ...p, search: val })),
              placeholder: 'Kasa adı, banka, IBAN veya açıklama ara…',
            }}
            sort={{
              value: kbSort,
              onChange: setKbSort,
              options: KASA_BANKA_SORT_OPTIONS,
            }}
            extraActions={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingAccount(null);
                    setAccountForm({
                      kind: 'cash',
                      name: '',
                      currency: 'TRY',
                      bank_name: '',
                      iban: '',
                      opening_balance: '0',
                      default_for: '',
                      is_active: true,
                    });
                    setShowAccountModal(true);
                  }}
                  className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700"
                >
                  <Plus className="h-4 w-4" /> Yeni Kasa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingAccount(null);
                    setAccountForm({
                      kind: 'bank',
                      name: '',
                      currency: 'TRY',
                      bank_name: '',
                      iban: '',
                      opening_balance: '0',
                      default_for: '',
                      is_active: true,
                    });
                    setShowAccountModal(true);
                  }}
                  className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" /> Yeni Banka Hesabı
                </button>
              </div>
            }
          />
        </section>

        {/* 3. Sekme Çubuğu */}
        {renderTabNavigation()}

        {/* 4. Banka Hesapları Tablosu (Sürükle-Bırak + 12 Renk Seçici + Banka Logosu + IBAN Kopyala + Mutabakat Çekmecesi) */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 p-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Banka & POS Hesapları</h3>
              <p className="text-xs text-slate-500">
                Satırları sürükleyerek veya oklarla sıralayabilir, renk seçebilir ve &ldquo;Hareketler &amp; Mutabakat&rdquo; ile ekstre kontrolü yapabilirsiniz.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingAccount(null);
                setAccountForm({
                  kind: 'bank',
                  name: '',
                  currency: 'TRY',
                  bank_name: '',
                  iban: '',
                  opening_balance: '0',
                  default_for: '',
                  is_active: true,
                });
                setShowAccountModal(true);
              }}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> Yeni Hesap Ekle
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600">
                <tr>
                  <th className="w-10 px-2 py-3 text-center" aria-label="Sıralama" />
                  <th className="px-4 py-3">Banka / Hesap Adı</th>
                  <th className="px-4 py-3">IBAN</th>
                  <th className="px-4 py-3 text-center">Varsayılan / Otomasyon</th>
                  <th className="px-4 py-3 text-right">Başlangıç</th>
                  <th className="px-4 py-3 text-right">Güncel Bakiye</th>
                  <th className="px-4 py-3 text-center">Durum</th>
                  <th className="px-4 py-3 text-center">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredBankalar.map((banka, idx) => (
                  <tr
                    key={banka.id}
                    draggable={kbSort === 'custom'}
                    onDragStart={() => setDraggedAccountId(banka.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (draggedAccountId) handleReorderAccount('banka', draggedAccountId, banka.id);
                      setDraggedAccountId(null);
                    }}
                    className="hover:bg-slate-50"
                  >
                    <td className="w-10 px-2 py-3 text-center">
                      <div className="flex items-center justify-center gap-0.5 text-slate-400">
                        <GripVertical className="h-4 w-4 cursor-grab" />
                        <div className="flex flex-col">
                          {idx > 0 ? (
                            <button
                              type="button"
                              onClick={() => handleReorderAccount('banka', banka.id, filteredBankalar[idx - 1].id)}
                              className="cursor-pointer hover:text-slate-700"
                              title="Yukarı Taşı"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                          ) : null}
                          {idx < filteredBankalar.length - 1 ? (
                            <button
                              type="button"
                              onClick={() => handleReorderAccount('banka', banka.id, filteredBankalar[idx + 1].id)}
                              className="cursor-pointer hover:text-slate-700"
                              title="Aşağı Taşı"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {getBankLogoOrIcon(banka.bank_name || banka.name)}
                        <div>
                          <p className="font-bold text-slate-900">{banka.name}</p>
                          <p className="text-xs text-slate-500">
                            {banka.bank_name || banka.kind_label} · {banka.currency}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {banka.iban ? (
                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-700">
                          <span>{formatIban(banka.iban)}</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(banka.iban);
                              flash('ok', 'IBAN panoya kopyalandı');
                            }}
                            title="IBAN Kopyala"
                            className="cursor-pointer text-slate-400 hover:text-emerald-600"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        {banka.default_for ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                            Varsayılan ({banka.default_for === 'bank_transfer' ? 'Havale' : banka.default_for === 'credit_card' ? 'Kart/POS' : 'Nakit'})
                          </span>
                        ) : null}
                        {banka.bank_account_id ? (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                            Otomasyon Bağlı
                          </span>
                        ) : null}
                        {!banka.default_for && !banka.bank_account_id ? (
                          <span className="text-xs text-slate-400">-</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                      {formatMoney(banka.opening_balance_cents, banka.currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-blue-600 tabular-nums">
                      {formatMoney(banka.balance_cents, banka.currency)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          banka.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {banka.is_active ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <HesapRenkSecici
                          tur="banka"
                          hesapId={banka.id}
                          hesapAdi={banka.name}
                          renkler={hesapGorunumu.renkler}
                          onSelect={(r) => handleHesapRengi('banka', banka.id, r)}
                        />
                        <button
                          type="button"
                          onClick={() => openStatement(banka.id)}
                          title="Banka Hareketleri ve Mutabakat"
                          className="cursor-pointer rounded p-1.5 text-slate-600 hover:bg-slate-100"
                        >
                          <List className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAccount(banka);
                            setAccountForm({
                              kind: banka.kind,
                              name: banka.name,
                              currency: banka.currency,
                              bank_name: banka.bank_name || '',
                              iban: banka.iban || '',
                              opening_balance: (banka.opening_balance_cents / 100).toFixed(2),
                              default_for: banka.default_for || '',
                              is_active: banka.is_active,
                            });
                            setShowAccountModal(true);
                          }}
                          title="Düzenle"
                          className="cursor-pointer rounded p-1.5 text-blue-600 hover:bg-blue-50"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAccount(banka)}
                          title="Sil / Pasife Al"
                          className="cursor-pointer rounded p-1.5 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredBankalar.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-sm text-slate-500">
                      Banka hesabı bulunamadı.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* 5. Kasalar Tablosu */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 p-4">
            <h3 className="text-lg font-bold text-slate-900">Kasalar</h3>
            <button
              type="button"
              onClick={() => {
                setEditingAccount(null);
                setAccountForm({
                  kind: 'cash',
                  name: '',
                  currency: 'TRY',
                  bank_name: '',
                  iban: '',
                  opening_balance: '0',
                  default_for: '',
                  is_active: true,
                });
                setShowAccountModal(true);
              }}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" /> Yeni Kasa Ekle
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600">
                <tr>
                  <th className="w-10 px-2 py-3 text-center" aria-label="Sıralama" />
                  <th className="px-4 py-3">Kasa Adı</th>
                  <th className="px-4 py-3">Para Birimi</th>
                  <th className="px-4 py-3 text-right">Başlangıç Bakiyesi</th>
                  <th className="px-4 py-3 text-right">Güncel Bakiye</th>
                  <th className="px-4 py-3 text-center">Durum</th>
                  <th className="px-4 py-3 text-center">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredKasalar.map((kasa, idx) => (
                  <tr
                    key={kasa.id}
                    draggable={kbSort === 'custom'}
                    onDragStart={() => setDraggedAccountId(kasa.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (draggedAccountId) handleReorderAccount('kasa', draggedAccountId, kasa.id);
                      setDraggedAccountId(null);
                    }}
                    className="hover:bg-slate-50"
                  >
                    <td className="w-10 px-2 py-3 text-center">
                      <div className="flex items-center justify-center gap-0.5 text-slate-400">
                        <GripVertical className="h-4 w-4 cursor-grab" />
                        <div className="flex flex-col">
                          {idx > 0 ? (
                            <button
                              type="button"
                              onClick={() => handleReorderAccount('kasa', kasa.id, filteredKasalar[idx - 1].id)}
                              className="cursor-pointer hover:text-slate-700"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                          ) : null}
                          {idx < filteredKasalar.length - 1 ? (
                            <button
                              type="button"
                              onClick={() => handleReorderAccount('kasa', kasa.id, filteredKasalar[idx + 1].id)}
                              className="cursor-pointer hover:text-slate-700"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${getHesapRenkSinifi(
                            'kasa',
                            kasa.id,
                            kasa.name,
                            hesapGorunumu.renkler,
                          )}`}
                        >
                          <Wallet className="h-4 w-4" />
                        </div>
                        <div>
                          <span className="font-bold text-slate-900">{kasa.name}</span>
                          {kasa.default_for === 'cash' ? (
                            <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              Varsayılan Kasa
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-600">{kasa.currency}</td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                      {formatMoney(kasa.opening_balance_cents, kasa.currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-emerald-600 tabular-nums">
                      {formatMoney(kasa.balance_cents, kasa.currency)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          kasa.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {kasa.is_active ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <HesapRenkSecici
                          tur="kasa"
                          hesapId={kasa.id}
                          hesapAdi={kasa.name}
                          renkler={hesapGorunumu.renkler}
                          onSelect={(r) => handleHesapRengi('kasa', kasa.id, r)}
                        />
                        <button
                          type="button"
                          onClick={() => openStatement(kasa.id)}
                          title="Kasa Hareketleri ve Mutabakat"
                          className="cursor-pointer rounded p-1.5 text-slate-600 hover:bg-slate-100"
                        >
                          <List className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAccount(kasa);
                            setAccountForm({
                              kind: 'cash',
                              name: kasa.name,
                              currency: kasa.currency,
                              bank_name: '',
                              iban: '',
                              opening_balance: (kasa.opening_balance_cents / 100).toFixed(2),
                              default_for: kasa.default_for || '',
                              is_active: kasa.is_active,
                            });
                            setShowAccountModal(true);
                          }}
                          className="cursor-pointer rounded p-1.5 text-blue-600 hover:bg-blue-50"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAccount(kasa)}
                          className="cursor-pointer rounded p-1.5 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredKasalar.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                      Kasa bulunamadı.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* 6. Banka Web Servis Entegrasyonları & Akıllı Eşleştirme Kuralları */}
        <BankaEntegrasyonPanel onSynced={loadData} />
      </div>
    );
  };

  const activeTabMeta = TABS.find((t) => t.id === activeTab) || TABS[0];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1600px] space-y-6 p-3 pb-24 md:p-5 xl:p-6">
        {/* Bildirim Toast */}
        {flashMsg ? (
          <div
            className={`fixed right-5 top-5 z-50 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold shadow-lg ${
              flashMsg.kind === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            {flashMsg.kind === 'ok' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600" />
            )}
            <span>{flashMsg.text}</span>
          </div>
        ) : null}

        {/* 1. Üst Başlık Kartı (e-Medrese AppPageHeader birebir) */}
        <AppPageHeader
          eyebrow="Finans"
          title="Ön Muhasebe"
          meta={activeTabMeta.label}
          icon={<span className="text-xl font-black">₺</span>}
          actions={
            updating ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700">
                <RefreshCw className="h-3 w-3 animate-spin" /> Güncelleniyor…
              </span>
            ) : null
          }
        />

        {/* 2. Aktif Sekme İçeriği */}
        <div className="relative mt-4">
          {activeTab === 'gelir-gider' && renderGelirGider()}
          {activeTab === 'kasa-banka' && renderKasaBanka()}
          {activeTab === 'gelen-havaleler' && (
            <GelenHavalelerTab
              tabNavigation={renderTabNavigation()}
              onDataChanged={loadData}
              onUnmatchedCountChange={setUnmatchedTransferCount}
            />
          )}
        </div>
      </div>

      {/* ==================== MODALLAR VE ÇEKMECELER ==================== */}

      {/* 1. İstatistik Kartı Detay Modalı */}
      <MuhasebeStatModal
        isOpen={statModal.isOpen}
        onClose={() => setStatModal((p) => ({ ...p, isOpen: false }))}
        title={statModal.title}
        subtitle={statModal.subtitle}
        items={statModal.items}
      />

      {/* 2. Kasa / Banka Hareketleri ve Mutabakat Çekmecesi */}
      {statementDrawer.accountId ? (
        <BankaMutabakatDrawer
          statement={statementDrawer.data}
          loading={statementDrawer.loading}
          start={statementDrawer.start}
          end={statementDrawer.end}
          onDateChange={(s, e) => openStatement(statementDrawer.accountId!, s, e)}
          onDeleteManualEntry={async (entryId) => {
            try {
              await api.delete(`${BASE}/entries/${entryId}`);
              flash('ok', 'Hareket silindi');
              await openStatement(statementDrawer.accountId!, statementDrawer.start, statementDrawer.end);
              await loadData();
            } catch (err: any) {
              flash('err', err?.response?.data?.detail || 'Hareket silinemedi');
            }
          }}
          onClose={() => setStatementDrawer({ accountId: null, data: null, loading: false, start: monthStartISO(), end: todayISO() })}
        />
      ) : null}

      {/* 3. + Gelir Ekle / + Gider Ekle Modalı (e-Medrese 1:1 Birebir, Kayıt Yeri Hariç) */}
      {showGgModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">
                {editingGgItem ? 'İşlem Düzenle' : ggForm.islem_tipi === 'GELIR' ? 'Yeni Gelir' : 'Yeni Gider'}
              </h3>
              <button
                type="button"
                onClick={() => setShowGgModal(false)}
                className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGelirGider} className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                <div
                  className={`rounded-xl border p-3 ${
                    ggForm.islem_tipi === 'GELIR'
                      ? 'border-green-200 bg-green-50/70'
                      : 'border-red-200 bg-red-50/70'
                  }`}
                >
                  <p className="text-sm font-bold text-slate-800">
                    {ggForm.islem_tipi === 'GELIR' ? 'Gelir kaydı oluşturuluyor' : 'Gider kaydı oluşturuluyor'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    İşlem tipi, kategori ve miktar doğru girildiğinde kayıt otomatik finans özetine yansır.
                  </p>
                </div>

                {/* İşlem Tipi * + Kategori * (⚙️ Kategorileri Yönet + ➕ Yeni Kategori Ekle...) */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">İşlem Tipi *</label>
                    <select
                      value={ggForm.islem_tipi}
                      onChange={(e) => {
                        const yeniTip = e.target.value as 'GELIR' | 'GIDER';
                        setGgForm({
                          ...ggForm,
                          islem_tipi: yeniTip,
                          kategori: yeniTip === 'GELIR' ? 'Genel Bağış' : '',
                        });
                        setShowYeniKategoriInline(false);
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      <option value="GELIR">Gelir</option>
                      <option value="GIDER">Gider</option>
                    </select>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-700">Kategori *</label>
                      <button
                        type="button"
                        onClick={() => setShowKategoriYonetimModal(true)}
                        className="flex cursor-pointer items-center gap-0.5 text-[11px] font-medium text-teal-600 hover:underline"
                        title="Özel kategorileri yönet"
                      >
                        ⚙️ Kategorileri Yönet
                      </button>
                    </div>
                    <select
                      value={ggForm.kategori}
                      onChange={(e) => {
                        if (e.target.value === '__YENI__') {
                          setShowYeniKategoriInline(true);
                          setYeniKategoriAd('');
                        } else {
                          setGgForm({ ...ggForm, kategori: e.target.value });
                          setShowYeniKategoriInline(false);
                        }
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                      required
                    >
                      <option value="">Seçiniz</option>
                      {ggForm.islem_tipi === 'GELIR' ? (
                        <>
                          <optgroup label="Sistem Kategorileri">
                            {GELIR_KATEGORILERI.map((k) => (
                              <option key={k.value} value={k.value}>
                                {k.label}
                              </option>
                            ))}
                          </optgroup>
                          {ozelKategoriler.filter((k) => k.islem_tipi === 'GELIR').length > 0 ? (
                            <optgroup label="Özel Kategoriler">
                              {ozelKategoriler
                                .filter((k) => k.islem_tipi === 'GELIR')
                                .map((k) => (
                                  <option key={k.id} value={k.ad}>
                                    🏷️ {k.ad}
                                  </option>
                                ))}
                            </optgroup>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {GIDER_GRUPLARI.map((g) => (
                            <optgroup key={g.grup} label={g.grup}>
                              {g.items.map((a) => (
                                <option key={a.value} value={a.value}>
                                  {a.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                          {ozelKategoriler.filter((k) => k.islem_tipi === 'GIDER').length > 0 ? (
                            <optgroup label="Özel Kategoriler">
                              {ozelKategoriler
                                .filter((k) => k.islem_tipi === 'GIDER')
                                .map((k) => (
                                  <option key={k.id} value={k.ad}>
                                    🏷️ {k.ad}
                                  </option>
                                ))}
                            </optgroup>
                          ) : null}
                        </>
                      )}
                      <option value="__YENI__">➕ Yeni Kategori Ekle...</option>
                    </select>

                    {/* Yeni Kategori Satır İçi Giriş */}
                    {showYeniKategoriInline ? (
                      <div className="mt-2 flex items-center gap-1.5">
                        <input
                          type="text"
                          value={yeniKategoriAd}
                          onChange={(e) => setYeniKategoriAd(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleYeniKategoriKaydet();
                            }
                            if (e.key === 'Escape') {
                              setShowYeniKategoriInline(false);
                            }
                          }}
                          placeholder={`Yeni ${ggForm.islem_tipi === 'GELIR' ? 'gelir' : 'gider'} kategorisi adı...`}
                          className="flex-1 rounded-lg border border-teal-400 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => void handleYeniKategoriKaydet()}
                          disabled={!yeniKategoriAd.trim()}
                          className="cursor-pointer rounded-lg bg-teal-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                        >
                          Ekle
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowYeniKategoriInline(false)}
                          className="cursor-pointer rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Kişi/Kurum + Belge No */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Kişi/Kurum</label>
                    <input
                      type="text"
                      list="gg-cariler"
                      value={ggForm.kisi_adi}
                      onChange={(e) => setGgForm({ ...ggForm, kisi_adi: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                    <datalist id="gg-cariler">
                      {parties.map((p) => (
                        <option key={p.id} value={p.name} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Belge No</label>
                    <input
                      type="text"
                      value={ggForm.belge_no}
                      onChange={(e) => setGgForm({ ...ggForm, belge_no: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                  </div>
                </div>

                {/* Miktar * + Para Birimi * + Tarih * */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Miktar *</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">
                        {ggForm.para_birimi === 'TRY' ? 'TL' : ggForm.para_birimi === 'USD' ? '$' : '€'}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={ggForm.miktar}
                        onChange={(e) => setGgForm({ ...ggForm, miktar: e.target.value })}
                        placeholder="0,00"
                        className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm font-bold text-slate-900"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Para Birimi *</label>
                    <select
                      value={ggForm.para_birimi}
                      onChange={(e) => setGgForm({ ...ggForm, para_birimi: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                      required
                    >
                      <option value="TRY">TRY (TL)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Tarih *</label>
                    <input
                      type="date"
                      value={ggForm.tarih}
                      onChange={(e) => setGgForm({ ...ggForm, tarih: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                      required
                    />
                  </div>
                </div>

                {/* ÖDEME YÖNTEMİ (5 Butonlu e-Medrese Seçici) */}
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Ödeme Yöntemi
                  </label>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {ODEME_YONTEMLERI_GG.map((o) => {
                      const isActive = ggForm.odeme_yontemi === o.value;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => {
                            let nextAccountId = '';
                            if (o.value === 'NAKIT') {
                              nextAccountId =
                                siraliKasalar.find((k) => k.is_active)?.id || siraliKasalar[0]?.id || '';
                            } else if (o.value === 'BANKA' || o.value === 'KREDI_KARTI' || o.value === 'POS') {
                              nextAccountId =
                                siraliBankaHesaplari.find((b) => b.is_active)?.id ||
                                siraliBankaHesaplari[0]?.id ||
                                '';
                            }
                            setGgForm({
                              ...ggForm,
                              odeme_yontemi: o.value,
                              account_id: nextAccountId,
                            });
                          }}
                          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                            isActive
                              ? 'scale-105 border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-500/25'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-blue-400'
                          }`}
                        >
                          <span className="text-[11px] font-bold leading-tight">{o.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* KASA SEÇİMİ (Nakit seçiliyse) */}
                {ggForm.odeme_yontemi === 'NAKIT' ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        Kasa Seçimi
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAccount(null);
                          setAccountForm({
                            kind: 'cash',
                            name: '',
                            currency: ggForm.para_birimi || 'TRY',
                            bank_name: '',
                            iban: '',
                            opening_balance: '0',
                            default_for: '',
                            is_active: true,
                          });
                          setShowAccountModal(true);
                        }}
                        className="flex cursor-pointer items-center gap-0.5 text-[11px] font-medium text-teal-600 hover:underline"
                      >
                        <Plus className="h-3 w-3" /> Yeni Kasa
                      </button>
                    </div>
                    {siraliKasalar.length === 0 ? (
                      <div className="py-3 text-center text-xs text-slate-400">
                        Henüz kasa tanımlanmamış.{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAccount(null);
                            setAccountForm({
                              kind: 'cash',
                              name: '',
                              currency: 'TRY',
                              bank_name: '',
                              iban: '',
                              opening_balance: '0',
                              default_for: '',
                              is_active: true,
                            });
                            setShowAccountModal(true);
                          }}
                          className="cursor-pointer font-semibold text-teal-600 underline"
                        >
                          İlk kasayı oluşturun
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {siraliKasalar.map((kasa) => {
                          const isSelected = String(ggForm.account_id) === String(kasa.id);
                          return (
                            <button
                              key={kasa.id}
                              type="button"
                              onClick={() => setGgForm({ ...ggForm, account_id: String(kasa.id) })}
                              className={`flex cursor-pointer flex-col items-start rounded-xl border p-3 text-left transition-all ${
                                isSelected
                                  ? 'border-teal-600 bg-teal-600 text-white shadow-md shadow-teal-500/25'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-teal-400'
                              }`}
                            >
                              <div className="mb-1 flex items-center gap-1.5">
                                {renderKasaWithIcon(kasa.name, kasa.id)}
                              </div>
                              <span className={`text-[11px] ${isSelected ? 'text-teal-100' : 'text-slate-400'}`}>
                                Bakiye: {formatMoney(kasa.balance_cents, kasa.currency)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* BANKA HESABI SEÇİMİ (Banka Transferi / Kredi Kartı / POS seçiliyse) */}
                {ggForm.odeme_yontemi === 'BANKA' ||
                ggForm.odeme_yontemi === 'KREDI_KARTI' ||
                ggForm.odeme_yontemi === 'POS' ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        Banka Hesabı Seçimi
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAccount(null);
                          setAccountForm({
                            kind: ggForm.odeme_yontemi === 'POS' ? 'pos' : 'bank',
                            name: '',
                            currency: ggForm.para_birimi || 'TRY',
                            bank_name: '',
                            iban: '',
                            opening_balance: '0',
                            default_for: '',
                            is_active: true,
                          });
                          setShowAccountModal(true);
                        }}
                        className="flex cursor-pointer items-center gap-0.5 text-[11px] font-medium text-teal-600 hover:underline"
                      >
                        <Plus className="h-3 w-3" /> Yeni Banka Hesabı
                      </button>
                    </div>
                    {siraliBankaHesaplari.length === 0 ? (
                      <div className="py-3 text-center text-xs text-slate-400">
                        Henüz banka hesabı tanımlanmamış.{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAccount(null);
                            setAccountForm({
                              kind: 'bank',
                              name: '',
                              currency: 'TRY',
                              bank_name: '',
                              iban: '',
                              opening_balance: '0',
                              default_for: '',
                              is_active: true,
                            });
                            setShowAccountModal(true);
                          }}
                          className="cursor-pointer font-semibold text-teal-600 underline"
                        >
                          İlk banka hesabını oluşturun
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {siraliBankaHesaplari.map((b) => {
                          const isSelected = String(ggForm.account_id) === String(b.id);
                          const bankaRenkSinifi = getHesapRenkSinifi(
                            'banka',
                            b.id,
                            b.bank_name || b.name,
                            hesapGorunumu.renkler,
                          );
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => setGgForm({ ...ggForm, account_id: String(b.id) })}
                              className={`flex cursor-pointer flex-col items-start rounded-xl border p-3 text-left transition-all ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-500/25'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-blue-400'
                              }`}
                            >
                              <div className="mb-1 flex items-center gap-1.5">
                                <span className={`h-4 w-1.5 shrink-0 rounded-full border ${bankaRenkSinifi}`} />
                                {renderBankaWithLogo(b.bank_name || b.name)}
                                <span
                                  className={`ml-auto rounded px-1.5 py-0.5 text-[10px] ${
                                    isSelected ? 'bg-blue-500 text-blue-100' : 'bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  {b.name}
                                </span>
                              </div>
                              <span
                                className={`max-w-full truncate text-[10px] ${
                                  isSelected ? 'text-blue-200' : 'text-slate-400'
                                }`}
                              >
                                IBAN: {b.iban ? formatIban(b.iban) : 'Belirtilmemiş'}
                              </span>
                              <span
                                className={`mt-1 text-[11px] font-semibold ${
                                  isSelected ? 'text-blue-100' : 'text-slate-500'
                                }`}
                              >
                                Bakiye: {formatMoney(b.balance_cents, b.currency)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Açıklama */}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Açıklama</label>
                  <textarea
                    rows={2}
                    value={ggForm.aciklama}
                    onChange={(e) => setGgForm({ ...ggForm, aciklama: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowGgModal(false)}
                  className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={ggSubmitting}
                  className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${
                    ggForm.islem_tipi === 'GELIR'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {ggSubmitting ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* 3B. Kategori Yönetimi Modalı (e-Medrese Birebir) */}
      {showKategoriYonetimModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">Özel Kategori Yönetimi</h3>
              <button
                type="button"
                onClick={() => {
                  setShowKategoriYonetimModal(false);
                  setEditingKategoriId(null);
                  setDeletingKategoriId(null);
                }}
                className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {/* Yeni Özel Kategori Ekleme Kutusu */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="mb-1.5 block text-xs font-bold text-slate-700">
                  Yeni Özel Kategori Ekle ({ggForm.islem_tipi === 'GELIR' ? 'Gelir' : 'Gider'})
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={yeniKategoriAd}
                    onChange={(e) => setYeniKategoriAd(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleYeniKategoriKaydet();
                      }
                    }}
                    placeholder="Kategori adı yazın..."
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => void handleYeniKategoriKaydet('GELIR')}
                    disabled={!yeniKategoriAd.trim()}
                    className="cursor-pointer rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    + Gelir
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleYeniKategoriKaydet('GIDER')}
                    disabled={!yeniKategoriAd.trim()}
                    className="cursor-pointer rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    + Gider
                  </button>
                </div>
              </div>

              {ozelKategoriler.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400">
                  Henüz özel kategori eklenmemiş.
                  <p className="mt-1 text-xs">
                    Yukarıdaki alandan veya kategori seçicisindeki &ldquo;➕ Yeni Kategori Ekle...&rdquo; seçeneğinden ekleyebilirsiniz.
                  </p>
                </div>
              ) : (
                <>
                  {(['GELIR', 'GIDER'] as const).map((tip) => {
                    const list = ozelKategoriler.filter((k) => k.islem_tipi === tip);
                    if (list.length === 0) return null;
                    return (
                      <div key={tip}>
                        <h4
                          className={`mb-2 text-xs font-bold uppercase tracking-wider ${
                            tip === 'GELIR' ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {tip === 'GELIR' ? '📈 Gelir Kategorileri' : '📉 Gider Kategorileri'} ({list.length})
                        </h4>
                        <div className="space-y-1.5">
                          {list.map((k) => (
                            <div
                              key={k.id}
                              className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                            >
                              {editingKategoriId === k.id ? (
                                <div className="flex flex-1 items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={editingKategoriAd}
                                    onChange={(e) => setEditingKategoriAd(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') void handleKategoriDuzenle(k.id);
                                      if (e.key === 'Escape') setEditingKategoriId(null);
                                    }}
                                    className="flex-1 rounded border border-teal-400 bg-white px-2 py-1 text-xs text-slate-900"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void handleKategoriDuzenle(k.id)}
                                    className="cursor-pointer rounded bg-teal-600 px-2 py-1 text-xs font-semibold text-white hover:bg-teal-700"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingKategoriId(null)}
                                    className="cursor-pointer rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-500"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : deletingKategoriId === k.id ? (
                                <div className="flex flex-1 items-center justify-between">
                                  <span className="text-xs font-medium text-red-600">
                                    &ldquo;{k.ad}&rdquo; silinsin mi?
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => void handleKategoriSil(k.id)}
                                      className="cursor-pointer rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                                    >
                                      Evet, Sil
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeletingKategoriId(null)}
                                      className="cursor-pointer rounded border border-slate-300 px-2 py-1 text-xs text-slate-600"
                                    >
                                      Hayır
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <span className="text-sm font-medium text-slate-800">🏷️ {k.ad}</span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingKategoriId(k.id);
                                        setEditingKategoriAd(k.ad);
                                        setDeletingKategoriId(null);
                                      }}
                                      className="cursor-pointer rounded p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                                      title="Düzenle"
                                    >
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDeletingKategoriId(k.id);
                                        setEditingKategoriId(null);
                                      }}
                                      className="cursor-pointer rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                      title="Sil"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            <div className="flex justify-end border-t border-slate-200 px-6 py-3">
              <button
                type="button"
                onClick={() => {
                  setShowKategoriYonetimModal(false);
                  setEditingKategoriId(null);
                  setDeletingKategoriId(null);
                }}
                className="cursor-pointer rounded-lg border border-slate-300 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 4. Finans Kaydını İptal Et Modalı (e-Medrese Birebir) */}
      {cancelTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">Finans Kaydını İptal Et</h3>
              <p className="mt-1 text-xs text-slate-600">
                Kayıt iptal sebebiyle birlikte denetim geçmişinde saklanır ve hesap bakiyesinden düşülür.
              </p>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700">
                <div className="font-bold">{cancelTarget.kategori}</div>
                <div className="mt-0.5 text-slate-500">
                  {cancelTarget.islem_tipi_display} · {formatMoney(cancelTarget.miktar_cents, cancelTarget.para_birimi)} ·{' '}
                  {formatDateTR(cancelTarget.tarih)}
                </div>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700">İptal Sebebi *</span>
                <textarea
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Örn: Tutar hatalı girildi, mükerrer kayıt, yanlış hesap seçildi…"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-rose-500"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={cancelSubmitting || cancelReason.trim().length < 3}
                onClick={handleConfirmCancelGg}
                className="cursor-pointer rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {cancelSubmitting ? 'İptal ediliyor…' : 'Kaydı İptal Et'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 5. ⇄ Kasa / Banka Devir İşlemleri (Virman) Modalı */}
      {showTransferModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleSaveTransfer} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Kasa / Banka Devir İşlemi (Virman)</h3>
              <button type="button" onClick={() => setShowTransferModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Gönderen Hesap (Çıkış) *</label>
                <select
                  required
                  value={transferForm.from_account_id}
                  onChange={(e) => setTransferForm({ ...transferForm, from_account_id: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Seçiniz…</option>
                  {accounts
                    .filter((a) => a.is_active)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatMoney(a.balance_cents, a.currency)})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Alıcı Hesap (Giriş) *</label>
                <select
                  required
                  value={transferForm.to_account_id}
                  onChange={(e) => setTransferForm({ ...transferForm, to_account_id: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Seçiniz…</option>
                  {accounts
                    .filter((a) => a.is_active && a.id !== transferForm.from_account_id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatMoney(a.balance_cents, a.currency)})
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Miktar *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={transferForm.miktar}
                    onChange={(e) => setTransferForm({ ...transferForm, miktar: e.target.value })}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Tarih *</label>
                  <input
                    type="date"
                    required
                    value={transferForm.tarih}
                    onChange={(e) => setTransferForm({ ...transferForm, tarih: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Açıklama</label>
                <input
                  value={transferForm.aciklama}
                  onChange={(e) => setTransferForm({ ...transferForm, aciklama: e.target.value })}
                  placeholder="Örn: Kasadan bankaya nakit yatırma"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={transferSubmitting}
                className="cursor-pointer rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {transferSubmitting ? 'Aktarılıyor…' : 'Devir İşlemini Tamamla'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* 6. Kasa / Banka Ekle-Düzenle Modalı */}
      {showAccountModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleSaveAccount} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingAccount
                  ? 'Hesap Düzenle'
                  : accountForm.kind === 'cash'
                    ? 'Yeni Kasa Ekle'
                    : 'Yeni Banka / POS Hesabı Ekle'}
              </h3>
              <button type="button" onClick={() => setShowAccountModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Hesap Türü</label>
                  <select
                    value={accountForm.kind}
                    onChange={(e) => setAccountForm({ ...accountForm, kind: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="cash">Kasa (Nakit)</option>
                    <option value="bank">Banka Hesabı</option>
                    <option value="pos">POS / Sanal POS</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Para Birimi</label>
                  <select
                    value={accountForm.currency}
                    onChange={(e) => setAccountForm({ ...accountForm, currency: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    {Object.keys(CURRENCY_SYMBOLS).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Hesap / Kasa Adı *</label>
                <input
                  required
                  value={accountForm.name}
                  onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                  placeholder={accountForm.kind === 'cash' ? 'Örn: Merkez Kasa' : 'Örn: Kuveyt Türk Bağış TL'}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              {accountForm.kind !== 'cash' ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Banka Adı</label>
                    <input
                      value={accountForm.bank_name}
                      onChange={(e) => setAccountForm({ ...accountForm, bank_name: e.target.value })}
                      placeholder="Örn: Vakıf Katılım, Ziraat, Kuveyt Türk"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">IBAN</label>
                    <input
                      value={accountForm.iban}
                      onChange={(e) => setAccountForm({ ...accountForm, iban: e.target.value })}
                      placeholder="TR00 0000 0000 0000 0000 0000 00"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm"
                    />
                  </div>
                </>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Başlangıç Bakiyesi</label>
                  <input
                    type="number"
                    step="0.01"
                    value={accountForm.opening_balance}
                    onChange={(e) => setAccountForm({ ...accountForm, opening_balance: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Otomatik Bağış Yönü</label>
                  <select
                    value={accountForm.default_for}
                    onChange={(e) => setAccountForm({ ...accountForm, default_for: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Varsayılan Değil</option>
                    <option value="cash">Nakit Bağışlar</option>
                    <option value="bank_transfer">Banka Havaleleri</option>
                    <option value="credit_card">Kredi Kartı / POS</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAccountModal(false)}
                className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                className="cursor-pointer rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                Kaydet
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
