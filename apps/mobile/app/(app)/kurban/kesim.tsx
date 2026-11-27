import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useKeepAwake } from 'expo-keep-awake';
import { ChevronLeft, ChevronRight, CloudUpload, Square, Video } from 'lucide-react-native';
import { absoluteApiUrl, api, authHeader } from '@/lib/api';
import { KesimUpload, enqueueKesimVideo, pumpUploads, retryFailed, subscribeUploads } from '@/lib/videoUpload';
import { Btn, Chips, Empty, Loading, Notice, QueryView, Screen } from '@/components/ui';
import { notify, notifyError } from '@/components/toast';
import { font, radius, space, useTheme } from '@/theme';

type Campaign = { id: string; title: string };
type Share = { id: string; share_number?: number; name: string; kurban_type?: string };
type Animal = { id: string; animal_number: string; animal_label?: string; video_status?: string; shares: Share[] };
type Queue = { campaign: Campaign; waiting: Animal[]; slaughtered: Animal[]; auto_notify_video: boolean };

/**
 * Kasap tableti: sıradaki hayvanın kartını (numara + hissedarlar + niyet) tam ekran gösterir,
 * kesimi arka kamerayla kaydeder, hayvanı SMS'siz "kesildi" işaretler ve videoyu arka planda
 * yükler. Video tamamlanınca backend hissedarlara kişiye özel izleme linkini SMS'le gönderir.
 */
export default function KesimScreen() {
  useKeepAwake();
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const wide = width > height;
  const queryClient = useQueryClient();
  const camera = useRef<CameraView>(null);
  const cancelled = useRef(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<'card' | 'camera'>('card');
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploads, setUploads] = useState<KesimUpload[]>([]);
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();

  useEffect(() => {
    const off = subscribeUploads(setUploads);
    pumpUploads();
    return off;
  }, []);

  const campaigns = useQuery({ queryKey: ['kurban-campaigns'], queryFn: () => api<Campaign[]>('/kurban/campaigns') });
  const activeId = campaignId || campaigns.data?.[0]?.id || null;
  const queue = useQuery({
    queryKey: ['kurban-queue', activeId],
    enabled: !!activeId,
    queryFn: () => api<Queue>(`/kurban/campaigns/${activeId}/queue`),
  });
  const waiting = queue.data?.waiting || [];
  const current = waiting[Math.min(index, Math.max(waiting.length - 1, 0))];
  const cardSource = useMemo(
    () => (current ? { uri: absoluteApiUrl(`/kurban/animals/${current.id}/card.png`), headers: authHeader() } : null),
    [current?.id] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const pending = uploads.filter((u) => u.status !== 'done');
  const failed = uploads.filter((u) => u.status === 'error');
  const active = uploads.find((u) => u.status === 'uploading');

  const openCamera = async () => {
    if (!camPerm?.granted && !(await requestCam()).granted) return;
    if (!micPerm?.granted) await requestMic(); // sessiz kayıt da olur, ama tekbir/niyet duyulsun
    cancelled.current = false;
    setReady(false);
    setMode('camera');
  };

  const start = async () => {
    if (!camera.current || !current || recording) return;
    const animal = current;
    setRecording(true);
    try {
      const result = await camera.current.recordAsync({ maxDuration: 15 * 60 });
      if (cancelled.current || !result?.uri) return;
      setSaving(true);
      await enqueueKesimVideo(result.uri, animal);
      notify(`${animal.animal_number} kesildi · video yükleniyor`);
      setMode('card');
      setIndex(0);
      await queryClient.invalidateQueries({ queryKey: ['kurban-queue'] });
      queryClient.invalidateQueries({ queryKey: ['kurban-animals'] });
    } catch (e) {
      notifyError(e);
    } finally {
      setRecording(false);
      setSaving(false);
    }
  };

  const stop = () => camera.current?.stopRecording();
  const cancel = () => {
    cancelled.current = true;
    if (recording) camera.current?.stopRecording();
    setMode('card');
  };

  const strip = (
    <Pressable
      onPress={failed.length ? retryFailed : undefined}
      style={[styles.strip, { backgroundColor: failed.length ? colors.dangerSoft : colors.primarySoft }]}
    >
      <CloudUpload size={16} color={failed.length ? colors.danger : colors.primaryDark} />
      <Text style={{ color: failed.length ? colors.danger : colors.primaryDark, fontSize: font.sm, flex: 1 }}>
        {pending.length === 0
          ? 'Bütün videolar yüklendi'
          : `${pending.length} video bekliyor` +
            (active ? ` · ${active.animal_number} %${Math.floor((active.sent_bytes / Math.max(active.size, 1)) * 100)}` : '') +
            (failed.length ? ` · ${failed.length} hata, tekrar denemek için dokunun` : '')}
      </Text>
    </Pressable>
  );

  if (mode === 'camera' && current) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Stack.Screen options={{ title: `Kesim · ${current.animal_number}`, headerShown: !recording }} />
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode="video"
          mute={!micPerm?.granted}
          onCameraReady={() => setReady(true)}
        />
        {cardSource ? (
          <Image source={cardSource} style={[styles.pip, { width: wide ? 320 : 200 }]} resizeMode="contain" />
        ) : null}
        <View style={styles.camBar}>
          {recording ? <View style={styles.dot} /> : null}
          <Text style={styles.camText}>{recording ? `${current.animal_number} kaydediliyor` : current.animal_number}</Text>
          <View style={{ flex: 1 }} />
          {recording ? (
            <Btn title="Kesimi bitir" variant="danger" icon={<Square size={18} color={colors.danger} />} onPress={stop} loading={saving} />
          ) : (
            <Btn title="Kaydı başlat" icon={<Video size={18} color={colors.white} />} onPress={start} disabled={!ready} />
          )}
          <Btn title="Vazgeç" variant="outline" onPress={cancel} disabled={saving} />
        </View>
      </View>
    );
  }

  return (
    <Screen onRefresh={() => queue.refetch()} refreshing={queue.isRefetching}>
      <Stack.Screen options={{ title: 'Kesim modu' }} />
      {(campaigns.data?.length || 0) > 1 ? (
        <Chips
          options={(campaigns.data || []).map((c) => ({ value: c.id, label: c.title }))}
          value={activeId}
          onChange={(v) => {
            setCampaignId(v);
            setIndex(0);
          }}
        />
      ) : null}
      {strip}
      {queue.data && !queue.data.auto_notify_video ? (
        <Notice text="Otomatik SMS kapalı: videolar yüklenir, hissedarlara bildirim panelden gönderilir." />
      ) : null}
      {campaigns.isLoading ? <Loading /> : null}
      <QueryView query={queue}>
        {() =>
          !current ? (
            <Empty title="Kesilecek hayvan kalmadı" text="Bu kampanyada bekleyen hisseli hayvan yok." />
          ) : (
            <View style={{ gap: space.md }}>
              <View style={[styles.cardWrap, { borderColor: colors.primaryLine }]}>
                {cardSource ? <Image source={cardSource} style={styles.card} resizeMode="contain" /> : null}
              </View>
              <View style={styles.nav}>
                <Btn
                  title="Önceki"
                  variant="outline"
                  small
                  icon={<ChevronLeft size={16} color={colors.primaryDark} />}
                  disabled={index === 0}
                  onPress={() => setIndex((i) => Math.max(i - 1, 0))}
                />
                <Text style={{ color: colors.text, fontSize: font.md, flex: 1, textAlign: 'center' }}>
                  {Math.min(index, waiting.length - 1) + 1} / {waiting.length} bekleyen
                </Text>
                <Btn
                  title="Sonraki"
                  variant="outline"
                  small
                  icon={<ChevronRight size={16} color={colors.primaryDark} />}
                  disabled={index >= waiting.length - 1}
                  onPress={() => setIndex((i) => Math.min(i + 1, waiting.length - 1))}
                />
              </View>
              <Btn title={`${current.animal_number} için kesimi kaydet`} icon={<Video size={20} color={colors.white} />} onPress={openCamera} />
            </View>
          )
        }
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md },
  cardWrap: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#fff' },
  card: { width: '100%', aspectRatio: 16 / 9 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pip: { position: 'absolute', top: space.lg, left: space.lg, aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: '#fff' },
  camBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: space.md,
    padding: space.lg, backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#DC2626' },
  camText: { color: '#fff', fontSize: font.lg, fontWeight: '700' },
});
