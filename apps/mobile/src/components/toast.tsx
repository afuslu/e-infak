import React, { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, radius, space, useTheme } from '@/theme';

type Toast = { id: number; text: string; tone: 'ok' | 'error' };
let listener: ((toast: Toast) => void) | null = null;
let counter = 0;

/** Kısa bilgi mesajı (web'de Alert çalışmadığı için uygulama içi). */
export function notify(text: string, tone: 'ok' | 'error' = 'ok') {
  listener?.({ id: ++counter, text, tone });
}

export function notifyError(error: unknown) {
  notify((error as any)?.message || 'İşlem tamamlanamadı.', 'error');
}

/** Onay penceresi; cihazda Alert, tarayıcıda confirm. */
export function confirm(title: string, message?: string, okLabel = 'Evet', destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(!!globalThis.confirm?.(message ? `${title}\n\n${message}` : title));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Vazgeç', style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export function ToastHost() {
  const { colors, dark } = useTheme();
  const [toast, setToast] = useState<Toast | null>(null);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    listener = setToast;
    return () => {
      listener = null;
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.tone === 'error' ? 5000 : 2800);
    return () => clearTimeout(timer);
  }, [toast]);
  if (!toast) return null;
  const bg = toast.tone === 'error' ? (dark ? '#991B1B' : colors.danger) : (dark ? '#065F46' : colors.primaryDeep);
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 84 }]}>
      <View style={[styles.box, { backgroundColor: bg }]} accessibilityRole="alert">
        <Text style={[styles.text, { color: colors.white }]}>{toast.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: space.lg, zIndex: 1000 },
  box: { borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, maxWidth: 480 },
  text: { fontSize: font.md, fontWeight: '600', textAlign: 'center' },
});
