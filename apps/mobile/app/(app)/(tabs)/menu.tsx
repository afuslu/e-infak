import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { Href, useFocusEffect, useRouter } from 'expo-router';
import {
  Activity, BarChart3, Beef, Bell, Building2, CalendarCheck, CloudOff, CreditCard, Droplets, ExternalLink,
  HandHeart, Landmark, Megaphone, MessageSquare, PiggyBank, Repeat, Search, Send, Tags, UserCog, UserRound, UsersRound,
} from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { allowed, ROLE_LABELS } from '@/lib/access';
import { webBase } from '@/lib/api';
import { initials, openUrl } from '@/lib/format';
import { listOfflineQueue } from '@/lib/offlineQueue';
import { Avatar, Badge, Card, ListItem, Screen, SectionTitle, useUi } from '@/components/ui';
import { font, useTheme } from '@/theme';

type Item = { title: string; subtitle?: string; href: Href; icon: React.ComponentType<{ size?: number; color?: string }>; feature?: string; modules?: string | string[] };

// apps/web/components/admin/admin-nav.ts ile aynı paket özelliği + modül eşlemesi.
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Para ve bildirimler',
    items: [
      { title: 'Hızlı arama', subtitle: 'Bağışçı, makbuz, kumbara, kampanya', href: '/arama' as Href, icon: Search },
      { title: 'Para girişleri', subtitle: 'Canlı: online, havale, POS, nakit, kumbara', href: '/para-girisleri', icon: Activity, modules: 'receipts' },
      { title: 'Bekleyen havaleler', subtitle: 'Tek dokunuşla bağışçıya bağla', href: '/havaleler', icon: Landmark, feature: 'bank_transactions', modules: 'bank' },
      { title: 'Bildirimler', href: '/bildirimler', icon: Bell },
    ],
  },
  {
    title: 'Saha ve operasyon',
    items: [
      { title: 'Kumbaralar', subtitle: 'QR ile tahsilat', href: '/kumbara', icon: PiggyBank, feature: 'money_box', modules: 'operations' },
      { title: 'Görevler', href: '/gorevler', icon: CalendarCheck, feature: 'tasks' },
      { title: 'Kurban takibi', subtitle: 'Hisse ve kesim durumu', href: '/kurban' as Href, icon: Beef, feature: 'kurban' },
      { title: 'Yoksul / Aile takip', subtitle: 'İhtiyaç sahibi aile kayıtları', href: '/yoksul-takip' as Href, icon: HandHeart, feature: 'poverty_tracking' },
      { title: 'Su kuyuları', subtitle: 'Kuyu aşamaları ve durumları', href: '/su-kuyusu' as Href, icon: Droplets, feature: 'water_well' },
      { title: 'Çevrimdışı saha kuyruğu', subtitle: 'İnternetsiz makbuz kaydet ve senkronize et', href: '/cevrimdisi' as Href, icon: CloudOff, modules: 'receipts' },
    ],
  },
  {
    title: 'Bağış',
    items: [
      { title: 'Kampanyalar', href: '/kampanyalar', icon: Megaphone, modules: 'site' },
      { title: 'Bağış kalemleri', subtitle: 'Hızlı bağış kutucukları', href: '/bagis-kalemleri', icon: Tags, modules: 'site' },
      { title: 'Düzenli ödemeler', href: '/duzenli-odemeler', icon: Repeat, feature: 'recurring', modules: ['finance', 'donors', 'receipts'] },
      { title: 'Üyeler ve aidatlar', href: '/uyeler', icon: UsersRound, feature: 'membership', modules: 'members' },
    ],
  },
  {
    title: 'İletişim ve raporlar',
    items: [
      { title: 'Toplu SMS', href: '/sms/toplu', icon: Send, feature: 'sms', modules: 'sms' },
      { title: 'SMS gönderimleri', href: '/sms/gonderimler', icon: MessageSquare, feature: 'sms', modules: 'sms' },
      { title: 'Raporlar', href: '/raporlar', icon: BarChart3, feature: 'reports_basic', modules: 'reports' },
    ],
  },
  {
    title: 'Ayarlar',
    items: [
      { title: 'Kurum ayarları', subtitle: 'İletişim, banka, yasal bilgiler', href: '/ayarlar/kurum', icon: Building2, modules: 'settings' },
      { title: 'Kullanıcılar ve roller', href: '/ayarlar/kullanicilar', icon: UserCog, feature: 'roles', modules: 'users' },
      { title: 'Ödeme ve SMS sağlayıcıları', href: '/ayarlar/saglayicilar', icon: CreditCard, modules: 'settings' },
    ],
  },
];

export default function MenuScreen() {
  const router = useRouter();
  const { access, me, site } = useAuth();
  const { colors } = useTheme();
  const ui = useUi();
  const [pendingOffline, setPendingOffline] = useState(0);
  const listCardStyle = ui.listCard;
  const sepStyle = ui.separator;

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listOfflineQueue()
        .then((items) => { if (alive) setPendingOffline(items.length); })
        .catch(() => {});
      return () => { alive = false; };
    }, [])
  );
  return (
    <Screen>
      <Card onPress={() => router.push('/ayarlar/hesabim')}>
        <View style={ui.rowGap}>
          <Avatar text={initials(me?.full_name)} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: font.lg, fontWeight: '700', color: colors.text }}>{me?.full_name}</Text>
            <Text style={[ui.muted, { color: colors.muted }]}>{site?.name} · {ROLE_LABELS[me?.role || ''] || me?.role}</Text>
          </View>
          <UserRound size={20} color={colors.faint} />
        </View>
      </Card>
      {GROUPS.map((group) => {
        const items = group.items.filter((i) => allowed(access, i.feature, i.modules));
        if (!items.length) return null;
        return (
          <View key={group.title} style={{ gap: 8 }}>
            <SectionTitle>{group.title}</SectionTitle>
            <View style={listCardStyle}>
              {items.map((item, index) => (
                <View key={item.title}>
                  {index ? <View style={sepStyle} /> : null}
                  <ListItem
                    title={item.title}
                    subtitle={item.subtitle}
                    chevron
                    left={<item.icon size={22} color={colors.primary} />}
                    right={item.href === ('/cevrimdisi' as Href) && pendingOffline > 0 ? <Badge label={`${pendingOffline} bekliyor`} tone="warn" /> : undefined}
                    onPress={() => router.push(item.href)}
                  />
                </View>
              ))}
            </View>
          </View>
        );
      })}
      <SectionTitle>Diğer</SectionTitle>
      <View style={listCardStyle}>
        <ListItem title="Hesabım ve tema" subtitle="Koyu/açık tema, şifre, biyometrik kilit, bildirimler" chevron left={<UserRound size={22} color={colors.primary} />} onPress={() => router.push('/ayarlar/hesabim')} />
        <View style={sepStyle} />
        <ListItem title="Web panelini aç" subtitle="Site yapıcı, muhasebe ve diğer modüller" left={<ExternalLink size={22} color={colors.primary} />}
          onPress={() => openUrl(`${site?.url || webBase()}/admin`)} />
      </View>
    </Screen>
  );
}
