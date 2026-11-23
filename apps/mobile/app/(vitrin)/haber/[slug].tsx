import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Video } from 'lucide-react-native';
import { fetchContentPost, resolveMediaUrl } from '@/api/public';
import { useBrandColors } from '@/components/IddefChrome';
import { date, openUrl } from '@/lib/format';
import { radius, space } from '@/theme';

export default function NewsDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { primary, site } = useBrandColors();

  const postQuery = useQuery({
    queryKey: ['public', 'content-post', slug],
    queryFn: () => fetchContentPost(String(slug)),
    enabled: !!slug,
  });

  if (postQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={primary} />
      </View>
    );
  }

  const post = postQuery.data;
  if (!post) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>İçerik bulunamadı.</Text>
      </View>
    );
  }

  const img = resolveMediaUrl(post.image_url, site?.url);
  const paragraphs = (post.body || '').split(/\n{2,}/).filter((p) => p.trim());

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: 48 }}>
      {img ? <Image source={{ uri: img }} style={styles.cover} resizeMode="cover" /> : null}
      <View style={styles.body}>
        {post.published_at ? (
          <View style={styles.dateRow}>
            <Calendar size={14} color="#64748B" />
            <Text style={styles.dateText}>{date(post.published_at)}</Text>
          </View>
        ) : null}
        <Text style={styles.title}>{post.title}</Text>
        {post.summary ? <Text style={styles.summary}>{post.summary}</Text> : null}

        {post.video_url ? (
          <Pressable
            onPress={() => openUrl(post.video_url!)}
            style={[styles.videoBtn, { borderColor: primary }]}
          >
            <Video size={18} color={primary} />
            <Text style={[styles.videoBtnText, { color: primary }]}>Videoyu İzle</Text>
          </Pressable>
        ) : null}

        <View style={styles.contentWrap}>
          {paragraphs.map((p, idx) => {
            const trimmed = p.trim();
            if (trimmed.startsWith('## ')) {
              return (
                <Text key={idx} style={styles.subheading}>
                  {trimmed.slice(3)}
                </Text>
              );
            }
            return (
              <Text key={idx} style={styles.paragraph}>
                {trimmed}
              </Text>
            );
          })}
        </View>

        {post.gallery_urls && post.gallery_urls.length > 0 ? (
          <View style={styles.galleryWrap}>
            {post.gallery_urls.map((gUrl, i) => {
              const resolved = resolveMediaUrl(gUrl, site?.url);
              if (!resolved) return null;
              return <Image key={i} source={{ uri: resolved }} style={styles.galleryImg} resizeMode="cover" />;
            })}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  emptyText: { color: '#64748B', fontSize: 15 },
  cover: { width: '100%', height: 230, backgroundColor: '#E2E8F0' },
  body: { padding: space.lg, gap: 12 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateText: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A', lineHeight: 28 },
  summary: { fontSize: 15, color: '#475569', lineHeight: 22, fontWeight: '500' },
  videoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  videoBtnText: { fontSize: 14, fontWeight: '800' },
  contentWrap: { gap: 12, marginTop: 4 },
  subheading: { fontSize: 17, fontWeight: '800', color: '#0F172A', marginTop: 6 },
  paragraph: { fontSize: 15, color: '#334155', lineHeight: 24 },
  galleryWrap: { gap: space.sm, marginTop: 8 },
  galleryImg: { width: '100%', height: 210, borderRadius: 14, backgroundColor: '#E2E8F0' },
});
