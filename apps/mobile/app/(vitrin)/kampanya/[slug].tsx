import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Heart, Minus, Plus, ShoppingBag } from 'lucide-react-native';
import {
  CATEGORY_LABELS,
  fetchCampaignBySlug,
  fetchFxRates,
  fetchOrgSettings,
  resolveMediaUrl,
  SupportedCurrency,
} from '@/api/public';
import { useBrandColors } from '@/components/IddefChrome';
import { useCart } from '@/context/CartContext';
import { notify } from '@/components/toast';
import { centsToInput, money, toCents } from '@/lib/format';
import { initialChoice, isPriced, limits, optionsOf, packageCents, resolve } from '@/lib/donationOptions';
import { radius, space } from '@/theme';

export default function CampaignDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { primary, accent, site } = useBrandColors();
  const { addItem, currency, setCurrency } = useCart();

  const campaignQuery = useQuery({
    queryKey: ['public', 'campaign', slug],
    queryFn: () => fetchCampaignBySlug(String(slug)),
    enabled: !!slug,
  });

  const orgQuery = useQuery({
    queryKey: ['public', 'org-settings'],
    queryFn: fetchOrgSettings,
  });

  const campaign = campaignQuery.data;
  const options = optionsOf(campaign);
  const optionsKey = options ? JSON.stringify(options) : '';
  const bounds = limits(options);
  const fxQuery = useQuery({ queryKey: ['public', 'fx-rates'], queryFn: fetchFxRates, enabled: currency !== 'TRY' });
  const ratesTry = useMemo(() => {
    const out: Record<string, number> = {};
    Object.entries(fxQuery.data?.rates || {}).forEach(([k, v]) => { out[k] = Number(v?.rate_try) || 0; });
    return out;
  }, [fxQuery.data]);
  const enabledCurrencies = useMemo<SupportedCurrency[]>(() => {
    const raw = orgQuery.data?.enabled_payment_currencies || ['TRY'];
    const valid = raw.filter((c): c is SupportedCurrency => c === 'TRY' || c === 'USD' || c === 'EUR');
    return valid.length ? valid : ['TRY'];
  }, [orgQuery.data]);

  const suggestedAmounts = useMemo(() => {
    if (!campaign) return [25000, 50000, 100000];
    const ref = campaign.reference_amounts?.[currency];
    if (campaign.fixed_amount && ref) return [ref];
    if (currency === 'TRY' && campaign.suggested_amounts_cents?.length) {
      return campaign.suggested_amounts_cents;
    }
    if (ref) return [ref];
    return campaign.suggested_amounts_cents?.length
      ? campaign.suggested_amounts_cents
      : [25000, 50000, 100000];
  }, [campaign, currency]);

  const [amountInput, setAmountInput] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [onBehalfToggle, setOnBehalfToggle] = useState(false);
  const [onBehalfOf, setOnBehalfOf] = useState('');
  const [onBehalfPhone, setOnBehalfPhone] = useState('');
  const [donorMessage, setDonorMessage] = useState('');
  const [extraFields, setExtraFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (suggestedAmounts.length > 0) {
      setAmountInput(centsToInput(suggestedAmounts[0]));
    }
  }, [suggestedAmounts]);

  const [choice, setChoice] = useState(initialChoice(null));
  const pickChoice = (patch: Partial<typeof choice>) => setChoice((c) => ({ ...c, ...patch }));
  useEffect(() => {
    if (!optionsKey) return;
    const o = JSON.parse(optionsKey);
    setChoice(initialChoice(o));
    setQuantity(limits(o).min);
  }, [optionsKey]);

  const picked = campaign && options ? resolve(campaign, choice, currency, ratesTry, toCents(amountInput) || 0) : null;
  const unitCents = picked ? picked.unit || 0 : toCents(amountInput) || 0;
  const totalCents = unitCents * quantity;

  const validateAndBuild = () => {
    if (!campaign) return null;
    setError(null);
    if (picked && options?.mode !== 'free' && !picked.unit) {
      setError('Bu kampanya seçili para birimiyle bağışlanamıyor.');
      return null;
    }
    if (options?.intents?.length && !choice.intent) {
      setError('Lütfen niyet seçin.');
      return null;
    }
    const minCents = campaign.min_donation_cents || 100;
    if (!bounds.locked && unitCents < minCents) {
      setError(`Minimum bağış tutarı ${money(minCents, currency)} olmalıdır.`);
      return null;
    }
    const schema = campaign.checkout_fields_schema || [];
    const metadata: Record<string, any> = { ...(picked?.metadata || {}) };
    for (const f of schema) {
      const val = (extraFields[f.key] || '').trim();
      if (f.required && !val) {
        setError(`${f.label || f.key} alanı zorunludur.`);
        return null;
      }
      if (val) {
        metadata[f.key] = f.type === 'list' ? val.split(',').map((s) => s.trim()).filter(Boolean) : val;
      }
    }
    return {
      campaign_id: campaign.id,
      campaign_slug: campaign.slug,
      campaign_title: `${campaign.title}${picked?.suffix || ''}`,
      locked: bounds.locked,
      max_quantity: options ? bounds.max : undefined,
      cover_image_url: campaign.cover_image_url,
      unit_amount_cents: unitCents,
      quantity,
      on_behalf_of: onBehalfToggle && onBehalfOf.trim() ? onBehalfOf.trim() : undefined,
      on_behalf_of_phone: onBehalfToggle && onBehalfPhone.trim() ? onBehalfPhone.trim() : undefined,
      donor_message: donorMessage.trim() || undefined,
      metadata: Object.keys(metadata).length ? metadata : undefined,
    };
  };

  const handleAddToCart = (goToCart: boolean) => {
    const built = validateAndBuild();
    if (!built) return;
    addItem(built);
    if (goToCart) {
      router.push('/(vitrin)/sepet' as Href);
    } else {
      notify('Bağış sepetine eklendi.');
    }
  };

  const chipGroup = (label: string, chips: { key: string; label: string; on: boolean; press: () => void }[]) => (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipRow}>
        {chips.map((c) => (
          <Pressable key={c.key} onPress={c.press} accessibilityRole="button" accessibilityState={{ selected: c.on }}
            style={[styles.chip, c.on ? { backgroundColor: primary, borderColor: primary } : { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1' }]}>
            <Text style={[styles.chipText, { color: c.on ? '#FFFFFF' : '#0F172A' }]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  if (campaignQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={primary} />
      </View>
    );
  }

  if (!campaign) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Kampanya bulunamadı.</Text>
      </View>
    );
  }

  const coverUri = resolveMediaUrl(campaign.cover_image_url, site?.url);
  const pct =
    campaign.show_collected !== false && campaign.target_cents && campaign.target_cents > 0
      ? Math.min(100, Math.round(((campaign.collected_cents || 0) * 100) / campaign.target_cents))
      : null;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {coverUri ? <Image source={{ uri: coverUri }} style={styles.cover} resizeMode="cover" /> : null}

        <View style={styles.body}>
          <View style={styles.metaRow}>
            {campaign.category ? (
              <View style={[styles.badge, { backgroundColor: `${primary}14` }]}>
                <Text style={[styles.badgeText, { color: primary }]}>
                  {CATEGORY_LABELS[campaign.category.toLowerCase()] || campaign.category}
                </Text>
              </View>
            ) : null}
            {campaign.country ? <Text style={styles.country}>{campaign.country}</Text> : null}
          </View>

          <Text style={styles.title}>{campaign.title}</Text>
          {campaign.summary ? <Text style={styles.summary}>{campaign.summary}</Text> : null}

          {pct !== null ? (
            <View style={styles.progressCard}>
              <View style={styles.progressRow}>
                <Text style={[styles.progressCollected, { color: primary }]}>
                  {money(campaign.collected_cents || 0, campaign.currency || 'TRY')}
                </Text>
                <Text style={styles.progressTarget}>
                  Hedef: {money(campaign.target_cents || 0, campaign.currency || 'TRY')} (%{pct})
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: primary }]} />
              </View>
            </View>
          ) : null}

          {/* Bağış Seçenekleri Kartı */}
          <View style={styles.card}>
            {enabledCurrencies.length > 1 ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Para Birimi</Text>
                <View style={styles.chipRow}>
                  {enabledCurrencies.map((cur) => {
                    const active = currency === cur;
                    return (
                      <Pressable
                        key={cur}
                        onPress={() => setCurrency(cur)}
                        style={[
                          styles.chip,
                          active
                            ? { backgroundColor: primary, borderColor: primary }
                            : { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1' },
                        ]}
                      >
                        <Text style={[styles.chipText, { color: active ? '#FFFFFF' : '#334155' }]}>
                          {cur}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {options?.mode === 'packages' ? chipGroup('Paket', (options.packages || []).map((p) => {
              const price = packageCents(p.amount_cents, currency, ratesTry);
              return { key: p.id, label: `${p.label} · ${price === null ? '—' : money(price, currency)}`, on: choice.packageId === p.id, press: () => pickChoice({ packageId: p.id }) };
            })) : null}
            {options?.mode === 'duration' ? chipGroup('Süre', (options.durations || []).map((m) => (
              { key: String(m), label: `${m} Ay`, on: choice.months === m, press: () => pickChoice({ months: m }) }))) : null}
            {(options?.mode === 'duration' && options.duration_payment === 'donor_choice' && choice.months > 1) || (options && options.mode !== 'duration' && options.allow_recurring)
              ? chipGroup('Ödeme', [
                { key: 'once', label: options?.mode === 'duration' ? 'Peşin' : 'Tek seferlik', on: !choice.monthly, press: () => pickChoice({ monthly: false }) },
                { key: 'monthly', label: options?.mode === 'duration' ? 'Aylık öde' : 'Her ay düzenli', on: choice.monthly, press: () => pickChoice({ monthly: true }) },
              ]) : null}
            {options?.intents?.length ? chipGroup('Niyet *', options.intents.map((i) => (
              { key: i, label: i, on: choice.intent === i, press: () => pickChoice({ intent: i }) }))) : null}
            {options && isPriced(options.mode) ? (
              <Text style={styles.hint}>
                {unitCents ? `${money(unitCents, currency)}${picked?.monthly ? ` / ay${options.mode === 'duration' ? ` × ${choice.months}` : ''}` : ''}` : 'Bu kampanya seçili para birimiyle bağışlanamıyor.'}
              </Text>
            ) : null}

            {!options || options.mode === 'free' ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Bağış Tutarı ({currency})</Text>
              <View style={styles.chipRow}>
                {suggestedAmounts.map((amt) => {
                  const active = unitCents === amt;
                  return (
                    <Pressable
                      key={amt}
                      onPress={() => setAmountInput(centsToInput(amt))}
                      style={[
                        styles.chip,
                        active
                          ? { backgroundColor: primary, borderColor: primary }
                          : { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1' },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: active ? '#FFFFFF' : '#0F172A' }]}>
                        {money(amt, currency)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {campaign.allow_custom_amount !== false && !campaign.fixed_amount ? (
                <TextInput
                  value={amountInput}
                  onChangeText={setAmountInput}
                  keyboardType="decimal-pad"
                  placeholder="Diğer tutar girin"
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                />
              ) : null}
            </View>

            ) : null}

            {/* Adet / Hisse */}
            {!options || bounds.max > 1 ? (
            <View style={styles.qtyRow}>
              <Text style={styles.label}>{options?.unit_label || (options?.mode === 'share' ? 'Hisse' : options ? 'Adet' : 'Adet / Hisse')}</Text>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => setQuantity((q) => Math.max(bounds.min, q - 1))}
                  style={styles.stepBtn}
                  accessibilityRole="button"
                >
                  <Minus size={18} color="#0F172A" />
                </Pressable>
                <Text style={styles.qtyVal}>{quantity}</Text>
                <Pressable
                  onPress={() => setQuantity((q) => Math.min(bounds.max, q + 1))}
                  style={styles.stepBtn}
                  accessibilityRole="button"
                >
                  <Plus size={18} color="#0F172A" />
                </Pressable>
              </View>
            </View>

            ) : null}

            {/* Kampanyaya Özel Dinamik Alanlar (Kurban vekalet, niyet vb.) */}
            {(campaign.checkout_fields_schema || []).map((field) => (
              <View key={field.key} style={styles.fieldGroup}>
                <Text style={styles.label}>
                  {field.label || field.key}
                  {field.required ? ' *' : ''}
                </Text>
                {field.type === 'select' && field.options?.length ? (
                  <View style={styles.chipRow}>
                    {field.options.map((opt) => {
                      const active = extraFields[field.key] === opt;
                      return (
                        <Pressable
                          key={opt}
                          onPress={() => setExtraFields((prev) => ({ ...prev, [field.key]: opt }))}
                          style={[
                            styles.chip,
                            active
                              ? { backgroundColor: primary, borderColor: primary }
                              : { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1' },
                          ]}
                        >
                          <Text style={[styles.chipText, { color: active ? '#FFFFFF' : '#334155' }]}>
                            {opt}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <TextInput
                    value={extraFields[field.key] || ''}
                    onChangeText={(v) => setExtraFields((prev) => ({ ...prev, [field.key]: v }))}
                    placeholder={field.placeholder || `${field.label || field.key} girin`}
                    placeholderTextColor="#94A3B8"
                    style={styles.input}
                  />
                )}
              </View>
            ))}

            {/* Adına Bağış / Vekalet */}
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Birinin Adına Bağış / Vekalet</Text>
                <Text style={styles.hint}>Makbuzda adına bağış yapılan kişinin adı görünür</Text>
              </View>
              <Switch
                value={onBehalfToggle}
                onValueChange={setOnBehalfToggle}
                trackColor={{ false: '#CBD5E1', true: primary }}
              />
            </View>

            {onBehalfToggle ? (
              <View style={{ gap: space.sm }}>
                <TextInput
                  value={onBehalfOf}
                  onChangeText={setOnBehalfOf}
                  placeholder="Adına bağış yapılan kişi (Ad Soyad)"
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                />
                <TextInput
                  value={onBehalfPhone}
                  onChangeText={setOnBehalfPhone}
                  placeholder="Bilgilendirme SMS telefonu (isteğe bağlı)"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                  style={styles.input}
                />
              </View>
            ) : null}

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Bağış Notu (İsteğe Bağlı)</Text>
              <TextInput
                value={donorMessage}
                onChangeText={setDonorMessage}
                placeholder="Vekalet / açıklama notunuz..."
                placeholderTextColor="#94A3B8"
                style={styles.input}
              />
            </View>

            {error ? (
              <View style={styles.errBox}>
                <Text style={styles.errText}>{error}</Text>
              </View>
            ) : null}
          </View>

          {/* Kampanya Açıklaması */}
          {campaign.story ? (
            <View style={styles.card}>
              <Text style={styles.storyHeading}>Kampanya Detayı</Text>
              <Text style={styles.storyText}>{campaign.story}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Alt Sabit Sepet / Hemen Bağış Barı */}
      <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.stickyTotal}>
          <Text style={styles.stickyLabel}>Toplam</Text>
          <Text style={[styles.stickyAmount, { color: primary }]}>{money(totalCents, currency)}</Text>
        </View>
        <View style={styles.stickyBtns}>
          <Pressable
            onPress={() => handleAddToCart(false)}
            style={[styles.secondaryAction, { borderColor: primary }]}
            accessibilityRole="button"
          >
            <ShoppingBag size={18} color={primary} />
            <Text style={[styles.secondaryActionText, { color: primary }]}>Sepete Ekle</Text>
          </Pressable>
          <Pressable
            onPress={() => handleAddToCart(true)}
            style={[styles.primaryAction, { backgroundColor: accent }]}
            accessibilityRole="button"
          >
            <Heart size={18} color="#FFFFFF" />
            <Text style={styles.primaryActionText}>Hemen Bağış Yap</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F8F7' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  emptyText: { color: '#64748B', fontSize: 15 },
  cover: { width: '100%', height: 220, backgroundColor: '#E2E8F0' },
  body: { padding: space.lg, gap: space.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { fontSize: 12, fontWeight: '800' },
  country: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A', lineHeight: 28 },
  summary: { fontSize: 14, color: '#475569', lineHeight: 21 },

  progressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: space.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressCollected: { fontSize: 15, fontWeight: '800' },
  progressTarget: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#E2E8F0', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: space.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: space.md,
  },
  fieldGroup: { gap: 8 },
  label: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  hint: { fontSize: 12, color: '#64748B', marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.2,
  },
  chipText: { fontSize: 13, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyVal: { fontSize: 17, fontWeight: '800', color: '#0F172A', minWidth: 26, textAlign: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  errBox: { backgroundColor: '#FEF2F2', borderRadius: radius.md, padding: space.sm, borderWidth: 1, borderColor: '#FECACA' },
  errText: { color: '#B91C1C', fontSize: 13, fontWeight: '600' },

  storyHeading: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  storyText: { fontSize: 14, color: '#334155', lineHeight: 22 },

  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: 8,
  },
  stickyTotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stickyLabel: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  stickyAmount: { fontSize: 19, fontWeight: '900' },
  stickyBtns: { flexDirection: 'row', gap: space.sm },
  secondaryAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryActionText: { fontSize: 14, fontWeight: '800' },
  primaryAction: {
    flex: 1.2,
    minHeight: 46,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
