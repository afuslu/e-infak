import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react-native';
import { ACTIVE_TENANT } from '@/config/tenant';
import { fetchOrgSettings } from '@/api/public';
import { useBrandColors } from '@/components/IddefChrome';
import { call, mail, whatsapp } from '@/lib/format';
import { radius, space } from '@/theme';

export default function AboutContactScreen() {
  const { primary, site } = useBrandColors();

  const orgQuery = useQuery({
    queryKey: ['public', 'org-settings'],
    queryFn: fetchOrgSettings,
  });

  const org = orgQuery.data;
  const phone = org?.contact_phone || site?.contact?.phone;
  const email = org?.contact_email || site?.contact?.email;
  const address = org?.contact_address || site?.contact?.address;
  const wa = org?.whatsapp_number || site?.contact?.whatsapp;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ padding: space.lg, paddingBottom: 48, gap: space.md }}
    >
      <View style={[styles.hero, { backgroundColor: primary }]}>
        <Text style={styles.heroTitle}>{ACTIVE_TENANT?.fullName || site?.name || 'HAKDER'}</Text>
        <Text style={styles.heroSub}>
          {site?.tagline || ACTIVE_TENANT?.tagline || 'Bir Kapı Aç, Bir Hayat Değiştir'}
        </Text>
      </View>

      {orgQuery.isLoading ? (
        <ActivityIndicator size="large" color={primary} style={{ marginTop: 24 }} />
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>İLETİŞİM</Text>
            {phone ? (
              <Pressable onPress={() => call(phone)} style={styles.contactRow}>
                <View style={[styles.iconWrap, { backgroundColor: `${primary}14` }]}>
                  <Phone size={18} color={primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactLabel}>Telefon</Text>
                  <Text style={styles.contactValue}>{phone}</Text>
                </View>
              </Pressable>
            ) : null}

            {wa ? (
              <Pressable
                onPress={() => whatsapp(wa, org?.whatsapp_message || undefined)}
                style={styles.contactRow}
              >
                <View style={[styles.iconWrap, { backgroundColor: '#DCFCE7' }]}>
                  <MessageCircle size={18} color="#15803D" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactLabel}>WhatsApp Destek</Text>
                  <Text style={styles.contactValue}>{wa}</Text>
                </View>
              </Pressable>
            ) : null}

            {email ? (
              <Pressable onPress={() => mail(email)} style={styles.contactRow}>
                <View style={[styles.iconWrap, { backgroundColor: `${primary}14` }]}>
                  <Mail size={18} color={primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactLabel}>E-posta</Text>
                  <Text style={styles.contactValue}>{email}</Text>
                </View>
              </Pressable>
            ) : null}

            {address ? (
              <View style={styles.contactRow}>
                <View style={[styles.iconWrap, { backgroundColor: '#F1F5F9' }]}>
                  <MapPin size={18} color="#475569" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactLabel}>Adres</Text>
                  <Text style={styles.contactValue}>{address}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {org?.about_text ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>HAKKIMIZDA</Text>
              <Text style={styles.bodyText}>{org.about_text}</Text>
            </View>
          ) : null}

          {org?.mission_text ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>MİSYONUMUZ</Text>
              <Text style={styles.bodyText}>{org.mission_text}</Text>
            </View>
          ) : null}

          {org?.vision_text ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>VİZYONUMUZ</Text>
              <Text style={styles.bodyText}>{org.vision_text}</Text>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F8F7' },
  hero: { borderRadius: 20, padding: space.lg, gap: 6 },
  heroTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.88)', fontSize: 13, lineHeight: 19 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: space.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#64748B', letterSpacing: 0.7 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  contactLabel: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  contactValue: { fontSize: 14, color: '#0F172A', fontWeight: '700', marginTop: 2 },
  bodyText: { fontSize: 14, color: '#334155', lineHeight: 22 },
});
