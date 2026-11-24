import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { IddefBottomBar, IddefHeader } from '@/components/IddefChrome';
import { Blocks } from './blocks';
import { useBrand } from './useAppDesign';

/** Tasarımdaki bir sayfa: üst bar, bloklar, sekmeler. */
export function PageScreen({ pageId }: { pageId: string }) {
  const b = useBrand();
  const client = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);
  const page = b.design.pages.find((p) => p.id === pageId);
  const refresh = async () => {
    setRefreshing(true);
    b.refetch();
    await client.invalidateQueries({ queryKey: ['public'] }).catch(() => {});
    setRefreshing(false);
  };
  return (
    <View style={{ flex: 1, backgroundColor: b.bg }}>
      <IddefHeader title={pageId === 'home' ? undefined : page?.title} />
      {!b.ready ? <ActivityIndicator size="large" color={b.primary} style={{ marginTop: 60 }} /> : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 118 }} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={b.primary} />}>
          {page ? <Blocks blocks={page.blocks} />
            : <Text style={{ padding: 32, textAlign: 'center', color: b.muted }}>Bu sayfa artık yayında değil.</Text>}
        </ScrollView>
      )}
      <IddefBottomBar page={pageId} />
    </View>
  );
}
