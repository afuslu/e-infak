'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Loader2,
  PlugZap,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/axios';
import { getBankLogoOrIcon } from './hesapGorunum';

interface BankField {
  key: string;
  label: string;
  secret: boolean;
  optional?: boolean;
}

interface BankInfo {
  key: string;
  label: string;
  ready: boolean;
  account_no_label?: string | null;
  can_test?: boolean;
  min_interval_minutes?: number | null;
  fields: BankField[];
  values: Record<string, string>;
  configured: boolean;
}

interface BankAccountRow {
  id: string;
  bank_key: string;
  bank: string;
  ready: boolean;
  label: string;
  iban?: string | null;
  account_no?: string | null;
  currency: string;
  enabled: boolean;
  auto_approve: boolean;
  default_campaign_id?: string | null;
  last_synced_at?: string | null;
  last_error?: string | null;
}

interface RuleRow {
  id: string;
  kind: 'keyword' | 'sender';
  pattern: string;
  hits: number;
  source: string;
  donor_name?: string | null;
  campaign_title?: string | null;
}

interface TestResult {
  ok: boolean;
  warning?: string | null;
  iban?: string | null;
  balance_cents?: number | null;
  currency?: string;
  branch?: string | null;
  alias?: string | null;
  error?: string;
  accounts?: Array<{
    suffix?: string | null;
    iban?: string | null;
    alias?: string | null;
    currency?: string;
    balance_cents?: number | null;
    active?: boolean;
  }> | null;
}

export interface BankaEntegrasyonPanelProps {
  onSynced?: () => void;
  /** Which section starts open (the Banka & Ödeme page opens the web service section). */
  defaultOpen?: 'none' | 'api' | 'rules';
}

const formatSyncTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

const formatMoney = (cents?: number | null, currency = 'TRY') =>
  cents == null ? '-' : (cents / 100).toLocaleString('tr-TR', { style: 'currency', currency });

export const BankaEntegrasyonPanel: React.FC<BankaEntegrasyonPanelProps> = ({ onSynced, defaultOpen = 'none' }) => {
  const [openSection, setOpenSection] = useState<'none' | 'api' | 'rules'>(defaultOpen);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [banks, setBanks] = useState<BankInfo[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [senderRules, setSenderRules] = useState<RuleRow[]>([]);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; title: string }>>([]);
  const [credModal, setCredModal] = useState<BankInfo | null>(null);
  const [credForm, setCredForm] = useState<Record<string, string>>({});
  const [newAccOpen, setNewAccOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccountRow | null>(null);
  const [accForm, setAccForm] = useState({
    bank_key: 'vakifkatilim',
    label: '',
    iban: '',
    account_no: '',
    currency: 'TRY',
    auto_approve: false,
    default_campaign_id: '',
  });
  const [rulePattern, setRulePattern] = useState('');
  const [ruleCampaignId, setRuleCampaignId] = useState('');
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const flash = (kind: 'ok' | 'err', text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const loadAll = useCallback(async () => {
    try {
      const [bRes, aRes, kwRes, snRes, cRes] = await Promise.all([
        api.get('/admin/banks').catch(() => ({ data: [] })),
        api.get('/admin/bank-accounts').catch(() => ({ data: [] })),
        api.get('/admin/bank-match-rules', { params: { kind: 'keyword' } }).catch(() => ({ data: [] })),
        api.get('/admin/bank-match-rules', { params: { kind: 'sender' } }).catch(() => ({ data: [] })),
        api.get('/campaigns', { params: { page_size: 100 } }).catch(() => ({ data: { items: [] } })),
      ]);
      setBanks(bRes.data || []);
      setBankAccounts(aRes.data || []);
      setRules(kwRes.data || []);
      setSenderRules(snRes.data || []);
      const cList = cRes.data?.items || cRes.data || [];
      setCampaigns(cList.map((c: any) => ({ id: c.id, title: c.title })));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const syncAccountNow = async (accId: string) => {
    setSyncingId(accId);
    try {
      const res = await api.post(`/admin/bank-accounts/${accId}/sync`);
      flash('ok', `Banka hareketleri çekildi (${res.data?.new ?? 0} yeni hareket, ${res.data?.fetched ?? 0} hareket okundu)`);
      await loadAll();
      onSynced?.();
    } catch (e: any) {
      flash('err', e?.response?.data?.detail || 'Senkronizasyon başarısız');
    } finally {
      setSyncingId(null);
    }
  };

  const testAccount = async (accId: string) => {
    setTestingId(accId);
    try {
      const res = await api.post(`/admin/bank-accounts/${accId}/test`);
      setTestResults((prev) => ({ ...prev, [accId]: res.data }));
    } catch (e: any) {
      setTestResults((prev) => ({ ...prev, [accId]: { ok: false, error: e?.response?.data?.detail || 'Bağlantı testi başarısız' } }));
    } finally {
      setTestingId(null);
    }
  };

  const bankOf = (key: string) => banks.find((b) => b.key === key);
  const selectedBank = bankOf(accForm.bank_key);

  const saveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credModal) return;
    setSaving(true);
    try {
      await api.put(`/admin/banks/${credModal.key}/credentials`, { values: credForm });
      flash('ok', `${credModal.label} API bilgileri kaydedildi`);
      setCredModal(null);
      await loadAll();
    } catch (err: any) {
      flash('err', err?.response?.data?.detail || 'API bilgileri kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const createBankSyncAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...accForm, default_campaign_id: accForm.default_campaign_id || null };
      if (editing) {
        await api.patch(`/admin/bank-accounts/${editing.id}`, { ...payload, enabled: editing.enabled });
        flash('ok', 'Banka hesabı güncellendi');
      } else {
        await api.post('/admin/bank-accounts', payload);
        flash('ok', 'Otomatik banka entegrasyon hesabı eklendi ve Kasa & Banka listesiyle eşitlendi');
      }
      setNewAccOpen(false);
      setEditing(null);
      setAccForm({
        bank_key: banks[0]?.key || 'vakifkatilim',
        label: '',
        iban: '',
        account_no: '',
        currency: 'TRY',
        auto_approve: false,
        default_campaign_id: '',
      });
      await loadAll();
      onSynced?.();
    } catch (err: any) {
      flash('err', err?.response?.data?.detail || 'Hesap eklenemedi');
    } finally {
      setSaving(false);
    }
  };

  const addKeywordRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rulePattern.trim() || !ruleCampaignId) return;
    try {
      await api.post('/admin/bank-match-rules', {
        pattern: rulePattern.trim(),
        campaign_id: ruleCampaignId,
      });
      setRulePattern('');
      flash('ok', 'Akıllı eşleştirme kuralı eklendi');
      await loadAll();
    } catch (err: any) {
      flash('err', err?.response?.data?.detail || 'Kural eklenemedi');
    }
  };

  const deleteRule = async (id: string) => {
    try {
      await api.delete(`/admin/bank-match-rules/${id}`);
      await loadAll();
    } catch (err: any) {
      flash('err', err?.response?.data?.detail || 'Kural silinemedi');
    }
  };

  return (
    <div className="space-y-4">
      {msg ? (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold ${
            msg.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {msg.kind === 'ok' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-600" />}
          {msg.text}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 1. Banka Web Servis & Otomatik Senkronizasyon */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setOpenSection((cur) => (cur === 'api' ? 'none' : 'api'))}
            className="flex w-full cursor-pointer items-center justify-between p-4 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Banka Web Servis Entegrasyonları ({bankAccounts.length} aktif kanal)
                </h3>
                <p className="text-xs text-slate-500">
                  Vakıf Katılım, Kuveyt Türk, Ziraat, Albaraka vb. otomatik hareket çekme ayarları
                </p>
              </div>
            </div>
            {openSection === 'api' ? (
              <ChevronUp className="h-5 w-5 text-slate-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-slate-400" />
            )}
          </button>

          {openSection === 'api' ? (
            <div className="space-y-4 border-t border-slate-100 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Banka API Kanalları</p>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setAccForm({
                      bank_key: banks.find((b) => b.ready)?.key || banks[0]?.key || 'vakifkatilim',
                      label: '',
                      iban: '',
                      account_no: '',
                      currency: 'TRY',
                      auto_approve: false,
                      default_campaign_id: '',
                    });
                    setNewAccOpen(true);
                  }}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Otomasyon Hesabı Bağla
                </button>
              </div>

              {bankAccounts.length > 0 ? (
                <div className="space-y-2">
                  {bankAccounts.map((ba) => (
                    <div
                      key={ba.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                    >
                      <div className="flex items-center gap-2.5">
                        {getBankLogoOrIcon(ba.bank, 'w-7 h-7')}
                        <div>
                          <p className="text-xs font-bold text-slate-900">
                            {ba.label} <span className="font-normal text-slate-500">({ba.bank})</span>
                          </p>
                          <p className="font-mono text-[11px] text-slate-500">
                            {ba.iban || '-'}
                            {ba.account_no ? <span className="ml-2 font-sans">· Ek no: {ba.account_no}</span> : null}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {!ba.ready
                              ? 'Bu banka için otomatik çekme henüz yok; ekstreyi Excel olarak yükleyin'
                              : formatSyncTime(ba.last_synced_at)
                                ? `Son çekme: ${formatSyncTime(ba.last_synced_at)}`
                                : 'Henüz çekilmedi'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(ba);
                            setAccForm({
                              bank_key: ba.bank_key,
                              label: ba.label,
                              iban: ba.iban || '',
                              account_no: ba.account_no || '',
                              currency: ba.currency,
                              auto_approve: ba.auto_approve,
                              default_campaign_id: ba.default_campaign_id || '',
                            });
                            setNewAccOpen(true);
                          }}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                        >
                          <Settings className="h-3.5 w-3.5" /> Düzenle
                        </button>
                        {bankOf(ba.bank_key)?.can_test ? (
                          <button
                            type="button"
                            disabled={testingId === ba.id}
                            onClick={() => testAccount(ba.id)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {testingId === ba.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <PlugZap className="h-3.5 w-3.5" />
                            )}
                            Bağlantıyı Test Et
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={syncingId === ba.id}
                          onClick={() => syncAccountNow(ba.id)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                        >
                          {syncingId === ba.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          Şimdi Çek
                        </button>
                      </div>
                      {ba.last_error ? (
                        <p className="w-full rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-800">
                          Son hata: {ba.last_error}
                        </p>
                      ) : null}
                      {testResults[ba.id] ? (
                        <div
                          className={`w-full rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                            testResults[ba.id].error
                              ? 'bg-rose-50 text-rose-800'
                              : testResults[ba.id].ok
                                ? 'bg-emerald-50 text-emerald-900'
                                : 'bg-amber-50 text-amber-900'
                          }`}
                        >
                          {testResults[ba.id].error ? (
                            <span className="text-rose-800">{testResults[ba.id].error}</span>
                          ) : (
                            <>
                              Bağlantı başarılı · IBAN: <span className="font-mono">{testResults[ba.id].iban || '-'}</span> · Bakiye:{' '}
                              {formatMoney(testResults[ba.id].balance_cents, testResults[ba.id].currency || 'TRY')}
                              {testResults[ba.id].branch ? ` · Şube: ${testResults[ba.id].branch}` : ''}
                              {testResults[ba.id].warning ? <span className="block">⚠ {testResults[ba.id].warning}</span> : null}
                            </>
                          )}
                          {testResults[ba.id].accounts?.length ? (
                            <div className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-white text-slate-700">
                              <p className="px-2 pt-1.5 font-bold">Bankadaki hesaplarınız (ek no&apos;yu buradan seçin):</p>
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr className="text-left text-slate-500">
                                    <th className="px-2 py-1">Ek no</th>
                                    <th className="px-2 py-1">IBAN</th>
                                    <th className="px-2 py-1">Hesap</th>
                                    <th className="px-2 py-1 text-right">Bakiye</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {testResults[ba.id].accounts!.map((a) => (
                                    <tr key={`${a.suffix}-${a.iban}`} className="border-t border-slate-100">
                                      <td className="px-2 py-1 font-bold">{a.suffix}</td>
                                      <td className="px-2 py-1 font-mono">{a.iban || '-'}</td>
                                      <td className="px-2 py-1">
                                        {a.alias || '-'} · {a.currency}
                                        {a.active === false ? ' (kapalı)' : ''}
                                      </td>
                                      <td className="px-2 py-1 text-right">{formatMoney(a.balance_cents, a.currency || 'TRY')}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {banks.map((b) => (
                  <div
                    key={b.key}
                    className="flex items-center justify-between rounded-xl border border-slate-200 p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      {getBankLogoOrIcon(b.label, 'w-6 h-6')}
                      <div>
                        <p className="text-xs font-bold text-slate-800">{b.label}</p>
                        <p className="text-[11px] text-slate-500">
                          {!b.ready ? 'Ekstre yükleme ile' : b.configured ? 'API Tanımlı' : 'Tanımlanmadı'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCredModal(b);
                        // Secrets come back masked: leave them blank (blank keeps the stored value).
                        setCredForm(
                          Object.fromEntries(b.fields.map((f) => [f.key, f.secret ? '' : (b.values || {})[f.key] || ''])),
                        );
                      }}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Settings className="h-3.5 w-3.5" /> Ayarla
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* 2. Akıllı Eşleştirme Kuralları (Kelime & Gönderen) */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setOpenSection((cur) => (cur === 'rules' ? 'none' : 'rules'))}
            className="flex w-full cursor-pointer items-center justify-between p-4 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Akıllı Havale Eşleştirme Kuralları ({rules.length + senderRules.length} kural)
                </h3>
                <p className="text-xs text-slate-500">
                  Açıklamadaki kelimelere ve gönderen adına göre otomatik kampanya/bağışçı eşleştirme
                </p>
              </div>
            </div>
            {openSection === 'rules' ? (
              <ChevronUp className="h-5 w-5 text-slate-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-slate-400" />
            )}
          </button>

          {openSection === 'rules' ? (
            <div className="space-y-4 border-t border-slate-100 p-4">
              <form onSubmit={addKeywordRule} className="flex flex-wrap gap-2">
                <input
                  value={rulePattern}
                  onChange={(e) => setRulePattern(e.target.value)}
                  placeholder="Açıklamada geçen kelime (örn: zekat, medrese, gazze)"
                  className="h-9 min-w-[180px] flex-1 rounded-lg border border-slate-300 px-2.5 text-xs font-medium"
                />
                <select
                  value={ruleCampaignId}
                  onChange={(e) => setRuleCampaignId(e.target.value)}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold"
                >
                  <option value="">Kampanya seçin…</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="cursor-pointer rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  Kural Ekle
                </button>
              </form>

              <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                {rules.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <div>
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono font-bold text-emerald-800">
                        &ldquo;{r.pattern}&rdquo;
                      </span>
                      <span className="mx-1.5 text-slate-400">→</span>
                      <span className="font-semibold text-slate-800">{r.campaign_title}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteRule(r.id)}
                      className="cursor-pointer rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {senderRules.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <div>
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-800">
                        Gönderen: {r.pattern}
                      </span>
                      <span className="mx-1.5 text-slate-400">→</span>
                      <span className="font-semibold text-slate-800">{r.donor_name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteRule(r.id)}
                      className="cursor-pointer rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {rules.length === 0 && senderRules.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">Henüz tanımlı eşleştirme kuralı yok.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* API Credentials Modal */}
      {credModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={saveCredentials} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">{credModal.label} Web Servis Bilgileri</h3>
              <button type="button" onClick={() => setCredModal(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            {credModal.key === 'vakifkatilim' ? (
              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                Bankanın verdiği &ldquo;Bakiye İzleme&rdquo; web servis kullanıcı adı ve şifresini girin. Sunucu IP adresi
                (31.97.159.228) bankada tanımlı olmalı. Banka, hesapların en fazla 15 dakikada bir sorgulanmasını istiyor.
              </p>
            ) : null}
            <div className="mt-4 space-y-3">
              {credModal.fields.map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {f.label}
                    {f.optional ? <span className="font-normal text-slate-400"> (isteğe bağlı)</span> : null}
                  </label>
                  <input
                    type={f.secret ? 'password' : 'text'}
                    autoComplete={f.secret ? 'new-password' : 'off'}
                    placeholder={
                      f.secret && credModal.values?.[f.key] ? `Kayıtlı (${credModal.values[f.key]}) — değiştirmek için yazın` : undefined
                    }
                    value={credForm[f.key] || ''}
                    onChange={(e) => setCredForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCredModal(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Kaydet
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* New Bank Sync Account Modal */}
      {newAccOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={createBankSyncAccount} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editing ? 'Banka Hesabını Düzenle' : 'Otomatik Banka Hesabı Bağla'}
              </h3>
              <button type="button" onClick={() => { setNewAccOpen(false); setEditing(null); }} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Banka</label>
                <select
                  value={accForm.bank_key}
                  disabled={!!editing}
                  onChange={(e) => setAccForm((prev) => ({ ...prev, bank_key: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  {banks.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Hesap Adı *</label>
                <input
                  required
                  value={accForm.label}
                  onChange={(e) => setAccForm((prev) => ({ ...prev, label: e.target.value }))}
                  placeholder="Örn: Vakıf Katılım Bağış TL"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">IBAN</label>
                <input
                  value={accForm.iban}
                  onChange={(e) => setAccForm((prev) => ({ ...prev, iban: e.target.value }))}
                  placeholder="TR00 0000 0000 0000 0000 0000 00"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Para Birimi</label>
                  <select
                    value={accForm.currency}
                    onChange={(e) => setAccForm((prev) => ({ ...prev, currency: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    {['TRY', 'USD', 'EUR', 'GBP'].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {selectedBank?.account_no_label || 'Müşteri / Ek No'}
                  </label>
                  <input
                    required={accForm.bank_key === 'vakifkatilim'}
                    inputMode={accForm.bank_key === 'vakifkatilim' ? 'numeric' : undefined}
                    placeholder={accForm.bank_key === 'vakifkatilim' ? 'Örn: 1' : undefined}
                    value={accForm.account_no}
                    onChange={(e) => setAccForm((prev) => ({ ...prev, account_no: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setNewAccOpen(false); setEditing(null); }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Kaydet
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
};
