import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Video, X } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
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
  const insets = useSafeAreaInsets();
  const ui = useUi();
  const [activeVideo, setActiveVideo] = useState<{ title: string; url: string } | null>(null);

  const shares = useQuery({
    queryKey: ['donor', 'kurban-shares'],
    queryFn: () => df<KurbanShareItem[]>('/me/kurban-shares'),
  });

  const videos = useQuery({
    queryKey: ['donor', 'videos'],
    queryFn: () => df<DonorVideoItem[]>('/me/videos'),
  });

  const resolveVideoUrl = (url: string) => (url.startsWith('http') ? url : `${webBase()}${url}`);

  const playVideo = (title: string, url: string) => {
    const resolved = resolveVideoUrl(url);
    if (Platform.OS === 'web') {
      openUrl(resolved);
      return;
    }
    setActiveVideo({ title, url: resolved });
  };

  return (
    <>
      <Screen
        onRefresh={() => {
          shares.refetch();
          videos.refetch();
        }}
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
                      <Row
                        label="Kurban / Hisse No"
                        value={`${s.animal_number}${s.share_number ? ` · Hisse ${s.share_number}` : ''}`}
                      />
                      {s.slaughtered_at ? <Row label="Kesim Tarihi" value={dateTime(s.slaughtered_at)} /> : null}
                      {s.video_url ? (
                        <Btn
                          title="Kesim Videosunu İzle"
                          variant="outline"
                          small
                          icon={<Video size={16} color={colors.primaryDark} />}
                          onPress={() =>
                            playVideo(
                              `${s.campaign_title || 'Kurban Kesim'} (${s.on_behalf_of || s.donor_name})`,
                              s.video_url!,
                            )
                          }
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
                    onPress={() => playVideo(v.title, v.url)}
                  />
                </Card>
              ))}
            </View>
          </>
        ) : null}
      </Screen>

      <Modal
        visible={!!activeVideo}
        animationType="slide"
        onRequestClose={() => setActiveVideo(null)}
      >
        <View style={styles.modalRoot}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 8 }]}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {activeVideo?.title}
            </Text>
            <Pressable
              onPress={() => setActiveVideo(null)}
              style={styles.closeBtn}
              accessibilityRole="button"
            >
              <X size={20} color="#FFFFFF" />
            </Pressable>
          </View>
          {activeVideo ? (
            <WebView
              source={{ uri: activeVideo.url }}
              allowsFullscreenVideo
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              startInLoadingState
              style={{ flex: 1, backgroundColor: '#000000' }}
            />
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, backgroundColor: '#000000' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingBottom: 12,
    backgroundColor: '#0F172A',
    gap: 8,
  },
  modalTitle: { flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
