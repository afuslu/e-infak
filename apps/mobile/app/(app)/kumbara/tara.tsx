import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { af } from '@/lib/api';
import { remember } from '@/lib/selected';
import { MoneyBox } from '@/api/types';
import { Btn, Loading, Notice, Screen } from '@/components/ui';
import { font, space, useTheme } from '@/theme';

/** QR içeriği kumbara kodu (KMB-0001) ya da kodu içeren bir bağlantı olabilir. */
function extractCode(data: string): string {
  const text = data.trim();
  const match = /([A-Za-z]{2,6}-\d{2,8})/.exec(text);
  return (match ? match[1] : text.split('/').pop() || text).toUpperCase();
}

export default function Scan() {
  const router = useRouter();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const busy = useRef(false);
  const [message, setMessage] = useState<string | null>(null);

  const onScan = async ({ data }: { data: string }) => {
    // Kamera aynı kodu art arda verir; bir arama bitmeden yenisi başlamaz.
    if (busy.current) return;
    busy.current = true;
    const code = extractCode(data);
    setMessage(`${code} aranıyor…`);
    try {
      const boxes = await af<MoneyBox[]>('/money-boxes', { query: { q: code } });
      const box = boxes.find((b) => b.code.toUpperCase() === code || b.id === data.trim()) || (boxes.length === 1 ? boxes[0] : undefined);
      if (!box) {
        setMessage(`"${code}" koduyla kumbara bulunamadı.`);
        setTimeout(() => { busy.current = false; }, 2000);
        return;
      }
      remember('box', box.id, box);
      router.replace({ pathname: '/kumbara/[id]', params: { id: box.id } });
    } catch (e: any) {
      setMessage(e.message);
      setTimeout(() => { busy.current = false; }, 2000);
    }
  };

  if (!permission) return <Loading />;
  if (!permission.granted) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'QR kod okut' }} />
        <Notice text="Kumbara QR kodlarını okutmak için kamera izni gerekiyor." />
        <Btn title="Kamera izni ver" onPress={requestPermission} />
      </Screen>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Stack.Screen options={{ title: 'QR kod okut' }} />
      <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScan} />
      <View style={[styles.frame, { borderColor: colors.primaryLine }]} pointerEvents="none" />
      <View style={styles.bottom}>
        <Text style={[styles.text, { color: colors.white }]}>{message || 'Kumbaranın üzerindeki QR kodu çerçeveye getirin.'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { position: 'absolute', top: '25%', left: '15%', width: '70%', aspectRatio: 1, borderWidth: 3, borderRadius: 20 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: space.xl, backgroundColor: 'rgba(0,0,0,0.6)' },
  text: { fontSize: font.md, textAlign: 'center' },
});
