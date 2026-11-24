import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PageScreen } from '@/design/PageScreen';

export default function DesignedPageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PageScreen pageId={String(id || '')} />;
}
