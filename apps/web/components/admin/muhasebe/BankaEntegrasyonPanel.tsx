'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Loader2,
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
}

interface BankInfo {
  key: string;
  label: string;
  ready: boolean;
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

export interface BankaEntegrasyonPanelProps {
  onSynced?: () => void;
}

export const BankaEntegrasyonPanel: React.FC<BankaEntegrasyonPanelProps> = ({ onSynced }) => {
  const [openSection, setOpenSection] = useState<'none' | 'api' | 'rules'>('none');
  const [banks, setBanks] = useState<BankInfo[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [senderRules, setSenderRules] = useState<RuleRow[]>([]);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; title: string }>>([]);
  const [credModal, setCredModal] = useState<BankInfo | null>(null);
  const [credForm, setCredForm] = useState<Record<string, string>>({});
  const [newAccOpen, setNewAccOpen] = useState(false);
  const [accForm, setAccForm] = useState({
    bank_key: 'vakif_katilim',
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
      flash('ok', `Banka hareketleri çekildi (${res.data?.imported ?? 0} yeni hareket)`);
      await loadAll();
      onSynced?.();
    } catch (e: any) {
      flash('err', e?.response?.data?.detail || 'Senkronizasyon başarısız');
    } finally {
      setSyncingId(null);
    }
  };

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
      await api.post('/admin/bank-accounts', {
        ...accForm,
        default_campaign_id: accForm.default_campaign_id || null,
      });
      flash('ok', 'Otomatik banka entegrasyon hesabı eklendi ve Kasa & Banka listesiyle eşitlendi');
      setNewAccOpen(false);
      setAccForm({
        bank_key: banks[0]?.key || 'vakif_katilim',
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
                  onClick={() => setNewAccOpen(true)}
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
                          <p className="font-mono text-[11px] text-slate-500">{ba.iban || '-'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
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
                          {b.configured ? 'API Tanımlı' : 'Tanımlanmadı'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCredModal(b);
                        setCredForm(b.values || {});
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
            <div className="mt-4 space-y-3">
              {credModal.fields.map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">{f.label}</label>
                  <input
                    type={f.secret ? 'password' : 'text'}
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
              <h3 className="text-base font-bold text-slate-900">Otomatik Banka Hesabı Bağla</h3>
              <button type="button" onClick={() => setNewAccOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Banka</label>
                <select
                  value={accForm.bank_key}
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
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Müşteri / Ek No</label>
                  <input
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
                onClick={() => setNewAccOpen(false)}
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
