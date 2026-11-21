import React, { useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { af } from '@/lib/api';
import { centsToInput, toCents } from '@/lib/format';
import { recall } from '@/lib/selected';
import { useCampaignOptions } from '@/api/hooks';
import { Btn, Card, Field, Notice, Screen, Select, SwitchRow } from '@/components/ui';
import { confirm, notify, notifyError } from '@/components/toast';
import { categoryBody, DonationCategory } from '@/api/types';
import { space } from '@/theme';

export default function CategoryForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const campaigns = useCampaignOptions();
  const existing = id ? recall<DonationCategory>('category', id) : undefined;

  const [form, setForm] = useState({
    icon: existing?.icon || '🤝', title: existing?.title || '', description: existing?.description || '',
    campaign_id: existing?.campaign_id || null as string | null, target_url: existing?.target_url || '',
    amounts: (existing?.suggested_amounts_cents || []).map((a) => centsToInput(a)).join(', '), is_active: existing?.is_active ?? true,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  if (id && !existing) {
    // Liste dışından gelindi (ör. sayfa yenilendi): listeye dön.
    return <Screen><Notice text="Kayıt bulunamadı; listeden yeniden açın." /><Btn title="Listeye dön" onPress={() => router.back()} /></Screen>;
  }

  const save = async () => {
    setError(null);
    if (!form.title.trim() || !form.description.trim()) return setError('Başlık ve açıklamayı yazın.');
    if (!form.campaign_id && !form.target_url.trim()) return setError('Bir kampanya seçin ya da hedef bağlantı yazın.');
    const amounts = form.amounts.split(/[,;\s]+/).filter(Boolean).map(toCents);
    if (amounts.some((a) => !a)) return setError('Önerilen tutarları virgülle ayırarak yazın: 100, 250, 500');
    const base: DonationCategory = existing || {
      id: '', icon: '', image_url: null, title: '', description: '', campaign_id: null, campaign_title: null, donation_type: null,
      target_url: null, suggested_amounts_cents: [], translations: {}, display_order: 999, is_active: true,
    };
    const body = categoryBody(base, {
      icon: form.icon.trim() || '🤝', title: form.title.trim(), description: form.description.trim(), campaign_id: form.campaign_id,
      target_url: form.target_url.trim() || null, suggested_amounts_cents: amounts as number[], is_active: form.is_active,
    });
    setBusy('save');
    try {
      await af(id ? `/donation-categories/${id}` : '/donation-categories', { method: id ? 'PUT' : 'POST', body });
      await queryClient.invalidateQueries({ queryKey: ['donation-categories'] });
      notify('Bağış kalemi kaydedildi.');
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen footer={(
      <View style={{ gap: space.sm }}>
        <Btn title="Kaydet" onPress={save} loading={busy === 'save'} />
        {id ? (
          <Btn title="Sil" variant="danger" loading={busy === 'delete'} onPress={async () => {
            if (!(await confirm(`${form.title} silinsin mi?`, undefined, 'Sil', true))) return;
            setBusy('delete');
            try {
              await af(`/donation-categories/${id}`, { method: 'DELETE' });
              await queryClient.invalidateQueries({ queryKey: ['donation-categories'] });
              notify('Bağış kalemi silindi.');
              router.back();
            } catch (e) {
              notifyError(e);
            } finally {
              setBusy(null);
            }
          }} />
        ) : null}
      </View>
    )}>
      <Stack.Screen options={{ title: id ? 'Bağış kalemini düzenle' : 'Yeni bağış kalemi' }} />
      {error ? <Notice text={error} tone="danger" /> : null}
      <Card style={{ gap: space.md }}>
        <Field label="Simge (emoji)" value={form.icon} onChangeText={(icon) => set({ icon })} maxLength={10} />
        <Field label="Başlık" value={form.title} onChangeText={(title) => set({ title })} maxLength={200} />
        <Field label="Açıklama" value={form.description} onChangeText={(description) => set({ description })} multiline maxLength={500} />
      </Card>
      <Card style={{ gap: space.md }}>
        <Select label="Bağlı kampanya" value={form.campaign_id} options={campaigns} onChange={(campaign_id) => set({ campaign_id })} searchable allowClear placeholder="Seçilmedi" />
        <Field label="ya da hedef bağlantı" value={form.target_url} onChangeText={(target_url) => set({ target_url })} autoCapitalize="none" placeholder="/kampanyalar/…" />
        <Field label="Önerilen tutarlar" value={form.amounts} onChangeText={(amounts) => set({ amounts })} placeholder="100, 250, 500" keyboardType="numbers-and-punctuation" />
        <SwitchRow label="Sitede göster" value={form.is_active} onValueChange={(is_active) => set({ is_active })} />
      </Card>
    </Screen>
  );
}
