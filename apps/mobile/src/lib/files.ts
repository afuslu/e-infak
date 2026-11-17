import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { absoluteApiUrl, apiBlob, authHeader, ensureFreshToken, Query } from './api';

/** Kimlik doğrulamalı bir PDF'i indirir; tarayıcıda yeni sekmede açar, cihazda paylaşım sayfasını açar. */
export async function openPdf(path: string, filename: string, query?: Query): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = await apiBlob(path, query);
    const url = URL.createObjectURL(blob);
    globalThis.open?.(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  await ensureFreshToken();
  const target = new File(Paths.cache, filename);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(absoluteApiUrl(path, query), target, { headers: authHeader() });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: filename });
  }
}
