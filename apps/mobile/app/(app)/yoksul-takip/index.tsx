import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, Plus } from 'lucide-react-native';
import { af } from '@/lib/api';
import { call, dateTime, isDialable, whatsapp } from '@/lib/format';
import { useDebounced } from '@/lib/paged';
import { Badge, Btn, Card, Chips, Empty, Fab, Field, ListItem, QueryView, Row, Screen, SearchBar, SectionTitle, Sheet, useUi } from '@/components/ui';
import { notify, notifyError } from '@/components/toast';
import { space, useTheme } from '@/theme';

type Recipient = {
  id: string;
  full_name: string;
  phone?: string | null;
  national_id_masked?: string | null;
  region_id?: string | null;
  region_name?: string | null;
  address?: string | null;
  district?: string | null;
  city?: string | null;
  household_size?: number | null;
  needs?: string | null;
  status?: 'active' | 'passive';
  is_active?: boolean;
  last_delivery_at?: string | null;
  total_received?: number;
};

export default function NeedyScreen() {
  const { colors } = useTheme();
  const ui = useUi();
  const queryClient = useQueryClient();
  const [term, setTerm] = useState('');
  const q = useDebounced(term);
  const [status, setStatus] = useState<'all' | 'active' | 'passive'>('active');
  const [selected, setSelected] = useState<Recipient | null>(null);
  const [editNeeds, setEditNeeds] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'passive'>('active');
  const [saving, setSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newHousehold, setNewHousehold] = useState('');
  const [newNeeds, setNewNeeds] = useState('');

  const query = useQuery({
    queryKey: ['aid-recipients', q],
    queryFn: () =>
      af<{ items?: Recipient[] } | Recipient[]>('/aid-recipients', {
        query: { q: q.trim() || undefined, page_size: 100 },
      }),
  });

  const isRecipientActive = (r: Recipient) => (r.status ? r.status === 'active' : r.is_active !== false);

  const list: Recipient[] = (Array.isArray(query.data) ? query.data : query.data?.items || []).filter((r) => {
    if (status === 'all') return true;
    const active = isRecipientActive(r);
    return status === 'active' ? active : !active;
  });

  const openDetail = (r: Recipient) => {
    setSelected(r);
    setEditNeeds(r.needs || '');
    setEditStatus(isRecipientActive(r) ? 'active' : 'passive');
  };

  const saveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await af(`/aid-recipients/${selected.id}`, {
        method: 'PUT',
        body: {
          full_name: selected.full_name,
          phone: selected.phone || null,
          region_id: selected.region_id || null,
          address: selected.address || null,
          household_size: selected.household_size || null,
          needs: editNeeds.trim() || null,
          status: editStatus,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['aid-recipients'] });
      setSelected(null);
      notify('Aile kaydı güncellendi.');
    } catch (e) {
      notifyError(e);
    } finally {
      setSaving(false);
    }
  };

  const createRecipient = async () => {
    if (newName.trim().length < 2) return notify('Ad soyad en az 2 karakter olmalı.', 'error');
    const hh = newHousehold.trim() ? Number(newHousehold) : null;
    if (newHousehold.trim() && (!Number.isInteger(hh) || (hh ?? 0) < 1 || (hh ?? 0) > 50)) {
      return notify('Hane kişi sayısı 1–50 arası olmalı.', 'error');
    }
    setSaving(true);
    try {
      await af('/aid-recipients', {
        method: 'POST',
        body: {
          full_name: newName.trim(),
          phone: newPhone.trim() || null,
          address: newAddress.trim() || null,
          household_size: hh,
          needs: newNeeds.trim() || null,
          status: 'active',
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['aid-recipients'] });
      setCreateOpen(false);
      setNewName('');
      setNewPhone('');
      setNewAddress('');
      setNewHousehold('');
      setNewNeeds('');
      notify('Aile kaydı eklendi.');
    } catch (e) {
      notifyError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Yoksul / Aile Takip' }} />
      <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching} style={{ paddingBottom: 110 }}>
        <SearchBar value={term} onChangeText={setTerm} placeholder="Aile adı, telefon veya adres ara…" />
        <Chips
          options={[
            { value: 'active', label: 'Aktif' },
            { value: 'passive', label: 'Pasif' },
            { value: 'all', label: 'Tümü' },
          ]}
          value={status}
          onChange={setStatus}
        />
        <SectionTitle>Kayıtlı Aileler ({list.length})</SectionTitle>
        <QueryView query={query}>
          {() =>
            list.length === 0 ? (
              <Empty title="Aile kaydı bulunamadı" text="Aramanıza uygun ihtiyaç sahibi kaydı yok." />
            ) : (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {list.map((r, idx) => {
                  const active = isRecipientActive(r);
                  const loc = r.region_name || [r.district, r.city].filter(Boolean).join(', ') || r.address;
                  return (
                    <View key={r.id}>
                      {idx ? <View style={ui.separator} /> : null}
                      <ListItem
                        title={r.full_name}
                        subtitle={[loc, r.household_size ? `${r.household_size} kişi` : null].filter(Boolean).join(' · ') || r.phone || undefined}
                        meta={r.total_received ? `${r.total_received} teslimat` : undefined}
                        onPress={() => openDetail(r)}
                        right={
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Badge label={active ? 'Aktif' : 'Pasif'} tone={active ? 'ok' : 'muted'} />
                            {isDialable(r.phone) ? (
                              <Btn
                                title="Ara"
                                small
                                variant="outline"
                                icon={<Phone size={14} color={colors.primaryDark} />}
                                onPress={() => call(r.phone!)}
                              />
                            ) : null}
                          </View>
                        }
                      />
                    </View>
                  );
                })}
              </Card>
            )
          }
        </QueryView>
      </Screen>

      <Fab label="Aile ekle" icon={<Plus size={20} color={colors.white} />} onPress={() => setCreateOpen(true)} />

      <Sheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.full_name || 'Aile detayı'}
        footer={<Btn title="Değişiklikleri kaydet" onPress={saveEdit} loading={saving} />}
      >
        {selected ? (
          <>
            {selected.phone ? <Row label="Telefon" value={selected.phone} onPress={isDialable(selected.phone) ? () => call(selected.phone!) : undefined} /> : null}
            {selected.national_id_masked ? <Row label="Kimlik" value={selected.national_id_masked} /> : null}
            {selected.region_name ? <Row label="Bölge" value={selected.region_name} /> : null}
            {selected.household_size ? <Row label="Hane" value={`${selected.household_size} kişi`} /> : null}
            {selected.address ? <Row label="Adres" value={selected.address} /> : null}
            <Row label="Toplam yardım" value={selected.total_received ? `${selected.total_received} paket` : 'Henüz yok'} />
            {selected.last_delivery_at ? <Row label="Son teslim" value={dateTime(selected.last_delivery_at)} /> : null}
            {isDialable(selected.phone) ? (
              <View style={[ui.wrapGap, { marginVertical: space.xs }]}>
                <Btn title="Ara" small variant="outline" icon={<Phone size={14} color={colors.primaryDark} />} onPress={() => call(selected.phone!)} />
                <Btn title="WhatsApp" small variant="outline" onPress={() => whatsapp(selected.phone!)} />
              </View>
            ) : null}
            <Text style={ui.muted}>Durum</Text>
            <Chips
              options={[
                { value: 'active', label: 'Aktif' },
                { value: 'passive', label: 'Pasif' },
              ]}
              value={editStatus}
              onChange={setEditStatus}
            />
            <Field label="İhtiyaçlar / Saha notu" value={editNeeds} onChangeText={setEditNeeds} multiline maxLength={2000} placeholder="Gıda, yakacak, eğitim vb." />
          </>
        ) : null}
      </Sheet>

      <Sheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni aile kaydı"
        footer={<Btn title="Kaydet" onPress={createRecipient} loading={saving} />}
      >
        <Field label="Ad soyad" value={newName} onChangeText={setNewName} autoCapitalize="words" />
        <Field label="Telefon" value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" placeholder="05xx xxx xx xx" />
        <Field label="Hane kişi sayısı" value={newHousehold} onChangeText={setNewHousehold} keyboardType="number-pad" placeholder="Örn. 4" />
        <Field label="Adres" value={newAddress} onChangeText={setNewAddress} multiline />
        <Field label="İhtiyaçlar / Not" value={newNeeds} onChangeText={setNewNeeds} multiline maxLength={2000} />
      </Sheet>
    </View>
  );
}
