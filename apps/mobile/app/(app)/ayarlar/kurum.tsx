import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { af } from '@/lib/api';
import { can } from '@/lib/access';
import { validTrIban } from '@/lib/format';
import { Btn, Card, Chips, Field, Loading, ErrorView, Notice, Screen, SwitchRow } from '@/components/ui';
import { notify } from '@/components/toast';
import { space } from '@/theme';

type Settings = Record<string, any>;

const TABS = [
  { value: 'contact', label: 'İletişim & Banka' },
  { value: 'legal', label: 'Kurumsal & Yasal' },
  { value: 'web', label: 'Site & SEO' },
];

// Bu ekranda düzenlenen alanlar; yalnızca bunlar gönderilir (PUT kısmi güncelleme yapar).
const FIELDS = [
  'contact_phone', 'contact_email', 'contact_address', 'bank1_name', 'bank1_iban', 'bank2_name', 'bank2_iban',
  'legal_name', 'tax_number', 'tax_office', 'registry_no', 'tax_deduction_eligible', 'about_text', 'mission_text', 'vision_text',
  'kvkk_url', 'terms_url', 'preinfo_url', 'refund_url', 'whatsapp_number', 'whatsapp_message', 'seo_title', 'seo_description', 'seo_keywords',
] as const;

export default function OrgSettings() {
  const queryClient = useQueryClient();
  const { access, reload } = useAuth();
  const editable = can(access, 'settings.manage');
  const query = useQuery({ queryKey: ['org-settings'], queryFn: () => af<Settings>('/org-settings') });
  const [form, setForm] = useState<Settings | null>(null);
  const [tab, setTab] = useState('contact');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.data && !form) {
      const initial: Settings = {};
      for (const key of FIELDS) initial[key] = query.data[key] ?? (key === 'tax_deduction_eligible' ? false : '');
      setForm(initial);
    }
  }, [query.data, form]);

  if (!form) return query.error ? <ErrorView error={query.error} onRetry={() => query.refetch()} /> : <Loading />;
  const set = (patch: Settings) => setForm((f) => ({ ...f!, ...patch }));
  const text = (key: (typeof FIELDS)[number], label: string, extra: Partial<React.ComponentProps<typeof Field>> = {}) => (
    <Field label={label} value={form[key] || ''} onChangeText={(v) => set({ [key]: v })} editable={editable} {...extra} />
  );

  const save = async () => {
    setError(null);
    for (const key of ['bank1_iban', 'bank2_iban'] as const) {
      const iban = (form[key] || '').replace(/\s/g, '').toUpperCase();
      if (iban && !validTrIban(iban)) return setError(`${key === 'bank1_iban' ? '1.' : '2.'} IBAN geçersiz. TR ile başlayan 26 karakterlik IBAN girin.`);
    }
    const body: Settings = {};
    for (const key of FIELDS) {
      const value = form[key];
      if (typeof value === 'boolean') body[key] = value;
      else if (key.endsWith('_iban')) body[key] = (value || '').replace(/\s/g, '').toUpperCase() || null;
      else body[key] = (value || '').trim() || null;
    }
    setBusy(true);
    try {
      await af('/org-settings', { method: 'PUT', body });
      await queryClient.invalidateQueries({ queryKey: ['org-settings'] });
      reload().catch(() => {});
      notify('Kurum ayarları kaydedildi.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={editable ? <Btn title="Kaydet" onPress={save} loading={busy} /> : undefined}>
      <Stack.Screen options={{ title: 'Kurum ayarları' }} />
      {!editable ? <Notice text="Ayarları görüntüleyebilirsiniz; değiştirme yetkiniz yok." /> : null}
      {error ? <Notice text={error} tone="danger" /> : null}
      <Chips options={TABS} value={tab} onChange={setTab} />
      {tab === 'contact' ? (
        <>
          <Card style={{ gap: space.md }}>
            {text('contact_phone', 'Telefon', { keyboardType: 'phone-pad' })}
            {text('contact_email', 'E-posta', { keyboardType: 'email-address', autoCapitalize: 'none' })}
            {text('contact_address', 'Adres', { multiline: true })}
          </Card>
          <Card style={{ gap: space.md }}>
            {text('bank1_name', '1. banka adı')}
            {text('bank1_iban', '1. IBAN', { autoCapitalize: 'characters', placeholder: 'TR00 0000 0000 0000 0000 0000 00' })}
            {text('bank2_name', '2. banka adı')}
            {text('bank2_iban', '2. IBAN', { autoCapitalize: 'characters' })}
          </Card>
          <Card style={{ gap: space.md }}>
            {text('whatsapp_number', 'WhatsApp numarası', { keyboardType: 'phone-pad' })}
            {text('whatsapp_message', 'WhatsApp karşılama mesajı', { multiline: true })}
          </Card>
        </>
      ) : null}
      {tab === 'legal' ? (
        <>
          <Card style={{ gap: space.md }}>
            {text('legal_name', 'Resmî unvan')}
            {text('tax_office', 'Vergi dairesi')}
            {text('tax_number', 'Vergi no', { keyboardType: 'number-pad' })}
            {text('registry_no', 'Kütük / sicil no')}
            <SwitchRow label="Bağışlar vergiden düşülebilir" value={!!form.tax_deduction_eligible}
              onValueChange={(v) => set({ tax_deduction_eligible: v })} disabled={!editable} />
          </Card>
          <Card style={{ gap: space.md }}>
            {text('kvkk_url', 'KVKK sayfası', { autoCapitalize: 'none', hint: '/kvkk ya da https://… biçiminde' })}
            {text('terms_url', 'Bağış koşulları', { autoCapitalize: 'none' })}
            {text('preinfo_url', 'Ön bilgilendirme', { autoCapitalize: 'none' })}
            {text('refund_url', 'İade koşulları', { autoCapitalize: 'none' })}
          </Card>
        </>
      ) : null}
      {tab === 'web' ? (
        <>
          <Card style={{ gap: space.md }}>
            {text('about_text', 'Hakkımızda', { multiline: true, maxLength: 5000 })}
            {text('mission_text', 'Misyon', { multiline: true, maxLength: 3000 })}
            {text('vision_text', 'Vizyon', { multiline: true, maxLength: 3000 })}
          </Card>
          <Card style={{ gap: space.md }}>
            {text('seo_title', 'SEO başlığı', { maxLength: 160 })}
            {text('seo_description', 'SEO açıklaması', { multiline: true, maxLength: 320 })}
            {text('seo_keywords', 'Anahtar kelimeler', { maxLength: 300 })}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
