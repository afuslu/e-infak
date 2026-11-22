import React from 'react';
import { Text, View } from 'react-native';
import { Href, useRouter } from 'expo-router';
import { Activity, ExternalLink, Megaphone, UserCog, UserRound } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { webBase } from '@/lib/api';
import { initials, openUrl } from '@/lib/format';
import { Avatar, Card, ListItem, Screen, SectionTitle, useUi } from '@/components/ui';
import { font, useTheme } from '@/theme';

export default function PlatformMenuScreen() {
  const router = useRouter();
  const { platformMe } = useAuth();
  const { colors } = useTheme();
  const ui = useUi();

  return (
    <Screen>
      <Card onPress={() => router.push('/hesap' as Href)}>
        <View style={ui.rowGap}>
          <Avatar text={initials(platformMe?.full_name)} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: font.lg, fontWeight: '700', color: colors.text }}>{platformMe?.full_name}</Text>
            <Text style={[ui.muted, { color: colors.muted }]}>e-İnfak Platform · {platformMe?.role}</Text>
          </View>
          <UserRound size={20} color={colors.faint} />
        </View>
      </Card>

      <SectionTitle>Platform Yönetimi</SectionTitle>
      <View style={ui.listCard}>
        <ListItem
          title="Platform Duyuruları"
          subtitle="Tüm kurumlara bakım ve duyuru mesajları"
          left={<Megaphone size={22} color={colors.primary} />}
          chevron
          onPress={() => router.push('/duyurular' as Href)}
        />
        <View style={ui.separator} />
        <ListItem
          title="Platform Operatörleri"
          subtitle="Operatör ekle, rol ve şifre yönet"
          left={<UserCog size={22} color={colors.primary} />}
          chevron
          onPress={() => router.push('/operatorler' as Href)}
        />
        <View style={ui.separator} />
        <ListItem
          title="Sistem Sağlığı & Denetim"
          subtitle="Veritabanı, Redis, disk ve son operatör işlemleri"
          left={<Activity size={22} color={colors.primary} />}
          chevron
          onPress={() => router.push('/sistem' as Href)}
        />
      </View>

      <SectionTitle>Diğer</SectionTitle>
      <View style={ui.listCard}>
        <ListItem
          title="Hesabım ve tema"
          subtitle="Koyu/açık tema, şifre, biyometrik kilit, çıkış"
          left={<UserRound size={22} color={colors.primary} />}
          chevron
          onPress={() => router.push('/hesap' as Href)}
        />
        <View style={ui.separator} />
        <ListItem
          title="Web Platform Panelini Aç"
          subtitle="Gelişmiş ayarlar ve operatör yönetimi"
          left={<ExternalLink size={22} color={colors.primary} />}
          onPress={() => openUrl(`${webBase()}/platform`)}
        />
      </View>
    </Screen>
  );
}
