import React from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react-native';
import { df } from '@/lib/api';
import { money, openUrl } from '@/lib/format';
import { Badge, Btn, Card, Empty, QueryView, Row, Screen, SectionTitle, useUi } from '@/components/ui';
import { space, useTheme } from '@/theme';

type DonorWaterWell = {
  id: string;
  name: string;
  location_name: string | null;
  country: string | null;
  status: string;
  funding_model: string;
  target_cents: number;
  collected_cents: number;
  my_shares: number;
  is_owner: boolean;
  has_pledge: boolean;
  gallery_urls: string[];
  latitude: number | null;
  longitude: number | null;
};

const WELL_STATUS: Record<string, { label: string; tone: 'ok' | 'info' | 'warn' | 'muted' }> = {
  completed: { label: 'Tamamlandı / Açıldı', tone: 'ok' },
  active: { label: 'Aktif', tone: 'ok' },
  construction: { label: 'İnşa Aşamasında', tone: 'info' },
  drilling: { label: 'Sondaj Aşamasında', tone: 'info' },
  collecting: { label: 'Hisse Toplanıyor', tone: 'warn' },
  planning: { label: 'Planlanıyor', tone: 'muted' },
};

export default function DonorWaterWellsScreen() {
  const { colors } = useTheme();
  const ui = useUi();

  const wells = useQuery({
    queryKey: ['donor', 'water-wells'],
    queryFn: () => df<DonorWaterWell[]>('/me/water-wells'),
  });

  return (
    <Screen onRefresh={() => wells.refetch()} refreshing={wells.isRefetching}>
      <SectionTitle>SU KUYULARIM</SectionTitle>
      <QueryView query={wells}>
        {(items) =>
          items.length === 0 ? (
            <Empty
              title="Kayıtlı su kuyunuz bulunmuyor"
              text="Hisseli veya tam su kuyusu bağışı yaptığınızda kuyunuzun inşa süreci ve konumu burada yer alır."
            />
          ) : (
            <View style={{ gap: space.sm }}>
              {items.map((w) => {
                const st = WELL_STATUS[w.status?.toLowerCase()] || { label: w.status || 'Kayıtlı', tone: 'info' as const };
                return (
                  <Card key={w.id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }}>
                      <Text style={[ui.text, { flex: 1 }]}>{w.name}</Text>
                      <Badge label={st.label} tone={st.tone} />
                    </View>
                    <Row label="Ülke / Bölge" value={[w.country, w.location_name].filter(Boolean).join(' · ') || '—'} />
                    <Row label="Katılım Türü" value={w.is_owner ? 'Tam Su Kuyusu' : w.my_shares > 0 ? `${w.my_shares} Hisse` : 'Hisseli Kuyu'} />
                    {w.target_cents > 0 ? (
                      <Row label="Toplanan / Hedef" value={`${money(w.collected_cents)} / ${money(w.target_cents)}`} />
                    ) : null}
                    {w.latitude && w.longitude ? (
                      <Btn
                        title="Haritada Konumu Gör"
                        variant="outline"
                        small
                        icon={<MapPin size={16} color={colors.primaryDark} />}
                        onPress={() => openUrl(`https://www.google.com/maps/search/?api=1&query=${w.latitude},${w.longitude}`)}
                      />
                    ) : null}
                  </Card>
                );
              })}
            </View>
          )
        }
      </QueryView>
    </Screen>
  );
}
