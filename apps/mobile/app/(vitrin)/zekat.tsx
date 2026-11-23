import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Href, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Calculator, Heart } from 'lucide-react-native';
import { fetchCampaigns, fetchZakatInfo } from '@/api/public';
import { useBrandColors } from '@/components/IddefChrome';
import { useCart } from '@/context/CartContext';
import { notify } from '@/components/toast';
import { money } from '@/lib/format';
import { radius, space } from '@/theme';

function num(v: string): number {
  const cleaned = (v || '').replace(/\s/g, '').replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export default function ZakatCalculatorScreen() {
  const router = useRouter();
  const { primary, accent } = useBrandColors();
  const { addItem, setCurrency } = useCart();

  const zakatQuery = useQuery({
    queryKey: ['public', 'zakat-info'],
    queryFn: fetchZakatInfo,
  });

  const campaignsQuery = useQuery({
    queryKey: ['public', 'campaigns', 'active'],
    queryFn: () => fetchCampaigns({ page_size: 100 }),
  });

  const [cashTry, setCashTry] = useState('');
  const [cashUsd, setCashUsd] = useState('');
  const [cashEur, setCashEur] = useState('');
  const [goldGrams, setGoldGrams] = useState('');
  const [tradeAssets, setTradeAssets] = useState('');
  const [debts, setDebts] = useState('');

  const goldPrice = zakatQuery.data?.gold_price_per_gram || 3000;
  const nisapLira = zakatQuery.data?.nisap_amount_lira || goldPrice * 80.18;
  const usdRate = zakatQuery.data?.usd_rate || 35;
  const eurRate = zakatQuery.data?.eur_rate || 38;

  const calc = useMemo(() => {
    const totalAssets =
      num(cashTry) +
      num(cashUsd) * usdRate +
      num(cashEur) * eurRate +
      num(goldGrams) * goldPrice +
      num(tradeAssets);
    const totalDebts = num(debts);
    const netWealth = Math.max(0, totalAssets - totalDebts);
    const aboveNisap = netWealth >= nisapLira && netWealth > 0;
    const zakatLira = aboveNisap ? netWealth * 0.025 : 0;
    return { totalAssets, totalDebts, netWealth, aboveNisap, zakatLira };
  }, [cashTry, cashUsd, cashEur, goldGrams, tradeAssets, debts, goldPrice, nisapLira, usdRate, eurRate]);

  const addZakatToCart = () => {
    const cents = Math.round(calc.zakatLira * 100);
    if (cents < 100) {
      notify('Sepete eklemek için hesaplanan zekat tutarı en az 1 TL olmalıdır.');
      return;
    }
    const all = campaignsQuery.data ?? [];
    const zakatCamp =
      all.find((c) => c.is_zakat) ||
      all.find((c) => (c.category || '').toLowerCase() === 'zekat') ||
      all.find((c) => c.title.toLocaleLowerCase('tr-TR').includes('zekat')) ||
      all[0];

    if (!zakatCamp) {
      notify('Aktif zekat kampanyası bulunamadı.');
      return;
    }

    setCurrency('TRY');
    addItem({
      campaign_id: zakatCamp.id,
      campaign_slug: zakatCamp.slug,
      campaign_title: zakatCamp.title,
      cover_image_url: zakatCamp.cover_image_url,
      unit_amount_cents: cents,
      quantity: 1,
      donor_message: 'Zekat Hesaplayıcı',
    });
    notify('Zekat tutarınız bağış sepetine eklendi.');
    router.push('/(vitrin)/sepet' as Href);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 60, gap: space.md }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.infoBanner, { backgroundColor: primary }]}>
          <View style={styles.infoHead}>
            <Calculator size={20} color="#E8D8A0" />
            <Text style={styles.infoTitle}>Güncel Nisap & Kur Bilgisi</Text>
          </View>
          {zakatQuery.isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <View style={styles.ratesGrid}>
              <View style={styles.rateBox}>
                <Text style={styles.rateLabel}>Gram Altın</Text>
                <Text style={styles.rateVal}>{money(Math.round(goldPrice * 100))}</Text>
              </View>
              <View style={styles.rateBox}>
                <Text style={styles.rateLabel}>Nisap (80,18 gr)</Text>
                <Text style={styles.rateVal}>{money(Math.round(nisapLira * 100))}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>VARLIKLARINIZ</Text>
          <NumField label="Nakit Para (TL)" value={cashTry} onChange={setCashTry} placeholder="0" />
          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <NumField label={`Dolar ($ · ${usdRate.toFixed(2)} ₺)`} value={cashUsd} onChange={setCashUsd} placeholder="0" />
            </View>
            <View style={{ flex: 1 }}>
              <NumField label={`Euro (€ · ${eurRate.toFixed(2)} ₺)`} value={cashEur} onChange={setCashEur} placeholder="0" />
            </View>
          </View>
          <NumField label="Altın (Gram)" value={goldGrams} onChange={setGoldGrams} placeholder="0" />
          <NumField label="Ticari Mal / Alacaklar (TL)" value={tradeAssets} onChange={setTradeAssets} placeholder="0" />
          <NumField label="Kısa Vadeli Borçlar (TL — Düşülür)" value={debts} onChange={setDebts} placeholder="0" />
        </View>

        {/* Sonuç Kartı */}
        <View style={styles.resultCard}>
          <View style={styles.resRow}>
            <Text style={styles.resLabel}>Toplam Varlık</Text>
            <Text style={styles.resVal}>{money(Math.round(calc.totalAssets * 100))}</Text>
          </View>
          <View style={styles.resRow}>
            <Text style={styles.resLabel}>Net Zekata Tabi Tutar</Text>
            <Text style={styles.resVal}>{money(Math.round(calc.netWealth * 100))}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.resRow}>
            <Text style={styles.zakatLabel}>Ödenecek Zekat (%2,5)</Text>
            <Text style={[styles.zakatVal, { color: primary }]}>
              {money(Math.round(calc.zakatLira * 100))}
            </Text>
          </View>
          {!calc.aboveNisap && calc.netWealth > 0 ? (
            <Text style={styles.nisapWarn}>
              Net varlığınız nisap miktarı ({money(Math.round(nisapLira * 100))}) altında olduğu için zekat farz değildir.
            </Text>
          ) : null}

          <Pressable
            onPress={addZakatToCart}
            disabled={!calc.aboveNisap}
            style={[
              styles.ctaBtn,
              { backgroundColor: calc.aboveNisap ? accent : '#CBD5E1' },
            ]}
          >
            <Heart size={18} color="#FFFFFF" />
            <Text style={styles.ctaText}>Zekatı Sepete Ekle</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function NumField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F8F7' },
  infoBanner: { borderRadius: 18, padding: space.md, gap: 10 },
  infoHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  ratesGrid: { flexDirection: 'row', gap: space.sm },
  rateBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 12,
    padding: space.sm,
  },
  rateLabel: { color: '#E8D8A0', fontSize: 11, fontWeight: '700' },
  rateVal: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginTop: 2 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: space.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#64748B', letterSpacing: 0.7 },
  twoCol: { flexDirection: 'row', gap: space.sm },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#334155' },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },

  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: space.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  resRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resLabel: { fontSize: 13, color: '#475569', fontWeight: '600' },
  resVal: { fontSize: 14, color: '#0F172A', fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#E2E8F0' },
  zakatLabel: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  zakatVal: { fontSize: 22, fontWeight: '900' },
  nisapWarn: { fontSize: 12, color: '#B45309', lineHeight: 18 },
  ctaBtn: {
    minHeight: 48,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  ctaText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
