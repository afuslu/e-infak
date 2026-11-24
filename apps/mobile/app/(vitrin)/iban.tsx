import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useQuery } from '@tanstack/react-query';
import { Copy, Landmark } from 'lucide-react-native';
import { ACTIVE_TENANT } from '@/config/tenant';
import { fetchOrgSettings, fetchPublicPage } from '@/api/public';
import { useBrandColors } from '@/components/IddefChrome';
import { notify } from '@/components/toast';
import { radius, space } from '@/theme';

export default function IbanAccountsScreen() {
  const { primary, site } = useBrandColors();

  const orgQuery = useQuery({
    queryKey: ['public', 'org-settings'],
    queryFn: fetchOrgSettings,
  });

  const ibanSlug = (orgQuery.data?.iban_page_url || '/hesap-numaralarimiz').replace(/^\//, '');
  const pageQuery = useQuery({
    queryKey: ['public', 'page', ibanSlug],
    queryFn: () => fetchPublicPage(ibanSlug),
    retry: false,
  });

  const copyIban = async (iban: string, label: string) => {
    await Clipboard.setStringAsync(iban.replace(/\s+/g, ''));
    notify(`${label} IBAN kopyalandı.`);
  };

  const accounts: { bank: string; iban: string }[] = [];
  if (orgQuery.data?.bank1_iban) {
    accounts.push({
      bank: orgQuery.data.bank1_name || 'Banka Hesabı 1',
      iban: orgQuery.data.bank1_iban,
    });
  }
  if (orgQuery.data?.bank2_iban) {
    accounts.push({
      bank: orgQuery.data.bank2_name || 'Banka Hesabı 2',
      iban: orgQuery.data.bank2_iban,
    });
  }

  const legalName = orgQuery.data?.legal?.legal_name || ACTIVE_TENANT?.fullName || site?.name || '';

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ padding: space.lg, paddingBottom: 48, gap: space.md }}
      refreshControl={
        <RefreshControl
          refreshing={orgQuery.isRefetching || pageQuery.isRefetching}
          onRefresh={() => {
            orgQuery.refetch();
            pageQuery.refetch();
          }}
          tintColor={primary}
        />
      }
    >
      <View style={[styles.noteBox, { backgroundColor: `${primary}12`, borderColor: `${primary}33` }]}>
        <Text style={[styles.noteTitle, { color: primary }]}>Havale / EFT Açıklama Notu</Text>
        <Text style={styles.noteText}>
          Alıcı Adı: <Text style={{ fontWeight: '800' }}>{legalName}</Text>
          {'\n'}Açıklama kısmına bağış türünü (Zekat, Kurban, Su Kuyusu vb.), ad-soyad ve telefon numaranızı yazmanız yeterlidir.
        </Text>
      </View>

      {orgQuery.isLoading ? (
        <ActivityIndicator size="large" color={primary} style={{ marginTop: 24 }} />
      ) : accounts.length > 0 ? (
        accounts.map((acc, idx) => (
          <View key={idx} style={styles.card}>
            <View style={styles.cardHead}>
              <Landmark size={20} color={primary} />
              <Text style={styles.bankName}>{acc.bank}</Text>
            </View>
            <Text style={styles.holder}>{legalName}</Text>
            <Pressable
              onPress={() => copyIban(acc.iban, acc.bank)}
              style={styles.ibanBox}
              accessibilityRole="button"
            >
              <Text style={styles.ibanText}>{acc.iban}</Text>
              <View style={[styles.copyChip, { backgroundColor: primary }]}>
                <Copy size={14} color="#FFFFFF" />
                <Text style={styles.copyChipText}>Kopyala</Text>
              </View>
            </Pressable>
          </View>
        ))
      ) : null}

      {pageQuery.data?.body ? (
        <View style={styles.card}>
          <Text style={styles.bankName}>{pageQuery.data.title}</Text>
          <Text style={styles.pageBody}>{pageQuery.data.body}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F8F7' },
  noteBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: space.md,
    gap: 6,
  },
  noteTitle: { fontSize: 14, fontWeight: '800' },
  noteText: { fontSize: 13, color: '#334155', lineHeight: 20 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: space.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bankName: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  holder: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  ibanBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  ibanText: { flex: 1, fontSize: 13, fontWeight: '800', color: '#0F172A' },
  copyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  copyChipText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  pageBody: { fontSize: 14, color: '#334155', lineHeight: 22 },
});
