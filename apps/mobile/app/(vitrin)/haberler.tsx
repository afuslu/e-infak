import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Href, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Calendar } from 'lucide-react-native';
import { fetchContentPosts, resolveMediaUrl } from '@/api/public';
import { IddefBottomBar, IddefHeader, useBrandColors } from '@/components/IddefChrome';
import { date } from '@/lib/format';
import { radius, space } from '@/theme';

const KIND_TABS = [
  { key: 'all', label: 'Tümü' },
  { key: 'haber', label: 'Haberler' },
  { key: 'faaliyet', label: 'Faaliyetler' },
  { key: 'blog', label: 'Blog' },
];

export default function NewsListScreen() {
  const router = useRouter();
  const { primary, site } = useBrandColors();
  const [kind, setKind] = useState('all');

  const postsQuery = useQuery({
    queryKey: ['public', 'content-posts', kind],
    queryFn: () => fetchContentPosts(kind),
  });

  const posts = postsQuery.data ?? [];

  return (
    <View style={styles.root}>
      <IddefHeader title="Haberler & Faaliyetler" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 118 }}
        refreshControl={
          <RefreshControl
            refreshing={postsQuery.isRefetching}
            onRefresh={() => postsQuery.refetch()}
            tintColor={primary}
          />
        }
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {KIND_TABS.map((t) => {
            const active = kind === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setKind(t.key)}
                style={[
                  styles.chip,
                  active
                    ? { backgroundColor: primary, borderColor: primary }
                    : { backgroundColor: '#FFFFFF', borderColor: '#DCE4E0' },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? '#FFFFFF' : '#334155' }]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.list}>
          {postsQuery.isLoading ? (
            <ActivityIndicator size="large" color={primary} style={{ marginTop: 40 }} />
          ) : posts.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Henüz yayınlanmış içerik bulunmuyor.</Text>
            </View>
          ) : (
            posts.map((p) => {
              const img = resolveMediaUrl(p.image_url, site?.url);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => router.push(`/(vitrin)/haber/${encodeURIComponent(p.slug)}` as Href)}
                  style={styles.card}
                >
                  {img ? <Image source={{ uri: img }} style={styles.img} resizeMode="cover" /> : null}
                  <View style={styles.body}>
                    <View style={styles.metaRow}>
                      <View style={[styles.badge, { backgroundColor: `${primary}14` }]}>
                        <Text style={[styles.badgeText, { color: primary }]}>
                          {p.kind.toLocaleUpperCase('tr-TR')}
                        </Text>
                      </View>
                      {p.published_at ? (
                        <View style={styles.dateRow}>
                          <Calendar size={13} color="#64748B" />
                          <Text style={styles.dateText}>{date(p.published_at)}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.title}>{p.title}</Text>
                    {p.summary ? (
                      <Text style={styles.summary} numberOfLines={3}>
                        {p.summary}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      <IddefBottomBar active="news" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F8F7' },
  filterRow: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '700' },
  list: { paddingHorizontal: space.lg, gap: space.md },
  emptyBox: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: space.xl, alignItems: 'center' },
  emptyText: { color: '#64748B', fontSize: 14 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  img: { width: '100%', height: 175, backgroundColor: '#E2E8F0' },
  body: { padding: space.md, gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontSize: 10, fontWeight: '800' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateText: { fontSize: 12, color: '#64748B' },
  title: { fontSize: 16, fontWeight: '800', color: '#0F172A', lineHeight: 22 },
  summary: { fontSize: 13, color: '#475569', lineHeight: 19 },
});
