import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { centsToInput, money, toCents } from '@/lib/format';
import { Campaign, CAMPAIGN_STATUS, CURRENCY_OPTIONS } from '@/api/types';
import { Btn, Card, Chips, Field, Loading, Notice, Screen, SectionTitle, Select, SwitchRow, useUi } from '@/components/ui';
import { confirm, notify, notifyError } from '@/components/toast';
import { space } from '@/theme';

const CATEGORIES = [
  ['genel', 'Genel'], ['egitim', 'Eğitim'], ['saglik', 'Sağlık'], ['gida', 'Gıda'], ['su', 'Su'], ['yetim', 'Yetim'],
  ['kurban', 'Kurban'], ['insaat', 'İnşaat'], ['zekat', 'Zekât'], ['fitre', 'Fitre'], ['fidye', 'Fidye'], ['sadaka', 'Sadaka'], ['adak', 'Adak'],
].map(([value, label]) => ({ value, label }));

const STATUS_OPTIONS = Object.entries(CAMPAIGN_STATUS).map(([value, s]) => ({ value, label: s.label }));

export default function CampaignForm() {
  const { id, slug } = useLocalSearchParams<{ id?: string; slug?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const ui = useUi();
  const existing = useQuery({ queryKey: ['campaign', slug], enabled: !!slug, queryFn: () => api<Campaign & Record<string, any>>(`/campaigns/${slug}`) });

  const [form, setForm] = useState({
    title: '', summary: '', story: '', category: 'genel', status: 'draft', currency: 'TRY', target: '', min: '10',
    amounts: '', allow_custom_amount: true, is_featured: false, show_collected: true, show_donor_list: true, cover_image_url: '',
  });
  const [loaded, setLoaded] = useState(!id);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    const c = existing.data;
    if (!c || loaded) return;
    setForm({
      title: c.title, summary: c.summary || '', story: c.story || '', category: c.category || 'genel', status: c.status,
      currency: c.currency, target: centsToInput(c.target_cents), min: centsToInput(c.min_donation_cents),
      amounts: (c.suggested_amounts_cents || []).map((a: number) => centsToInput(a)).join(', '),
      allow_custom_amount: c.allow_custom_amount, is_featured: c.is_featured, show_collected: c.show_collected ?? true,
      show_donor_list: c.show_donor_list ?? true, cover_image_url: c.cover_image_url || '',
    });
    setLoaded(true);
  }, [existing.data, loaded]);

  if (!loaded) return <Loading />;

  const save = async () => {
    setError(null);
    if (!form.title.trim()) return setError('Kampanya başlığını yazın.');
    if (!form.summary.trim()) return setError('Kısa açıklamayı yazın.');
    const target = form.target.trim() ? toCents(form.target) : 0;
    if (target === null) return setError('Hedef tutar geçersiz.');
    const min = toCents(form.min);
    if (!min || min < 100) return setError('En az bağış tutarı 1 veya üzeri olmalı.');
    const amounts = form.amounts.split(/[,;\s]+/).filter(Boolean).map(toCents);
    if (amounts.some((a) => !a)) return setError('Önerilen tutarları virgülle ayırarak yazın: 100, 250, 500');
    const body = {
      title: form.title.trim(), summary: form.summary.trim(), story: form.story.trim() || null, category: form.category,
      status: form.status, currency: form.currency, target_cents: target, min_donation_cents: min,
      suggested_amounts_cents: amounts as number[], allow_custom_amount: form.allow_custom_amount, is_featured: form.is_featured,
      show_collected: form.show_collected, show_donor_list: form.show_donor_list, cover_image_url: form.cover_image_url.trim() || null,
    };
    setBusy('save');
    try {
      await api(id ? `/campaigns/${id}` : '/campaigns', { method: id ? 'PATCH' : 'POST', body });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-options'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', slug] });
      notify(id ? 'Kampanya güncellendi.' : 'Kampanya oluşturuldu.');
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!(await confirm('Kampanya silinsin mi?', 'Bağış almış kampanyalar silinemez; onları "Tamamlandı" ya da "İptal" yapın.', 'Sil', true))) return;
    setBusy('delete');
    try {
      await api(`/campaigns/${id}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-options'] });
      notify('Kampanya silindi.');
      router.back();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(null);
    }
  };

  const c = existing.data;
  return (
    <Screen footer={(
      <View style={{ gap: space.sm }}>
        <Btn title={id ? 'Kaydet' : 'Kampanya oluştur'} onPress={save} loading={busy === 'save'} />
        {id ? <Btn title="Kampanyayı sil" variant="danger" onPress={remove} loading={busy === 'delete'} /> : null}
      </View>
    )}>
      <Stack.Screen options={{ title: id ? 'Kampanyayı düzenle' : 'Yeni kampanya' }} />
      {error ? <Notice text={error} tone="danger" /> : null}
      {c ? <Notice text={`Toplanan: ${money(c.collected_cents, c.currency)}${c.target_cents ? ` / ${money(c.target_cents, c.currency)}` : ''}`} tone="info" /> : null}
      <Card style={{ gap: space.md }}>
        <Field label="Başlık" value={form.title} onChangeText={(title) => set({ title })} maxLength={300} />
        <Field label="Kısa açıklama" value={form.summary} onChangeText={(summary) => set({ summary })} multiline />
        <Field label="Detaylı anlatım" value={form.story} onChangeText={(story) => set({ story })} multiline hint="Web sitesindeki kampanya sayfasında gösterilir." />
        <Field label="Kapak görseli adresi" value={form.cover_image_url} onChangeText={(cover_image_url) => set({ cover_image_url })} autoCapitalize="none"
          hint="Görsel yüklemek için web panelindeki medya kütüphanesini kullanın." />
      </Card>
      <SectionTitle>Durum</SectionTitle>
      <Chips options={STATUS_OPTIONS} value={form.status} onChange={(status) => set({ status })} wrap />
      <Card style={{ gap: space.md }}>
        <Select label="Kategori" value={form.category} options={CATEGORIES} onChange={(category) => set({ category: category || 'genel' })} />
        <Select label="Para birimi" value={form.currency} options={CURRENCY_OPTIONS} onChange={(currency) => set({ currency: currency || 'TRY' })} />
        <View style={ui.rowGap}>
          <View style={{ flex: 1 }}><Field label="Hedef tutar" value={form.target} onChangeText={(target) => set({ target })} keyboardType="decimal-pad" hint="Boş: hedefsiz" /></View>
          <View style={{ flex: 1 }}><Field label="En az bağış" value={form.min} onChangeText={(min) => set({ min })} keyboardType="decimal-pad" /></View>
        </View>
        <Field label="Önerilen tutarlar" value={form.amounts} onChangeText={(amounts) => set({ amounts })} placeholder="100, 250, 500" keyboardType="numbers-and-punctuation" />
      </Card>
      <Card>
        <SwitchRow label="Serbest tutar girilebilir" value={form.allow_custom_amount} onValueChange={(allow_custom_amount) => set({ allow_custom_amount })} />
        <SwitchRow label="Öne çıkan" value={form.is_featured} onValueChange={(is_featured) => set({ is_featured })} />
        <SwitchRow label="Toplanan tutarı göster" value={form.show_collected} onValueChange={(show_collected) => set({ show_collected })} />
        <SwitchRow label="Bağışçı listesini göster" value={form.show_donor_list} onValueChange={(show_donor_list) => set({ show_donor_list })} />
      </Card>
    </Screen>
  );
}
