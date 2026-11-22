import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileText, Phone } from 'lucide-react-native';
import { api } from '@/lib/api';
import { openPdf } from '@/lib/files';
import { call, dateTime, isDialable, whatsapp } from '@/lib/format';
import { Badge, Btn, Card, Chips, Empty, ListItem, QueryView, Row, Screen, SearchBar, SectionTitle, Sheet, useUi } from '@/components/ui';
import { confirm, notify, notifyError } from '@/components/toast';
import { space, useTheme } from '@/theme';

type KurbanCampaign = { id: string; title: string; country?: string; season_year?: number };
type KurbanShare = {
  id: string;
  donor_name?: string | null;
  on_behalf_of?: string | null;
  donor_phone?: string | null;
  receipt_number?: string | null;
};
type KurbanAnimal = {
  id: string;
  animal_number?: string;
  code?: string;
  status?: string;
  slaughtered?: boolean;
  slaughtered_at?: string | null;
  shares?: KurbanShare[];
  share_count?: number;
  capacity?: number;
  share_capacity?: number;
  group_name?: string;
  region?: string;
  video_status?: string | null;
};

const animalLabel = (a: KurbanAnimal) => a.animal_number || a.code || `#${a.id.slice(0, 6)}`;
const isSlaughtered = (a: KurbanAnimal) => a.status === 'slaughtered' || Boolean(a.slaughtered) || Boolean(a.slaughtered_at);
const shareCountOf = (a: KurbanAnimal) => (Array.isArray(a.shares) ? a.shares.length : a.share_count ?? 0);

export default function KurbanScreen() {
  const { colors } = useTheme();
  const ui = useUi();
  const queryClient = useQueryClient();
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'waiting' | 'done'>('all');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<KurbanAnimal | null>(null);

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

  const rawAnimals: KurbanAnimal[] = Array.isArray(animals.data) ? animals.data : animals.data?.items || [];
  const animalList = rawAnimals.filter((a) => {
    const done = isSlaughtered(a);
    if (filter === 'waiting' && done) return false;
    if (filter === 'done' && !done) return false;
    if (q.trim()) {
      const term = q.trim().toLocaleLowerCase('tr-TR');
      const sharesHay = (a.shares || []).map((s) => `${s.donor_name || ''} ${s.on_behalf_of || ''} ${s.donor_phone || ''}`).join(' ');
      const hay = `${animalLabel(a)} ${a.group_name || ''} ${a.region || ''} ${sharesHay}`.toLocaleLowerCase('tr-TR');
      if (!hay.includes(term)) return false;
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
      setSelected((prev) => (prev?.id === a.id ? { ...prev, status: 'slaughtered', slaughtered: true, slaughtered_at: new Date().toISOString() } : prev));
    } catch (e) {
      notifyError(e);
    } finally {
      setBusyId(null);
    }
  };

  const downloadPdf = async (kind: 'cards' | 'paper', a: KurbanAnimal) => {
    setPdfBusy(kind);
    try {
      const label = animalLabel(a).replace(/[^A-Za-z0-9_-]/g, '');
      await openPdf(
        `/kurban/animals/${a.id}/${kind}.pdf`,
        kind === 'cards' ? `kurban-kart-${label}.pdf` : `kesim-kagidi-${label}.pdf`
      );
    } catch (e) {
      notifyError(e);
    } finally {
      setPdfBusy(null);
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
      <SearchBar value={q} onChangeText={setQ} placeholder="Hayvan kodu, grup veya hissedar ara…" />
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
              {animalList.map((a, idx) => {
                const done = isSlaughtered(a);
                const cap = a.capacity ?? a.share_capacity ?? 7;
                const extra = a.group_name || a.region;
                return (
                  <View key={a.id}>
                    {idx ? <View style={ui.separator} /> : null}
                    <ListItem
                      title={animalLabel(a)}
                      subtitle={`${shareCountOf(a)}/${cap} hisse${extra ? ` · ${extra}` : ''}`}
                      onPress={() => setSelected(a)}
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
                  </View>
                );
              })}
            </Card>
          )
        }
      </QueryView>

      <Sheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Kurbanlık · ${animalLabel(selected)}` : ''}
        footer={
          selected && !isSlaughtered(selected) ? (
            <Btn
              title="Kesildi olarak işaretle"
              loading={busyId === selected.id}
              icon={<CheckCircle2 size={18} color={colors.white} />}
              onPress={() => markSlaughtered(selected)}
            />
          ) : undefined
        }
      >
        {selected ? (
          <>
            <Row
              label="Durum"
              value={<Badge label={isSlaughtered(selected) ? 'Kesildi' : 'Bekliyor'} tone={isSlaughtered(selected) ? 'ok' : 'warn'} />}
            />
            <Row label="Hisse" value={`${shareCountOf(selected)}/${selected.capacity ?? selected.share_capacity ?? 7}`} />
            {selected.slaughtered_at ? <Row label="Kesim zamanı" value={dateTime(selected.slaughtered_at)} /> : null}
            {selected.group_name || selected.region ? <Row label="Grup / Bölge" value={selected.group_name || selected.region} /> : null}

            <View style={[ui.wrapGap, { marginTop: space.xs }]}>
              <Btn
                title="Kurban Kartı PDF"
                small
                variant="outline"
                loading={pdfBusy === 'cards'}
                icon={<FileText size={15} color={colors.primaryDark} />}
                onPress={() => downloadPdf('cards', selected)}
              />
              <Btn
                title="Kesim Kağıdı PDF"
                small
                variant="outline"
                loading={pdfBusy === 'paper'}
                icon={<FileText size={15} color={colors.primaryDark} />}
                onPress={() => downloadPdf('paper', selected)}
              />
            </View>

            <SectionTitle>Hissedarlar ({(selected.shares || []).length})</SectionTitle>
            {(selected.shares || []).length ? (
              <View style={ui.listCard}>
                {(selected.shares || []).map((s, idx) => (
                  <View key={s.id || idx}>
                    {idx ? <View style={ui.separator} /> : null}
                    <ListItem
                      title={s.on_behalf_of || s.donor_name || `Hisse ${idx + 1}`}
                      subtitle={[s.on_behalf_of && s.donor_name ? `Bağışçı: ${s.donor_name}` : null, s.donor_phone].filter(Boolean).join(' · ')}
                      meta={s.receipt_number || undefined}
                      right={
                        isDialable(s.donor_phone) ? (
                          <View style={ui.rowGap}>
                            <Btn title="Ara" small variant="outline" icon={<Phone size={14} color={colors.primaryDark} />} onPress={() => call(s.donor_phone!)} />
                            <Btn title="WA" small variant="ghost" onPress={() => whatsapp(s.donor_phone!)} />
                          </View>
                        ) : undefined
                      }
                    />
                  </View>
                ))}
              </View>
            ) : (
              <Text style={ui.muted}>Bu hayvana atanmış hissedar yok.</Text>
            )}
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
