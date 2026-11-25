import React, { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Href, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, LogIn, Menu, Phone, User, X } from 'lucide-react-native';
import { ACTIVE_TENANT } from '@/config/tenant';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { resolveMediaUrl } from '@/api/public';
import { isKnown } from '@/design/actions';
import { iconOf } from '@/design/icons';
import { AppAction, onColor } from '@/design/types';
import { useAction, useBrand, usePreview } from '@/design/useAppDesign';
import { call, initials } from '@/lib/format';
import { radius, space } from '@/theme';

export type VitrinTab = 'home' | 'news' | 'donate' | 'cart' | 'account';

/** Vitrin ekranlarının renkleri; kurumun uygulama tasarımından gelir. */
export function useBrandColors() {
  const { primary, accent, site, siteQuery } = useBrand();
  return { primary, accent, site, siteQuery };
}

export function IddefHeader({
  title,
  transparent,
}: {
  title?: string;
  transparent?: boolean;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, mode, donorMe } = useAuth();
  const { primary, site, design, name } = useBrand();
  const open = useAction();
  const preview = usePreview();
  const header = design.header;
  const light = header.style === 'light' && !transparent;
  const barColor = transparent ? 'transparent' : light ? '#FFFFFF' : primary;
  const ink = light ? '#0F172A' : onColor(primary);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isDonor = status === 'signedIn' && mode === 'donor';
  const donorInitials = isDonor
    ? initials(`${donorMe?.first_name || ''} ${donorMe?.last_name || ''}`.trim() || donorMe?.company_name)
    : null;
  const logoUri = resolveMediaUrl(header.logo_url || site?.logo_url, site?.url);
  const brandText = header.title || site?.name || ACTIVE_TENANT?.name || '';

  const navigateFromDrawer = (route: string) => {
    setDrawerOpen(false);
    if (preview) return preview.blocked('Önizlemede bu ekran açılmaz.');
    router.push(route as Href);
  };
  const runFromDrawer = (action: AppAction) => {
    setDrawerOpen(false);
    open(action);
  };

  return (
    <>
      <View
        style={[
          styles.header,
          {
            backgroundColor: barColor,
            paddingTop: preview ? 10 : insets.top + 8,
          },
        ]}
      >
        {header.show_menu === false ? <View style={styles.iconBtn} /> : (
          <Pressable
            onPress={() => setDrawerOpen(true)}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Menüyü aç"
          >
            <Menu size={26} color={ink} />
          </Pressable>
        )}

        <Pressable
          onPress={() => open({ type: 'screen', target: 'home' }, true)}
          style={styles.brandCenter}
          accessibilityRole="button"
        >
          {title ? (
            <Text style={[styles.headerTitle, { color: ink }]} numberOfLines={1}>
              {title}
            </Text>
          ) : logoUri && !header.title ? (
            <Image source={{ uri: logoUri }} style={styles.logoImg} resizeMode="contain" />
          ) : (
            <Text style={[styles.brandTitle, { color: ink }]} numberOfLines={1}>{brandText}</Text>
          )}
        </Pressable>

        {header.show_profile === false ? <View style={styles.iconBtn} /> : (
        <Pressable
          onPress={() => navigateFromDrawer(isDonor ? '/(vitrin)/hesabim' : '/login')}
          style={[styles.profileBtn, { backgroundColor: light ? 'rgba(15,23,42,0.08)' : 'rgba(0,0,0,0.22)' }]}
          accessibilityRole="button"
          accessibilityLabel={isDonor ? 'Hesabım' : 'Giriş Yap'}
        >
          {donorInitials ? (
            <Text style={[styles.profileInitials, { color: light ? primary : '#E8D8A0' }]}>{donorInitials}</Text>
          ) : (
            <User size={22} color={light ? primary : '#E8D8A0'} />
          )}
        </Pressable>
        )}
      </View>

      <Modal
        visible={drawerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDrawerOpen(false)}
      >
        <View style={styles.drawerOverlay}>
          <View style={[styles.drawerPanel, { paddingTop: insets.top + 14, paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={[styles.drawerHead, { backgroundColor: primary }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.drawerKicker}>
                  {name.toLocaleUpperCase('tr-TR')}
                </Text>
                <Text style={styles.drawerSubtitle} numberOfLines={2}>
                  {site?.tagline || ACTIVE_TENANT?.tagline || ''}
                </Text>
              </View>
              <Pressable onPress={() => setDrawerOpen(false)} style={styles.drawerCloseBtn} accessibilityRole="button">
                <X size={22} color="#FFFFFF" />
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.drawerList}>
              {design.drawer.filter((item) => isKnown(item.action)).map((item) => {
                const Icon = iconOf(item.icon);
                return (
                  <DrawerRow
                    key={item.id}
                    icon={<Icon size={20} color={primary} />}
                    label={item.label}
                    onPress={() => runFromDrawer(item.action)}
                  />
                );
              })}

              <View style={styles.drawerDivider} />

              <DrawerRow
                icon={isDonor ? <User size={20} color={primary} /> : <LogIn size={20} color={primary} />}
                label={isDonor ? 'Hesabım (Bağışlarım)' : 'Bağışçı / Yetkili Girişi'}
                onPress={() => navigateFromDrawer(isDonor ? '/(vitrin)/hesabim' : '/login')}
              />

              {site?.contact?.phone ? (
                <Pressable
                  onPress={() => {
                    setDrawerOpen(false);
                    call(site.contact!.phone!);
                  }}
                  style={[styles.drawerCallCard, { borderColor: `${primary}33`, backgroundColor: `${primary}0D` }]}
                >
                  <Phone size={18} color={primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.drawerCallLabel}>Bağışçı Destek Hattı</Text>
                    <Text style={[styles.drawerCallValue, { color: primary }]}>{site.contact.phone}</Text>
                  </View>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
          <Pressable style={{ flex: 1 }} onPress={() => setDrawerOpen(false)} />
        </View>
      </Modal>
    </>
  );
}

function DrawerRow({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.drawerRow, pressed && { backgroundColor: '#F1F5F9' }]}
      accessibilityRole="button"
    >
      <View style={styles.drawerRowIcon}>{icon}</View>
      <Text style={styles.drawerRowText}>{label}</Text>
      <ChevronRight size={17} color="#94A3B8" />
    </Pressable>
  );
}

const TAB_SCREENS: Record<VitrinTab, string> = {
  home: 'home', news: 'haberler', donate: 'bagis-yap', cart: 'sepet', account: 'hesabim',
};

/** Alt sekmeler. `active` sabit ekranı, `page` tasarlanan sayfayı belirtir. */
export function IddefBottomBar({ active, page }: { active?: VitrinTab; page?: string }) {
  const insets = useSafeAreaInsets();
  const { primary, onPrimary, design } = useBrand();
  const open = useAction();
  const { totalCount } = useCart();
  const style = design.header.tab_style || 'raised';
  const current = active ? `screen:${TAB_SCREENS[active]}` : page === 'home' ? 'screen:home' : `page:${page}`;
  const keyOf = (a: AppAction) => (a.type === 'page' && a.target === 'home' ? 'screen:home' : `${a.type}:${a.target}`);

  return (
    <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {design.tabs.filter((tab) => isKnown(tab.action)).map((tab) => {
        const Icon = iconOf(tab.icon);
        const on = keyOf(tab.action) === current;
        const raised = style === 'raised' && !!tab.highlight;
        const filled = style === 'pill' && on;
        const color = filled ? onPrimary : on || (tab.highlight && style !== 'raised') ? primary : '#64748B';
        const cart = tab.action.type === 'screen' && tab.action.target === 'sepet' && totalCount > 0;
        return (
          <Pressable
            key={tab.id}
            style={raised ? styles.centerTabWrap : [styles.tabItem, filled && { backgroundColor: primary, borderRadius: 14 }]}
            onPress={() => { if (!on) open(tab.action, true); }}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: on }}
          >
            {raised ? (
              <View style={[styles.donateFab, { backgroundColor: primary }]}>
                <Icon size={28} color={onPrimary} />
              </View>
            ) : (
              <View style={styles.bagIconWrap}>
                <Icon size={22} color={color} />
                {cart ? (
                  <View style={styles.cartBadge}>
                    <Text style={styles.cartBadgeText}>{totalCount > 99 ? '99+' : totalCount}</Text>
                  </View>
                ) : null}
              </View>
            )}
            <Text numberOfLines={1} style={[styles.tabLabel, { color }, on && { fontWeight: '700' }, raised && on && { color: primary }]}>{tab.label}</Text>
            {on && !raised && style !== 'pill' ? <View style={[styles.activeDot, { backgroundColor: primary }]} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingBottom: 12,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  brandCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  logoImg: { height: 40, width: 148, backgroundColor: '#FFFFFF', borderRadius: 10 },
  brandTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '900', letterSpacing: 1 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  profileBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  profileInitials: { color: '#E8D8A0', fontSize: 15, fontWeight: '800' },

  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
  },
  drawerPanel: {
    width: '82%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 16,
  },
  drawerHead: {
    marginHorizontal: space.md,
    borderRadius: 16,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginBottom: space.sm,
  },
  drawerKicker: { color: '#E8D8A0', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  drawerSubtitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginTop: 4, lineHeight: 19 },
  drawerCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerList: { paddingHorizontal: space.sm, paddingBottom: space.xl, gap: 2 },
  drawerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: 13,
    borderRadius: radius.md,
    gap: space.md,
  },
  drawerRowIcon: { width: 24, alignItems: 'center' },
  drawerRowText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0F172A' },
  drawerDivider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: space.sm, marginHorizontal: space.md },
  drawerCallCard: {
    marginTop: space.md,
    marginHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  drawerCallLabel: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  drawerCallValue: { fontSize: 15, fontWeight: '800', marginTop: 2 },

  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingTop: 10,
    paddingHorizontal: space.xs,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
    elevation: 10,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 4 },
  centerTabWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingVertical: 4 },
  donateFab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -34,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  tabLabel: { fontSize: 11, color: '#64748B', fontWeight: '500' },
  activeDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },
  bagIconWrap: { position: 'relative' },
  cartBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  cartBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
});
