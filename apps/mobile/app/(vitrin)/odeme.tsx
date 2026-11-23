import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Lock, X } from 'lucide-react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { useBrandColors } from '@/components/IddefChrome';
import { openUrl } from '@/lib/format';
import { space } from '@/theme';

function parseFinishUrl(url: string): { outcome: 'ok' | 'fail'; checkoutId?: string } | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  const isSuccess = lower.includes('/bagis/basarili');
  const isFail = lower.includes('/bagis/hata');
  if (!isSuccess && !isFail) return null;
  const match = /[?&]checkout=([a-f0-9-]+)/i.exec(url);
  return {
    outcome: isSuccess ? 'ok' : 'fail',
    checkoutId: match?.[1],
  };
}

export default function InAppPaymentWebViewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { primary } = useBrandColors();
  const { checkoutId, redirectUrl } = useLocalSearchParams<{
    checkoutId: string;
    redirectUrl: string;
  }>();

  const [loading, setLoading] = useState(true);
  const finishedRef = useRef(false);

  const completeWith = (outcome: 'ok' | 'fail', id?: string) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    router.replace({
      pathname: '/(vitrin)/odeme-sonuc',
      params: {
        checkoutId: id || String(checkoutId || ''),
        outcome,
      },
    } as any);
  };

  const handleNavChange = (nav: WebViewNavigation) => {
    const parsed = parseFinishUrl(nav.url);
    if (parsed) {
      completeWith(parsed.outcome, parsed.checkoutId);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Ödemeden Çık',
      'Ödeme işlemini yarıda bırakmak istiyor musunuz?',
      [
        { text: 'Devam Et', style: 'cancel' },
        {
          text: 'Çık',
          style: 'destructive',
          onPress: () => router.back(),
        },
      ],
    );
  };

  if (!redirectUrl) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>Ödeme bağlantısı bulunamadı.</Text>
        <Pressable onPress={() => router.back()} style={[styles.btn, { backgroundColor: primary }]}>
          <Text style={styles.btnText}>Geri Dön</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { backgroundColor: primary, paddingTop: insets.top + 8 }]}>
        <View style={styles.titleWrap}>
          <Lock size={16} color="#E8D8A0" />
          <Text style={styles.headerTitle}>Güvenli Ödeme (3D Secure)</Text>
        </View>
        <Pressable onPress={handleCancel} style={styles.closeBtn} accessibilityRole="button">
          <X size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      {Platform.OS === 'web' ? (
        <View style={styles.center}>
          <Text style={styles.webHint}>
            Web önizlemesinde güvenli ödeme sayfası yeni sekmede açılır. Ödemeyi tamamladıktan sonra aşağıdan durumu kontrol edin.
          </Text>
          <Pressable
            onPress={() => openUrl(String(redirectUrl))}
            style={[styles.btn, { backgroundColor: primary }]}
          >
            <Text style={styles.btnText}>Ödeme Sayfasını Aç</Text>
          </Pressable>
          <Pressable
            onPress={() => completeWith('ok', String(checkoutId || ''))}
            style={[styles.btnOutline, { borderColor: primary }]}
          >
            <Text style={[styles.btnOutlineText, { color: primary }]}>Ödemeyi Tamamladım, Sonucu Gör</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            source={{ uri: String(redirectUrl) }}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onNavigationStateChange={handleNavChange}
            onShouldStartLoadWithRequest={(req) => {
              const parsed = parseFinishUrl(req.url);
              if (parsed) {
                completeWith(parsed.outcome, parsed.checkoutId);
                return false;
              }
              return true;
            }}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            startInLoadingState
          />
          {loading ? (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color={primary} />
              <Text style={styles.loadingText}>Banka güvenli ödeme ekranı yükleniyor...</Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingBottom: 12,
  },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255,255,255,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: { fontSize: 13, color: '#334155', fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: 12 },
  errText: { fontSize: 15, color: '#334155' },
  webHint: { fontSize: 14, color: '#475569', textAlign: 'center', lineHeight: 20 },
  btn: { paddingHorizontal: 20, paddingVertical: 13, borderRadius: 12 },
  btnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  btnOutline: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  btnOutlineText: { fontSize: 14, fontWeight: '800' },
});
