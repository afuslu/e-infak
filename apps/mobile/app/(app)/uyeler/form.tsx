import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { af } from '@/lib/api';
import { centsToInput, toCents } from '@/lib/format';
import { useDebounced } from '@/lib/paged';
import { Donor, Member, MEMBER_STATUSES, MEMBER_TYPES } from '@/api/types';
import { Btn, Card, Chips, Field, ListItem, Loading, Notice, Screen, SearchBar, SectionTitle, Select, ui } from '@/components/ui';
import { DateField } from '@/components/fields';
import { notify } from '@/components/toast';
import { space } from '@/theme';

const PERIODS = [{ value: 'monthly', label: 'Aylık' }, { value: 'yearly', label: 'Yıllık' }];

export default function MemberForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const existing = useQuery({ queryKey: ['member', id], enabled: !!id, queryFn: () => af<Member>(`/members/${id}`) });

  const [form, setForm] = useState({
    member_no: '', member_type: 'asil', status: 'active', joined_on: null as string | null, dues: '', dues_period: null as string | null, notes: '',
  });
  const [loaded, setLoaded] = useState(!id);
  const [donor, setDonor] = useState<{ id: string; name: string } | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [person, setPerson] = useState({ first_name: '', last_name: '', phone: '' });
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const q = useDebounced(term);
  const search = useQuery({
    queryKey: ['donor-search', q], enabled: !id && !donor && !isNew && q.trim().length >= 2,
    queryFn: () => af<{ items: Donor[] }>('/donors', { query: { q: q.trim(), page_size: 8, sort: 'name' } }),
  });

  useEffect(() => {
    const m = existing.data;
    if (!m || loaded) return;
    setForm({
      member_no: m.member_no || '', member_type: m.member_type, status: m.status, joined_on: m.joined_on,
      dues: centsToInput(m.dues_cents), dues_period: m.dues_period, notes: m.notes || '',
    });
    setLoaded(true);
  }, [existing.data, loaded]);

  if (!loaded) return <Loading />;

  const save = async () => {
    setError(null);
    if (!id && !donor && !(isNew && person.first_name.trim())) return setError('Kayıtlı bir kişi seçin ya da yeni kişinin adını yazın.');
    const dues = form.dues.trim() ? toCents(form.dues) : null;
    if (form.dues.trim() && dues === null) return setError('Aidat tutarı geçersiz.');
    const body: Record<string, unknown> = {
      member_no: form.member_no.trim() || null, member_type: form.member_type, status: form.status, joined_on: form.joined_on,
      dues_cents: dues, dues_period: form.dues_period, notes: form.notes.trim() || null,
    };
    if (!id) {
      if (donor) body.donor_id = donor.id;
      else body.person = { first_name: person.first_name.trim(), last_name: person.last_name.trim() || null, phone: person.phone.trim() || null };
    }
    setBusy(true);
    try {
      const saved = await af<Member>(id ? `/members/${id}` : '/members', { method: id ? 'PUT' : 'POST', body });
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['member', saved.id] });
      queryClient.invalidateQueries({ queryKey: ['member-summary'] });
      notify(id ? 'Üye güncellendi.' : 'Üye eklendi.');
      if (id) router.back();
      else router.replace({ pathname: '/uyeler/[id]', params: { id: saved.id } });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Btn title={id ? 'Kaydet' : 'Üye ekle'} onPress={save} loading={busy} />}>
      <Stack.Screen options={{ title: id ? 'Üyeyi düzenle' : 'Yeni üye' }} />
      {error ? <Notice text={error} tone="danger" /> : null}
      {!id ? (
        <>
          <SectionTitle>Kişi</SectionTitle>
          <Card>
            {donor ? (
              <ListItem title={donor.name} right={<Btn title="Değiştir" variant="ghost" small onPress={() => setDonor(null)} />} />
            ) : isNew ? (
              <>
                <Field label="Ad" value={person.first_name} onChangeText={(first_name) => setPerson({ ...person, first_name })} autoCapitalize="words" />
                <Field label="Soyad" value={person.last_name} onChangeText={(last_name) => setPerson({ ...person, last_name })} autoCapitalize="words" />
                <Field label="Telefon" value={person.phone} onChangeText={(phone) => setPerson({ ...person, phone })} keyboardType="phone-pad" />
                <Btn title="Kayıtlı kişi ara" variant="ghost" small onPress={() => setIsNew(false)} />
              </>
            ) : (
              <>
                <SearchBar value={term} onChangeText={setTerm} placeholder="Bağışçılar arasında ara" />
                {(search.data?.items || []).map((d) => <ListItem key={d.id} title={d.full_name} subtitle={d.phone} onPress={() => setDonor({ id: d.id, name: d.full_name })} />)}
                {search.data && !search.data.items.length ? <Text style={ui.muted}>Eşleşen kişi yok.</Text> : null}
                <Btn title="Yeni kişi" variant="outline" small onPress={() => setIsNew(true)} />
              </>
            )}
          </Card>
        </>
      ) : null}
      <SectionTitle>Üyelik</SectionTitle>
      <Card style={{ gap: space.md }}>
        <Field label="Üye no" value={form.member_no} onChangeText={(member_no) => set({ member_no })} hint={id ? undefined : 'Boş bırakılırsa sıradaki numara verilir.'} />
        <Select label="Üyelik türü" value={form.member_type} options={MEMBER_TYPES} onChange={(member_type) => set({ member_type: member_type || 'asil' })} />
        <Select label="Durum" value={form.status} options={MEMBER_STATUSES} onChange={(status) => set({ status: status || 'active' })} />
        <DateField label="Giriş tarihi" value={form.joined_on} onChange={(joined_on) => set({ joined_on })} />
      </Card>
      <SectionTitle>Aidat</SectionTitle>
      <Card style={{ gap: space.md }}>
        <Field label="Özel aidat tutarı" value={form.dues} onChangeText={(dues) => set({ dues })} keyboardType="decimal-pad" hint="Boş: kurumun varsayılan aidatı" />
        <Chips options={PERIODS} value={form.dues_period} onChange={(dues_period) => set({ dues_period })} wrap />
        <Field label="Not" value={form.notes} onChangeText={(notes) => set({ notes })} multiline maxLength={2000} />
      </Card>
    </Screen>
  );
}
