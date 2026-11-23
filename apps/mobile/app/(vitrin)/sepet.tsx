import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Href, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import { WebView } from 'react-native-webview';
import {
  Check,
  CreditCard,
  Heart,
  Landmark,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react-native';
import {
  createCheckoutSession,
  fetchFxRates,
  fetchOrgSettings,
  resolveMediaUrl,
  SupportedCurrency,
} from '@/api/public';
import { IddefBottomBar, IddefHeader, useBrandColors } from '@/components/IddefChrome';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { notify, notifyError } from '@/components/toast';
import { idempotencyKey, money, openUrl } from '@/lib/format';
import { radius, space } from '@/theme';

export default function DonationCartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, mode, donorMe } = useAuth();
  const {
    items,
    currency,
    setCurrency,
    totalCents,
    updateQuantity,
    removeItem,
    clearCart,
  } = useCart();
  const { primary, accent, site } = useBrandColors();

  const isDonor = status === 'signedIn' && mode === 'donor';

  const orgQuery = useQuery({
    queryKey: ['public', 'org-settings'],
    queryFn: fetchOrgSettings,
  });

  const fxQuery = useQuery({
    queryKey: ['public', 'fx-rates'],
    queryFn: fetchFxRates,
    staleTime: 10 * 60_000,
  });

  const ratesTry = useMemo(() => {
    const out: Record<string, number> = {};
    const raw = fxQuery.data?.rates || {};
    Object.entries(raw).forEach(([code, info]) => {
      if (info?.rate_try && info.rate_try > 0) out[code] = info.rate_try;
    });
    return out;
  }, [fxQuery.data]);

  const handleCurrencyChange = (next: SupportedCurrency) => {
    if (next === currency) return;
    setCurrency(next, ratesTry);
    if (items.length > 0) {
      notify(
        Object.keys(ratesTry).length > 0
          ? `Sepet tutarları güncel kurla ${next} cinsine çevrildi.`
          : `Para birimi ${next} olarak güncellendi. Tutarları kontrol edin.`,
      );
    }
  };

  const [legalModal, setLegalModal] = useState<{ title: string; url: string } | null>(null);
  const openLegalDoc = (title: string, path?: string | null, fallbackPath = '/kvkk') => {
    const fullUrl = resolveMediaUrl(path || fallbackPath, site?.url);
    if (!fullUrl) return;
    if (Platform.OS === 'web') {
      openUrl(fullUrl);
      return;
    }
    setLegalModal({ title, url: fullUrl });
  };

  const cardAvailable = orgQuery.data?.card_payments !== false;
  const enabledCurrencies = useMemo<SupportedCurrency[]>(() => {
    const raw = orgQuery.data?.enabled_payment_currencies || ['TRY'];
    const valid = raw.filter((c): c is SupportedCurrency => c === 'TRY' || c === 'USD' || c === 'EUR');
    return valid.length ? valid : ['TRY'];
  }, [orgQuery.data]);

  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'bank_transfer'>('credit_card');
  const [firstName, setFirstName] = useState(donorMe?.first_name || '');
  const [lastName, setLastName] = useState(donorMe?.last_name || '');
  const [phone, setPhone] = useState(donorMe?.phone || '');
  const [email, setEmail] = useState(donorMe?.email || '');
  const [isAnonymous, setIsAnonymous] = useState(!!donorMe?.is_anonymous);
  const [allowSms, setAllowSms] = useState(donorMe?.allow_sms ?? true);
  const [allowEmail, setAllowEmail] = useState(donorMe?.allow_email ?? false);
  const [kvkkAccepted, setKvkkAccepted] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!cardAvailable && paymentMethod === 'credit_card') {
      setPaymentMethod('bank_transfer');
    }
  }, [cardAvailable, paymentMethod]);

  useEffect(() => {
    if (isDonor && donorMe) {
      if (!firstName && donorMe.first_name) setFirstName(donorMe.first_name);
      if (!lastName && donorMe.last_name) setLastName(donorMe.last_name);
      if (!phone && donorMe.phone) setPhone(donorMe.phone);
      if (!email && donorMe.email) setEmail(donorMe.email);
    }
  }, [isDonor, donorMe]);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      setFormError(null);
      if (items.length === 0) throw new Error('Bağış sepetiniz boş.');
      const fn = firstName.trim();
      const ln = lastName.trim();
      const ph = phone.trim();
      const em = email.trim();
      if (fn.length < 2) throw new Error('Lütfen adınızı girin (en az 2 karakter).');
      if (ln.length < 1) throw new Error('Lütfen soyadınızı girin.');
      if (ph.replace(/\D/g, '').length < 10) throw new Error('Lütfen geçerli bir telefon numarası girin.');
      if (!kvkkAccepted) throw new Error('Devam etmek için KVKK aydınlatma metnini onaylayın.');
      if (paymentMethod === 'credit_card' && !termsAccepted) {
        throw new Error('Kart ödemesi için ön bilgilendirme ve mesafeli bağış sözleşmesini onaylayın.');
      }

      return createCheckoutSession({
        items: items.map((item) => ({
          campaign_id: item.campaign_id,
          quantity: item.quantity,
          unit_amount_cents: item.unit_amount_cents,
          donor_message: item.donor_message || null,
          on_behalf_of: item.on_behalf_of || null,
          on_behalf_of_phone: item.on_behalf_of_phone || null,
          metadata: item.metadata || {},
        })),
        donor: {
          first_name: fn,
          last_name: ln,
          phone: ph,
          email: em || null,
          is_anonymous: isAnonymous,
          allow_sms: allowSms,
          allow_email: allowEmail,
        },
        payment_method: paymentMethod,
        currency,
        locale: 'tr',
        idempotency_key: idempotencyKey('mobchk'),
        kvkk_accepted: kvkkAccepted,
        terms_accepted: paymentMethod === 'credit_card' ? termsAccepted : kvkkAccepted,
      });
    },
    onSuccess: (res) => {
      if (paymentMethod === 'bank_transfer') {
        clearCart();
        router.push({
          pathname: '/(vitrin)/odeme-sonuc',
          params: {
            checkoutId: res.checkout_id,
            outcome: 'transfer',
            transferRef: res.transfer_reference || '',
            bankName: res.bank_name || '',
            iban: res.iban || '',
            accountHolder: res.account_holder || '',
          },
        } as any);
        return;
      }

      if (res.redirect_url) {
        router.push({
          pathname: '/(vitrin)/odeme',
          params: {
            checkoutId: res.checkout_id,
            redirectUrl: res.redirect_url,
          },
        } as any);
        return;
      }

      router.push({
        pathname: '/(vitrin)/odeme-sonuc',
        params: { checkoutId: res.checkout_id, outcome: 'ok' },
      } as any);
    },
    onError: (err: any) => {
      const msg = err?.message || 'Ödeme başlatılamadı.';
      setFormError(msg);
      notifyError(err);
    },
  });

  return (
    <View style={styles.root}>
      <IddefHeader title="Bağış Sepeti" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: space.lg, paddingBottom: 130, gap: space.md }}
          keyboardShouldPersistTaps="handled"
        >
          {items.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={[styles.emptyIcon, { backgroundColor: `${primary}14` }]}>
                <ShoppingBag size={36} color={primary} />
              </View>
              <Text style={styles.emptyTitle}>Bağış sepetiniz boş</Text>
              <Text style={styles.emptySub}>
                Kurban, su kuyusu, zekat, Gazze veya acil yardım kampanyalarından seçerek sepetinize ekleyebilirsiniz.
              </Text>
              <Pressable
                onPress={() => router.push('/(vitrin)/bagis-yap' as Href)}
                style={[styles.emptyBtn, { backgroundColor: primary }]}
              >
                <Heart size={18} color="#FFFFFF" />
                <Text style={styles.emptyBtnText}>Kampanyaları İncele</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Sepet Kalemleri */}
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>SEPETTEKİ BAĞIŞLAR ({items.length})</Text>
                  <Pressable onPress={clearCart}>
                    <Text style={styles.clearLink}>Temizle</Text>
                  </Pressable>
                </View>

                {items.map((item) => (
                  <View key={item.key} style={styles.cartRow}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.itemTitle}>{item.campaign_title}</Text>
                      {item.on_behalf_of ? (
                        <Text style={styles.itemMeta}>Vekalet / Adına: {item.on_behalf_of}</Text>
                      ) : null}
                      {item.donor_message ? (
                        <Text style={styles.itemMeta}>Not: {item.donor_message}</Text>
                      ) : null}
                      <Text style={[styles.itemPrice, { color: primary }]}>
                        {money(item.unit_amount_cents * item.quantity, currency)}
                      </Text>
                    </View>

                    <View style={styles.itemControls}>
                      <View style={styles.stepper}>
                        <Pressable
                          onPress={() => updateQuantity(item.key, -1)}
                          style={styles.stepBtn}
                        >
                          <Minus size={14} color="#0F172A" />
                        </Pressable>
                        <Text style={styles.qtyText}>{item.quantity}</Text>
                        <Pressable
                          onPress={() => updateQuantity(item.key, 1)}
                          style={styles.stepBtn}
                        >
                          <Plus size={14} color="#0F172A" />
                        </Pressable>
                      </View>
                      <Pressable onPress={() => removeItem(item.key)} style={styles.trashBtn}>
                        <Trash2 size={16} color="#DC2626" />
                      </Pressable>
                    </View>
                  </View>
                ))}

                {enabledCurrencies.length > 1 ? (
                  <View style={styles.currencyRow}>
                    <Text style={styles.currencyLabel}>Para Birimi</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {enabledCurrencies.map((cur) => {
                        const active = currency === cur;
                        return (
                          <Pressable
                            key={cur}
                            onPress={() => handleCurrencyChange(cur)}
                            style={[
                              styles.curChip,
                              active
                                ? { backgroundColor: primary, borderColor: primary }
                                : { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' },
                            ]}
                          >
                            <Text style={[styles.curText, { color: active ? '#FFFFFF' : '#334155' }]}>
                              {cur}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Genel Toplam</Text>
                  <Text style={[styles.totalValue, { color: primary }]}>
                    {money(totalCents, currency)}
                  </Text>
                </View>
              </View>

              {/* Bağışçı Bilgileri */}
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>BAĞIŞÇI BİLGİLERİ</Text>
                  {!isDonor ? (
                    <Pressable onPress={() => router.push('/login' as Href)}>
                      <Text style={[styles.loginHint, { color: primary }]}>Üye Girişi Yap</Text>
                    </Pressable>
                  ) : null}
                </View>

                <View style={styles.twoCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Ad *</Text>
                    <TextInput
                      value={firstName}
                      onChangeText={setFirstName}
                      placeholder="Adınız"
                      placeholderTextColor="#94A3B8"
                      style={styles.input}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Soyad *</Text>
                    <TextInput
                      value={lastName}
                      onChangeText={setLastName}
                      placeholder="Soyadınız"
                      placeholderTextColor="#94A3B8"
                      style={styles.input}
                    />
                  </View>
                </View>

                <View>
                  <Text style={styles.fieldLabel}>Cep Telefonu *</Text>
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="05XX XXX XX XX"
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                    style={styles.input}
                  />
                </View>

                <View>
                  <Text style={styles.fieldLabel}>E-posta (Makbuz için isteğe bağlı)</Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="ornek@eposta.com"
                    placeholderTextColor="#94A3B8"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={styles.input}
                  />
                </View>

                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>SMS ile bağış bilgilendirmesi al</Text>
                  <Switch
                    value={allowSms}
                    onValueChange={setAllowSms}
                    trackColor={{ false: '#CBD5E1', true: primary }}
                  />
                </View>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Bağışçı listesinde ismim gizlensin</Text>
                  <Switch
                    value={isAnonymous}
                    onValueChange={setIsAnonymous}
                    trackColor={{ false: '#CBD5E1', true: primary }}
                  />
                </View>
              </View>

              {/* Ödeme Yöntemi */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>ÖDEME YÖNTEMİ</Text>
                <View style={styles.payRow}>
                  {cardAvailable ? (
                    <Pressable
                      onPress={() => setPaymentMethod('credit_card')}
                      style={[
                        styles.payOption,
                        paymentMethod === 'credit_card'
                          ? { borderColor: primary, backgroundColor: `${primary}0D` }
                          : { borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
                      ]}
                    >
                      <CreditCard
                        size={22}
                        color={paymentMethod === 'credit_card' ? primary : '#64748B'}
                      />
                      <Text
                        style={[
                          styles.payOptionTitle,
                          { color: paymentMethod === 'credit_card' ? primary : '#0F172A' },
                        ]}
                      >
                        Kredi / Banka Kartı
                      </Text>
                      <Text style={styles.payOptionSub}>3D Secure ile güvenli</Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    onPress={() => setPaymentMethod('bank_transfer')}
                    style={[
                      styles.payOption,
                      paymentMethod === 'bank_transfer'
                        ? { borderColor: primary, backgroundColor: `${primary}0D` }
                        : { borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
                    ]}
                  >
                    <Landmark
                      size={22}
                      color={paymentMethod === 'bank_transfer' ? primary : '#64748B'}
                    />
                    <Text
                      style={[
                        styles.payOptionTitle,
                        { color: paymentMethod === 'bank_transfer' ? primary : '#0F172A' },
                      ]}
                    >
                      Havale / EFT
                    </Text>
                    <Text style={styles.payOptionSub}>IBAN ve referans kodu</Text>
                  </Pressable>
                </View>

                {/* Onay Kutucukları */}
                <View style={styles.checkRow}>
                  <Pressable
                    onPress={() => setKvkkAccepted((v) => !v)}
                    style={[
                      styles.checkbox,
                      kvkkAccepted
                        ? { backgroundColor: primary, borderColor: primary }
                        : { backgroundColor: '#FFFFFF', borderColor: '#94A3B8' },
                    ]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: kvkkAccepted }}
                  >
                    {kvkkAccepted ? <Check size={14} color="#FFFFFF" /> : null}
                  </Pressable>
                  <Text style={styles.checkText}>
                    <Text
                      onPress={() => openLegalDoc('KVKK Aydınlatma Metni', site?.legal?.kvkk_url, '/kvkk')}
                      style={[styles.legalLink, { color: primary }]}
                    >
                      KVKK Aydınlatma Metni
                    </Text>
                    ’ni okudum ve kabul ediyorum.
                  </Text>
                </View>

                {paymentMethod === 'credit_card' ? (
                  <View style={styles.checkRow}>
                    <Pressable
                      onPress={() => setTermsAccepted((v) => !v)}
                      style={[
                        styles.checkbox,
                        termsAccepted
                          ? { backgroundColor: primary, borderColor: primary }
                          : { backgroundColor: '#FFFFFF', borderColor: '#94A3B8' },
                      ]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: termsAccepted }}
                    >
                      {termsAccepted ? <Check size={14} color="#FFFFFF" /> : null}
                    </Pressable>
                    <Text style={styles.checkText}>
                      <Text
                        onPress={() =>
                          openLegalDoc(
                            'Ön Bilgilendirme ve Mesafeli Bağış Sözleşmesi',
                            site?.legal?.terms_url,
                            '/bagis-kosullari',
                          )
                        }
                        style={[styles.legalLink, { color: primary }]}
                      >
                        Ön Bilgilendirme Formu ve Mesafeli Bağış Sözleşmesi
                      </Text>
                      ’ni onaylıyorum.
                    </Text>
                  </View>
                ) : null}

                {formError ? (
                  <View style={styles.errBox}>
                    <Text style={styles.errText}>{formError}</Text>
                  </View>
                ) : null}

                <Pressable
                  onPress={() => checkoutMutation.mutate()}
                  disabled={checkoutMutation.isPending}
                  style={[
                    styles.submitBtn,
                    { backgroundColor: accent, opacity: checkoutMutation.isPending ? 0.7 : 1 },
                  ]}
                >
                  {checkoutMutation.isPending ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <ShieldCheck size={20} color="#FFFFFF" />
                      <Text style={styles.submitText}>
                        {paymentMethod === 'credit_card'
                          ? `Güvenli Ödemeye Geç (${money(totalCents, currency)})`
                          : `Havale / EFT Kodu Oluştur (${money(totalCents, currency)})`}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <IddefBottomBar active="cart" />

      <Modal
        visible={!!legalModal}
        animationType="slide"
        onRequestClose={() => setLegalModal(null)}
      >
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
          <View style={[styles.legalHeader, { backgroundColor: primary, paddingTop: insets.top + 8 }]}>
            <Text style={styles.legalHeaderTitle} numberOfLines={1}>
              {legalModal?.title}
            </Text>
            <Pressable
              onPress={() => setLegalModal(null)}
              style={styles.legalCloseBtn}
              accessibilityRole="button"
            >
              <X size={20} color="#FFFFFF" />
            </Pressable>
          </View>
          {legalModal ? (
            <WebView source={{ uri: legalModal.url }} startInLoadingState />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F8F7' },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: space.xl,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: space.md,
  },
  emptyIcon: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  emptySub: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: radius.pill,
  },
  emptyBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: space.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 12, fontWeight: '800', color: '#64748B', letterSpacing: 0.7 },
  clearLink: { fontSize: 12, fontWeight: '700', color: '#DC2626' },
  loginHint: { fontSize: 12, fontWeight: '800' },

  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  itemMeta: { fontSize: 12, color: '#64748B' },
  itemPrice: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  itemControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: { fontSize: 14, fontWeight: '800', color: '#0F172A', minWidth: 20, textAlign: 'center' },
  trashBtn: { padding: 6 },

  currencyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  currencyLabel: { fontSize: 13, fontWeight: '700', color: '#334155' },
  curChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },
  curText: { fontSize: 12, fontWeight: '800' },

  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  totalLabel: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  totalValue: { fontSize: 20, fontWeight: '900' },

  twoCol: { flexDirection: 'row', gap: space.sm },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 4 },
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
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: 13, color: '#334155', flex: 1, paddingRight: 8 },

  payRow: { flexDirection: 'row', gap: space.sm },
  payOption: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: space.md,
    gap: 4,
  },
  payOptionTitle: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  payOptionSub: { fontSize: 11, color: '#64748B' },

  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkText: { flex: 1, fontSize: 12, color: '#334155', lineHeight: 18 },
  legalLink: { fontWeight: '800', textDecorationLine: 'underline' },
  legalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingBottom: 12,
    gap: 8,
  },
  legalHeaderTitle: { flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  legalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  errBox: { backgroundColor: '#FEF2F2', borderRadius: radius.md, padding: space.sm, borderWidth: 1, borderColor: '#FECACA' },
  errText: { color: '#B91C1C', fontSize: 13, fontWeight: '600' },

  submitBtn: {
    minHeight: 52,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: space.md,
  },
  submitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
