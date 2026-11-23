import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, FileDown, Search } from 'lucide-react-native';
import { openPublicReceiptPdf, ReceiptVerifyResult, verifyPublicReceipt } from '@/api/public';
import { useBrandColors } from '@/components/IddefChrome';
import { notifyError } from '@/components/toast';
import { dateTime, money } from '@/lib/format';
import { radius, space } from '@/theme';

export default function ReceiptVerifyScreen() {
  const { primary } = useBrandColors();
  const [receiptNo, setReceiptNo] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [result, setResult] = useState<ReceiptVerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verifyMutation = useMutation({
    mutationFn: () => {
      if (!receiptNo.trim()) throw new Error('Lütfen makbuz numarasını girin.');
      return verifyPublicReceipt(receiptNo, verifyCode);
    },
    onSuccess: (data) => {
      setError(null);
      setResult(data);
    },
    onError: (e: any) => {
      setResult(null);
      setError(e?.message || 'Makbuz bulunamadı.');
    },
  });

  const downloadPdf = async () => {
    if (!result) return;
    try {
      await openPublicReceiptPdf(result.receipt_number, verifyCode.trim() || undefined);
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ padding: space.lg, gap: space.md }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <Text style={styles.title}>Bağış Makbuzu Doğrula</Text>
        <Text style={styles.sub}>
          Makbuzunuzun üzerinde yer alan makbuz numarasını girerek bağışınızın resmi kaydını sorgulayabilirsiniz.
        </Text>

        <View style={{ gap: 4 }}>
          <Text style={styles.label}>Makbuz Numarası *</Text>
          <TextInput
            value={receiptNo}
            onChangeText={setReceiptNo}
            placeholder="Örn: BG-123456-20261122-ABCD"
            placeholderTextColor="#94A3B8"
            autoCapitalize="characters"
            style={styles.input}
          />
        </View>

        <View style={{ gap: 4 }}>
          <Text style={styles.label}>Doğrulama Kodu (PDF için isteğe bağlı)</Text>
          <TextInput
            value={verifyCode}
            onChangeText={setVerifyCode}
            placeholder="Makbuz üzerindeki doğrulama kodu"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            style={styles.input}
          />
        </View>

        {error ? (
          <View style={styles.errBox}>
            <Text style={styles.errText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => verifyMutation.mutate()}
          disabled={verifyMutation.isPending}
          style={[styles.btn, { backgroundColor: primary }]}
        >
          {verifyMutation.isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Search size={18} color="#FFFFFF" />
              <Text style={styles.btnText}>Makbuzu Sorgula</Text>
            </>
          )}
        </Pressable>
      </View>

      {result ? (
        <View style={styles.card}>
          <View style={styles.okHead}>
            <CheckCircle2 size={24} color="#15803D" />
            <Text style={styles.okTitle}>
              {result.status === 'valid'
                ? 'Geçerli Bağış Makbuzu'
                : result.status === 'refunded'
                  ? 'İade Edilmiş Makbuz'
                  : 'İptal Edilmiş Makbuz'}
            </Text>
          </View>
          <InfoRow label="Makbuz No" value={result.receipt_number} />
          <InfoRow label="Kampanya" value={result.campaign_title || 'Genel Bağış'} />
          <InfoRow
            label="Tutar"
            value={money(Math.round((result.amount_lira || 0) * 100), result.currency)}
          />
          {result.donor_name ? <InfoRow label="Bağışçı" value={result.donor_name} /> : null}
          {result.payment_method ? <InfoRow label="Ödeme Yöntemi" value={result.payment_method} /> : null}
          {result.created_at ? <InfoRow label="Tarih" value={dateTime(result.created_at)} /> : null}

          {result.code_verified ? (
            <Pressable onPress={downloadPdf} style={[styles.pdfBtn, { borderColor: primary }]}>
              <FileDown size={17} color={primary} />
              <Text style={[styles.pdfBtnText, { color: primary }]}>Makbuzu PDF Olarak İndir</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F8F7' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: space.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  sub: { fontSize: 13, color: '#64748B', lineHeight: 19 },
  label: { fontSize: 12, fontWeight: '700', color: '#334155' },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  errBox: { backgroundColor: '#FEF2F2', borderRadius: radius.md, padding: space.sm, borderWidth: 1, borderColor: '#FECACA' },
  errText: { color: '#B91C1C', fontSize: 13, fontWeight: '600' },
  btn: {
    minHeight: 48,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  okHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  okTitle: { fontSize: 16, fontWeight: '800', color: '#15803D' },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 10,
  },
  infoLabel: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  infoValue: { fontSize: 14, color: '#0F172A', fontWeight: '800', textAlign: 'right', flex: 1 },
  pdfBtn: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  pdfBtnText: { fontSize: 14, fontWeight: '800' },
});
