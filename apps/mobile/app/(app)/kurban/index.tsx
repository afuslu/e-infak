import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react-native';
import { api } from '@/lib/api';
import { Badge, Btn, Card, Chips, Empty, ListItem, QueryView, Screen, SearchBar, SectionTitle } from '@/components/ui';
import { confirm, notify, notifyError } from '@/components/toast';
import { space, useTheme } from '@/theme';

type KurbanCampaign = { id: string; title: string; country?: string; season_year?: number };
type KurbanAnimal = {
  id: string;
  animal_number?: string;
  code?: string;
  status?: string;
  slaughtered?: boolean;
  slaughtered_at?: string | null;
  shares?: unknown[];
  share_count?: number;
  capacity?: number;
  share_capacity?: number;
  group_name?: string;
  region?: string;
};

const animalLabel = (a: KurbanAnimal) => a.animal_number || a.code || `#${a.id.slice(0, 6)}`;
const isSlaughtered = (a: KurbanAnimal) => a.status === 'slaughtered' || Boolean(a.slaughtered) || Boolean(a.slaughtered_at);
const shareCountOf = (a: KurbanAnimal) => (Array.isArray(a.shares) ? a.shares.length : a.share_count ?? 0);

export default function KurbanScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'waiting' | 'done'>('all');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const campaigns = useQuery({
    queryKey: ['kurban-campaigns'],
    queryFn: () => api<{ items?: KurbanCampaign[] } | KurbanCampaign[]>('/kurban/campaigns'),
  });

  const campList: KurbanCampaign[] = Array.isArray(campaigns.data)
    ? campaigns.data
    : campaigns.data?.items || [];
  const activeCampId = selectedCampaign || campList[0]?.id || null;

  const animals = useQuery({
    queryKey: ['kurban-animals', activeCampId],
    enabled: !!activeCampId,
    queryFn: () =>
      api<{ items?: KurbanAnimal[] } | KurbanAnimal[]>('/kurban/animals', {
        query: { campaign_id: activeCampId, page_size: 100 },
      }),
  });

  const animalList: KurbanAnimal[] = (
    Array.isArray(animals.data) ? animals.data : animals.data?.items || []
  ).filter((a) => {
    const done = isSlaughtered(a);
    if (filter === 'waiting' && done) return false;
    if (filter === 'done' && !done) return false;
    if (q.trim() && !`${animalLabel(a)} ${a.group_name || ''} ${a.region || ''}`.toLocaleLowerCase('tr-TR').includes(q.trim().toLocaleLowerCase('tr-TR'))) {
      return false;
    }
    return true;
  });

  const markSlaughtered = async (a: KurbanAnimal) => {
    const label = animalLabel(a);
    if (!(await confirm(`${label} kesildi olarak işaretlensin mi?`, 'Hissedarlara durum yansıtılır.'))) return;
    setBusyId(a.id);
    try {
      await api('/kurban/animals/slaughter', { method: 'POST', body: { items: [{ animal_id: a.id }] } });
      notify(`${label} kesildi olarak işaretlendi.`);
      await queryClient.invalidateQueries({ queryKey: ['kurban-animals'] });
    } catch (e) {
      notifyError(e);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen onRefresh={() => { campaigns.refetch(); animals.refetch(); }} refreshing={animals.isRefetching}>
      <Stack.Screen options={{ title: 'Kurban Takibi' }} />
      {campList.length > 0 ? (
        <Chips
          options={campList.map((c) => ({ value: c.id, label: c.title }))}
          value={activeCampId}
          onChange={setSelectedCampaign}
        />
      ) : null}
      <SearchBar value={q} onChangeText={setQ} placeholder="Hayvan kodu veya grup ara…" />
      <Chips
        options={[
          { value: 'all', label: 'Tümü' },
          { value: 'waiting', label: 'Bekleyen' },
          { value: 'done', label: 'Kesildi' },
        ]}
        value={filter}
        onChange={setFilter}
      />

      <SectionTitle>Kurbanlıklar ({animalList.length})</SectionTitle>
      <QueryView query={animals}>
        {() =>
          animalList.length === 0 ? (
            <Empty title="Kurbanlık kaydı bulunamadı" text="Seçili kampanya veya filtreye uygun hayvan yok." />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {animalList.map((a) => {
                const done = isSlaughtered(a);
                const cap = a.capacity ?? a.share_capacity ?? 7;
                const extra = a.group_name || a.region;
                return (
                <ListItem
                  key={a.id}
                  title={animalLabel(a)}
                  subtitle={`${shareCountOf(a)}/${cap} hisse${extra ? ` · ${extra}` : ''}`}
                  right={
                    done ? (
                      <Badge label="Kesildi" tone="ok" />
                    ) : (
                      <Btn
                        title="Kesildi"
                        small
                        variant="outline"
                        loading={busyId === a.id}
                        icon={<CheckCircle2 size={15} color={colors.primaryDark} />}
                        onPress={() => markSlaughtered(a)}
                      />
                    )
                  }
                />
                );
              })}
            </Card>
          )
        }
      </QueryView>
    </Screen>
  );
}
