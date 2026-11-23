import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  FileDown,
  Home,
  Landmark,
  RefreshCw,
} from 'lucide-react-native';
import { fetchCheckoutStatus, openPublicReceiptPdf } from '@/api/public';
import { useBrandColors } from '@/components/IddefChrome';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { notify, notifyError } from '@/components/toast';
import { money } from '@/lib/format';
import { radius, space } from '@/theme';

export default function PaymentResultScreen() {
  const router = useRouter();
  const { status: authStatus, mode } = useAuth();
  const { clearCart } = useCart();
  const { primary } = useBrandColors();

  const {
    checkoutId,
    outcome,
    transferRef,
    bankName,
    iban,
    accountHolder,
  } = useLocalSearchParams<{
    checkoutId: string;
    outcome?: string;
    transferRef?: string;
    bankName?: string;
    iban?: string;
    accountHolder?: string;
  }>();

  const statusQuery = useQuery({
    queryKey: ['checkout', 'status', checkoutId],
    queryFn: () => fetchCheckoutStatus(String(checkoutId)),
    enabled: !!checkoutId,
    refetchInterval: (query) => {
      const st = query.state.data?.status;
      if (!st || st === 'pending') return 2500;
      return false;
    },
  });

  const data = statusQuery.data;
  const orderStatus = (data?.status || (outcome === 'transfer' ? 'awaiting_transfer' : '')).toLowerCase();
  const isPaid = orderStatus === 'paid';
  const isTransfer = orderStatus === 'awaiting_transfer' || outcome === 'transfer';
  const isFailed = orderStatus === 'failed' || orderStatus === 'cancelled' || (outcome === 'fail' && !isPaid && !isTransfer);
  const isPending = !isPaid && !isTransfer && !isFailed;

  useEffect(() => {
    if (isPaid) {
      clearCart();
    }
  }, [isPaid, clearCart]);

  const copyText = async (label: string, value?: string | null) => {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    notify(`${label} kopyalandı.`);
  };

  const downloadReceipt = async (receiptNo: string, verifyCode?: string | null) => {
    try {
      await openPublicReceiptPdf(receiptNo, verifyCode);
    } catch (e) {
      notifyError(e);
    }
  };

  const isDonor = authStatus === 'signedIn' && mode === 'donor';
  const effectiveRef = data?.transfer_reference || transferRef;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ padding: space.lg, paddingBottom: 60, gap: space.md }}
    >
      {isPending ? (
        <View style={styles.heroCard}>
          <ActivityIndicator size="large" color={primary} />
          <Text style={styles.heroTitle}>Ödemeniz Doğrulanıyor...</Text>
          <Text style={styles.heroSub}>
            Banka onayı kontrol ediliyor, lütfen birkaç saniye bekleyin.
          </Text>
          <Pressable
            onPress={() => statusQuery.refetch()}
            style={[styles.outlineBtn, { borderColor: primary }]}
          >
            <RefreshCw size={16} color={primary} />
            <Text style={[styles.outlineBtnText, { color: primary }]}>Durumu Yenile</Text>
          </Pressable>
        </View>
      ) : isPaid ? (
        <View style={styles.heroCard}>
          <View style={[styles.iconCircle, { backgroundColor: '#DCFCE7' }]}>
            <CheckCircle2 size={44} color="#15803D" />
          </View>
          <Text style={styles.heroTitle}>Bağışınız Alındı, Allah Kabul Etsin</Text>
          <Text style={styles.heroSub}>
            Toplam {money(data?.total_cents || 0, data?.currency || 'TRY')} tutarındaki bağışınız onaylandı ve kayda alındı.
          </Text>
        </View>
      ) : isTransfer ? (
        <View style={styles.heroCard}>
          <View style={[styles.iconCircle, { backgroundColor: `${primary}18` }]}>
            <Landmark size={40} color={primary} />
          </View>
          <Text style={styles.heroTitle}>Havale / EFT Talebiniz Oluşturuldu</Text>
          <Text style={styles.heroSub}>
            Aşağıdaki açıklama kodunu havale/EFT açıklamasına yazarak transferi tamamladığınızda bağışınız otomatik eşleşir.
          </Text>
        </View>
      ) : (
        <View style={styles.heroCard}>
          <View style={[styles.iconCircle, { backgroundColor: '#FEE2E2' }]}>
            <AlertCircle size={44} color="#DC2626" />
          </View>
          <Text style={styles.heroTitle}>Ödeme Tamamlanamadı</Text>
          <Text style={styles.heroSub}>
            {data?.failure_message || 'Banka işlemi onaylamadı veya iptal edildi. Sepetiniz korundu, tekrar deneyebilirsiniz.'}
          </Text>
        </View>
      )}

      {/* Havale / EFT Detay Kartı */}
      {isTransfer ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>HAVALE / EFT BİLGİLERİ</Text>
          {effectiveRef ? (
            <Pressable
              onPress={() => copyText('Açıklama kodu', effectiveRef)}
              style={[styles.copyRow, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.copyLabel}>Açıklama Kodu (Zorunlu)</Text>
                <Text style={styles.copyValue}>{effectiveRef}</Text>
              </View>
              <Copy size={18} color="#B45309" />
            </Pressable>
          ) : null}

          {iban ? (
            <Pressable
              onPress={() => copyText('IBAN', String(iban))}
              style={styles.copyRow}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.copyLabel}>{bankName || 'Banka IBAN'}</Text>
                <Text style={styles.copyValue}>{iban}</Text>
              </View>
              <Copy size={18} color={primary} />
            </Pressable>
          ) : null}

          {accountHolder ? (
            <Pressable
              onPress={() => copyText('Alıcı adı', String(accountHolder))}
              style={styles.copyRow}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.copyLabel}>Alıcı Adı</Text>
                <Text style={styles.copyValue}>{accountHolder}</Text>
              </View>
              <Copy size={18} color={primary} />
            </Pressable>
          ) : null}

          {data?.total_cents ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Gönderilecek Tutar</Text>
              <Text style={[styles.summaryVal, { color: primary }]}>
                {money(data.total_cents, data.currency)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Makbuzlar & Kalemler */}
      {data?.items?.length ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>BAĞIŞ DETAYLARI</Text>
          {data.items.map((item, idx) => (
            <View key={`${item.campaign_id}-${idx}`} style={styles.itemRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.itemTitle}>
                  {item.campaign_title} {item.quantity > 1 ? `(${item.quantity} adet)` : ''}
                </Text>
                {item.receipt_number ? (
                  <Text style={styles.itemSub}>Makbuz No: {item.receipt_number}</Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={[styles.itemAmount, { color: primary }]}>
                  {money(item.total_amount_cents, data.currency)}
                </Text>
                {item.receipt_number && item.verify_code ? (
                  <Pressable
                    onPress={() => downloadReceipt(item.receipt_number!, item.verify_code)}
                    style={[styles.pdfBtn, { borderColor: primary }]}
                  >
                    <FileDown size={14} color={primary} />
                    <Text style={[styles.pdfBtnText, { color: primary }]}>Makbuz PDF</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Alt Aksiyonlar */}
      <View style={{ gap: space.sm }}>
        {isFailed ? (
          <Pressable
            onPress={() => router.replace('/(vitrin)/sepet' as Href)}
            style={[styles.primaryBtn, { backgroundColor: primary }]}
          >
            <Text style={styles.primaryBtnText}>Sepete Dön ve Tekrar Dene</Text>
          </Pressable>
        ) : null}

        {isDonor ? (
          <Pressable
            onPress={() => router.replace('/(donor)/bagislarim' as Href)}
            style={[styles.primaryBtn, { backgroundColor: primary }]}
          >
            <Text style={styles.primaryBtnText}>Bağışlarım Ekranına Git</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => router.replace('/(vitrin)' as Href)}
          style={[styles.outlineBtn, { borderColor: primary }]}
        >
          <Home size={17} color={primary} />
          <Text style={[styles.outlineBtnText, { color: primary }]}>Anasayfaya Dön</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F8F7' },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: space.xl,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  iconCircle: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 19, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  heroSub: { fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 20 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: space.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#64748B', letterSpacing: 0.7 },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  copyLabel: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  copyValue: { fontSize: 14, color: '#0F172A', fontWeight: '800', marginTop: 2 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 },
  summaryLabel: { fontSize: 13, color: '#475569', fontWeight: '600' },
  summaryVal: { fontSize: 17, fontWeight: '900' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  itemSub: { fontSize: 12, color: '#64748B' },
  itemAmount: { fontSize: 14, fontWeight: '800' },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pdfBtnText: { fontSize: 11, fontWeight: '800' },
  primaryBtn: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  outlineBtn: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: space.lg,
    backgroundColor: '#FFFFFF',
  },
  outlineBtnText: { fontSize: 14, fontWeight: '800' },
});
