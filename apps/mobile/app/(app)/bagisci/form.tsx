import React, { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { af, ApiError } from '@/lib/api';
import { useStaffOptions } from '@/api/hooks';
import { DonorCard } from '@/api/types';
import { Btn, Card, Chips, Field, Loading, Notice, Screen, Select, SwitchRow } from '@/components/ui';
import { notify } from '@/components/toast';
import { space } from '@/theme';

const TYPES = [{ value: 'individual', label: 'Bireysel' }, { value: 'corporate', label: 'Kurumsal' }];

export default function DonorForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const staff = useStaffOptions();
  const existing = useQuery({ queryKey: ['donor', id], enabled: !!id, queryFn: () => af<DonorCard>(`/donors/${id}`) });

  const [form, setForm] = useState({
    donor_type: 'individual', first_name: '', last_name: '', company_name: '', tc_no: '', tax_number: '', phone: '', email: '',
    city: '', country: 'Türkiye', address: '', tags: '', assigned_user_id: null as string | null, sms_opt_out: false, email_opt_out: false,
  });
  const [loaded, setLoaded] = useState(!id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    const d = existing.data;
    if (!d || loaded) return;
    setForm({
      donor_type: d.donor_type, first_name: d.first_name || '', last_name: d.last_name || '', company_name: d.company_name || '',
      tc_no: '', tax_number: d.tax_number || '', phone: d.phone || '', email: d.email || '', city: d.city || '',
      country: d.country || 'Türkiye', address: d.address || '', tags: (d.tags || []).join(', '),
      assigned_user_id: d.assigned_user_id, sms_opt_out: d.sms_opt_out, email_opt_out: d.email_opt_out,
    });
    setLoaded(true);
  }, [existing.data, loaded]);

  const submit = async () => {
    setError(null);
    setDuplicate(null);
    const corporate = form.donor_type === 'corporate';
    if (!form.first_name.trim()) return setError(corporate ? 'Yetkili kişinin adını yazın.' : 'Adı yazın.');
    if (corporate && !form.company_name.trim()) return setError('Kurum adını yazın.');
    if (!corporate && form.tc_no && !/^\d{11}$/.test(form.tc_no)) return setError('T.C. kimlik no 11 haneli olmalı.');
    const body: Record<string, unknown> = {
      donor_type: form.donor_type,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || null,
      company_name: corporate ? form.company_name.trim() : null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      city: form.city.trim() || null,
      country: form.country.trim() || 'Türkiye',
      address: form.address.trim() || null,
      tax_number: form.tax_number.trim() || null,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      sms_opt_out: form.sms_opt_out,
      email_opt_out: form.email_opt_out,
    };
    // T.C. no maskeli geldiği için yalnızca yeniden yazıldıysa gönderilir.
    if (!corporate && form.tc_no) body.tc_no = form.tc_no;
    if (form.assigned_user_id) body.assigned_user_id = form.assigned_user_id;
    else if (id && existing.data?.assigned_user_id) body.clear_assignment = true;
    setBusy(true);
    try {
      const saved = await af<{ id: string }>(id ? `/donors/${id}` : '/donors', { method: id ? 'PUT' : 'POST', body });
      queryClient.invalidateQueries({ queryKey: ['donors'] });
      queryClient.invalidateQueries({ queryKey: ['donor', id || saved.id] });
      notify(id ? 'Bağışçı güncellendi.' : 'Bağışçı eklendi.');
      if (id) router.back();
      else router.replace({ pathname: '/bagisci/[id]', params: { id: saved.id } });
    } catch (e: any) {
      const detail = (e as ApiError).data?.detail;
      if (e.status === 409 && detail?.code === 'duplicate_donor') {
        setDuplicate(detail.donor_id);
        setError(detail.message || 'Bu telefon ya da e-posta ile kayıtlı bir bağışçı var.');
      } else {
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <Loading />;
  const corporate = form.donor_type === 'corporate';
  return (
    <Screen footer={<Btn title={id ? 'Kaydet' : 'Bağışçı ekle'} onPress={submit} loading={busy} />}>
      <Stack.Screen options={{ title: id ? 'Bağışçıyı düzenle' : 'Yeni bağışçı' }} />
      {error ? <Notice text={error} tone="danger" /> : null}
      {duplicate ? <Btn title="Kayıtlı bağışçıyı aç" variant="outline" small onPress={() => router.replace({ pathname: '/bagisci/[id]', params: { id: duplicate } })} /> : null}
      <Chips options={TYPES} value={form.donor_type} onChange={(donor_type) => set({ donor_type })} wrap />
      <Card style={{ gap: space.md }}>
        {corporate ? <Field label="Kurum adı" value={form.company_name} onChangeText={(company_name) => set({ company_name })} /> : null}
        <Field label={corporate ? 'Yetkili adı' : 'Ad'} value={form.first_name} onChangeText={(first_name) => set({ first_name })} autoCapitalize="words" />
        <Field label={corporate ? 'Yetkili soyadı' : 'Soyad'} value={form.last_name} onChangeText={(last_name) => set({ last_name })} autoCapitalize="words" />
        {corporate
          ? <Field label="Vergi no" value={form.tax_number} onChangeText={(tax_number) => set({ tax_number })} keyboardType="number-pad" />
          : <Field label="T.C. kimlik no" value={form.tc_no} onChangeText={(tc_no) => set({ tc_no: tc_no.replace(/\D/g, '') })} keyboardType="number-pad" maxLength={11}
              hint={id && existing.data?.tc_no_masked ? `Kayıtlı: ${existing.data.tc_no_masked}. Değiştirmek için yeniden yazın.` : undefined} />}
      </Card>
      <Card style={{ gap: space.md }}>
        <Field label="Telefon" value={form.phone} onChangeText={(phone) => set({ phone })} keyboardType="phone-pad" placeholder="05xx xxx xx xx" />
        <Field label="E-posta" value={form.email} onChangeText={(email) => set({ email })} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Şehir" value={form.city} onChangeText={(city) => set({ city })} />
        <Field label="Ülke" value={form.country} onChangeText={(country) => set({ country })} />
        <Field label="Adres" value={form.address} onChangeText={(address) => set({ address })} multiline />
      </Card>
      <Card style={{ gap: space.md }}>
        <Field label="Etiketler" value={form.tags} onChangeText={(tags) => set({ tags })} autoCapitalize="none" hint="Virgülle ayırın: vip, kurban" />
        <Select label="Sorumlu personel" value={form.assigned_user_id} options={staff} onChange={(assigned_user_id) => set({ assigned_user_id })} allowClear searchable placeholder="Atanmamış" />
        <SwitchRow label="SMS gönderilmesin" value={form.sms_opt_out} onValueChange={(sms_opt_out) => set({ sms_opt_out })} />
        <SwitchRow label="E-posta gönderilmesin" value={form.email_opt_out} onValueChange={(email_opt_out) => set({ email_opt_out })} />
      </Card>
    </Screen>
  );
}
