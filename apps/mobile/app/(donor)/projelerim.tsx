import React from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Video } from 'lucide-react-native';
import { df, webBase } from '@/lib/api';
import { dateTime, openUrl } from '@/lib/format';
import { Badge, Btn, Card, Empty, QueryView, Row, Screen, SectionTitle, useUi } from '@/components/ui';
import { space, useTheme } from '@/theme';

type KurbanShareItem = {
  id: string;
  donor_name: string;
  on_behalf_of: string | null;
  kurban_type: string;
  campaign_title: string | null;
  country: string | null;
  share_number: number | null;
  status: string;
  animal_number: string;
  animal_type: string | null;
  video_url: string | null;
  slaughtered_at: string | null;
  created_at: string;
};

type DonorVideoItem = {
  id: string;
  title: string;
  url: string;
  created_at: string | null;
};

export default function DonorProjectsScreen() {
  const { colors } = useTheme();
  const ui = useUi();

  const shares = useQuery({
    queryKey: ['donor', 'kurban-shares'],
    queryFn: () => df<KurbanShareItem[]>('/me/kurban-shares'),
  });

  const videos = useQuery({
    queryKey: ['donor', 'videos'],
    queryFn: () => df<DonorVideoItem[]>('/me/videos'),
  });

  const resolveVideoUrl = (url: string) => (url.startsWith('http') ? url : `${webBase()}${url}`);

  return (
    <Screen
      onRefresh={() => { shares.refetch(); videos.refetch(); }}
      refreshing={shares.isRefetching || videos.isRefetching}
    >
      <SectionTitle>KURBAN HİSSELERİM</SectionTitle>
      <QueryView query={shares}>
        {(items) =>
          items.length === 0 ? (
            <Empty
              title="Kurban hisse kaydınız bulunmuyor"
              text="Vekalet kurban bağışlarınızın kesim durumunu ve kesim videolarını buradan izleyebilirsiniz."
            />
          ) : (
            <View style={{ gap: space.sm }}>
              {items.map((s) => {
                const done = s.status?.toLowerCase() === 'slaughtered';
                return (
                  <Card key={s.id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={ui.text}>{s.campaign_title || s.kurban_type || 'Kurban Hissesi'}</Text>
                      <Badge label={done ? 'Kesildi' : 'Kesim Bekliyor'} tone={done ? 'ok' : 'warn'} />
                    </View>
                    <Row label="Vekalet Sahibi" value={s.on_behalf_of || s.donor_name} />
                    {s.country ? <Row label="Ülke / Bölge" value={s.country} /> : null}
                    <Row label="Kurban / Hisse No" value={`${s.animal_number}${s.share_number ? ` · Hisse ${s.share_number}` : ''}`} />
                    {s.slaughtered_at ? <Row label="Kesim Tarihi" value={dateTime(s.slaughtered_at)} /> : null}
                    {s.video_url ? (
                      <Btn
                        title="Kesim Videosunu İzle"
                        variant="outline"
                        small
                        icon={<Video size={16} color={colors.primaryDark} />}
                        onPress={() => openUrl(resolveVideoUrl(s.video_url!))}
                      />
                    ) : null}
                  </Card>
                );
              })}
            </View>
          )
        }
      </QueryView>

      {(videos.data?.length || 0) > 0 ? (
        <>
          <SectionTitle>PROJE & BAĞIŞ VİDEOLARIM</SectionTitle>
          <View style={{ gap: space.sm }}>
            {videos.data!.map((v) => (
              <Card key={v.id}>
                <Text style={ui.text}>{v.title}</Text>
                {v.created_at ? <Text style={ui.muted}>{dateTime(v.created_at)}</Text> : null}
                <Btn
                  title="Videoyu İzle"
                  variant="outline"
                  small
                  icon={<Video size={16} color={colors.primaryDark} />}
                  onPress={() => openUrl(resolveVideoUrl(v.url))}
                />
              </Card>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}
