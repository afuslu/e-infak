import React, { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { notify } from '@/components/toast';
import { Loading, Notice } from '@/components/ui';
import { PageScreen } from '@/design/PageScreen';
import { usableDesign } from '@/design/types';
import { DesignPreview } from '@/design/useAppDesign';
import { af } from '@/lib/api';

/** Yetkili, Uygulama Yapıcı'daki taslağı kendi telefonunda dener. Bağış yapılmaz. */
export default function AppDesignPreviewScreen() {
  const [page, setPage] = useState('home');
  const query = useQuery({
    queryKey: ['app-design', 'draft'],
    queryFn: () => af<{ design: unknown }>('/app-builder/design'),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const design = query.data?.design;
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Uygulama önizleme' }} />
      {query.isLoading ? <Loading /> : query.isError ? <Notice text={(query.error as Error).message} tone="danger" />
        : usableDesign(design) ? (
          <DesignPreview value={{ design, openPage: setPage, blocked: notify }}>
            <PageScreen pageId={page} />
          </DesignPreview>
        ) : <Notice text="Bu taslak için uygulamayı güncelleyin." tone="warn" />}
    </View>
  );
}
