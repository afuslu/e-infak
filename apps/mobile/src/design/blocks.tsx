import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ChevronUp, Heart, Phone, Play, Plus, ShoppingBag } from 'lucide-react-native';
import {
  CATEGORY_LABELS, fetchCampaigns, fetchContentPosts, fetchDonationCategories, PublicCampaign, resolveMediaUrl,
} from '@/api/public';
import { ACTIVE_TENANT } from '@/config/tenant';
import { notify } from '@/components/toast';
import { useCart } from '@/context/CartContext';
import { needsChoice } from '@/lib/donationOptions';
import { call, money, openUrl } from '@/lib/format';
import { radius, space } from '@/theme';
import { isKnown } from './actions';
import { iconOf } from './icons';
import { AppAction, onColor } from './types';
import { Brand, useAction, useBrand, usePreview } from './useAppDesign';

type P = { props: Record<string, any>; ink: string };

const screen = (target: string): AppAction => ({ type: 'screen', target });
const listOf = (value: any): any[] => (Array.isArray(value) ? value : []);

export const useCampaigns = () =>
  useQuery({ queryKey: ['public', 'campaigns', 'active'], queryFn: () => fetchCampaigns({ page_size: 100 }) });

function useQuickAdd() {
  const { addItem } = useCart();
  const open = useAction();
  const preview = usePreview();
  return (c: PublicCampaign, cents?: number) => {
    if (preview) return preview.blocked('Önizlemede sepete eklenmez.');
    if (needsChoice(c)) return open({ type: 'campaign', target: c.slug });
    addItem({
      campaign_id: c.id,
      campaign_slug: c.slug,
      campaign_title: c.title,
      cover_image_url: c.cover_image_url,
      unit_amount_cents: cents || c.suggested_amounts_cents?.[0] || c.reference_amounts?.TRY || c.min_donation_cents || 10000,
      quantity: 1,
    });
    notify(`${c.title} bağış sepetine eklendi.`);
  };
}

const percent = (c: PublicCampaign) =>
  c.show_collected !== false && c.target_cents && c.target_cents > 0
    ? Math.min(100, Math.round(((c.collected_cents || 0) * 100) / c.target_cents))
    : null;

function Title({ text, ink, align, right }: { text?: string; ink: string; align?: string; right?: string }) {
  const b = useBrand();
  if (!text) return null;
  return (
    <View style={s.titleRow}>
      <Text style={[s.sectionTitle, { color: ink, fontSize: b.fs(12), textAlign: align === 'center' ? 'center' : 'left', flex: 1 }]}>{text}</Text>
      {right ? <Text style={{ fontSize: b.fs(12), color: ink, fontWeight: '600' }}>{right}</Text> : null}
    </View>
  );
}

function Button({ label, action, kind = 'primary', icon, onPress, ink }: {
  label?: string; action?: AppAction; kind?: string; icon?: React.ReactNode; onPress?: () => void; ink?: string;
}) {
  const b = useBrand();
  const open = useAction();
  if (!label || (!onPress && !isKnown(action))) return null;
  const fill = kind === 'accent' ? b.accent : kind === 'primary' ? b.primary : 'transparent';
  const color = kind === 'accent' ? b.onAccent : kind === 'primary' ? b.onPrimary : ink || b.primary;
  return (
    <Pressable
      onPress={onPress || (() => open(action))}
      accessibilityRole="button"
      style={[s.button, { backgroundColor: fill, borderRadius: b.buttonRadius, borderWidth: kind === 'outline' ? 1.5 : 0, borderColor: color }]}
    >
      {icon}
      <Text style={{ color, fontSize: b.fs(14), fontWeight: '800', textAlign: 'center', flexShrink: 1 }}>{label}</Text>
    </Pressable>
  );
}

function Cover({ uri, height, style }: { uri?: string | null; height?: number; style?: any }) {
  const b = useBrand();
  return uri ? (
    <Image source={{ uri }} style={[{ width: '100%', height, backgroundColor: b.line }, style]} resizeMode="cover" />
  ) : (
    <View style={[{ width: '100%', height, backgroundColor: `${b.primary}22`, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Heart size={24} color={b.primary} />
    </View>
  );
}

function Bar({ value, track }: { value: number; track?: string }) {
  const b = useBrand();
  return (
    <View style={s.progressWrap}>
      <View style={[s.progressTrack, { backgroundColor: track || b.line }]}>
        <View style={{ height: '100%', borderRadius: 4, width: `${value}%`, backgroundColor: b.primary }} />
      </View>
      <Text style={{ fontSize: b.fs(12), fontWeight: '700', color: b.text }}>%{value}</Text>
    </View>
  );
}

function Hero({ props }: P) {
  const b = useBrand();
  const open = useAction();
  const look = props.look || 'brand';
  const image = resolveMediaUrl(props.image_url || (look === 'image' ? b.site?.hero?.image_url : null), b.site?.url);
  const onImage = look === 'image' && !!image;
  const card = look === 'card';
  const ink = onImage ? '#FFFFFF' : card ? b.text : b.onPrimary;
  const center = props.align === 'center';
  const PrimaryIcon = props.primary_action?.target === 'bagis-yap' ? Heart : null;
  const light = ink === '#FFFFFF';
  const body = (
    <View style={[s.hero, card && { padding: space.lg }, center && { alignItems: 'center' }]}>
      <Text style={[s.heroKicker, { color: card ? b.primary : light ? '#E8D8A0' : ink, fontSize: b.fs(11) }]}>
        {(props.badge || b.name).toLocaleUpperCase('tr-TR')}
      </Text>
      <Text style={{ color: ink, fontSize: b.fs(23), lineHeight: b.fs(29), fontWeight: '800', textAlign: center ? 'center' : 'left' }}>
        {props.title || b.site?.hero?.title || b.site?.tagline || ACTIVE_TENANT?.tagline || 'Bir iyilik de sizden'}
      </Text>
      <Text style={{ color: ink, opacity: 0.88, fontSize: b.fs(13), lineHeight: b.fs(19), textAlign: center ? 'center' : 'left' }}>
        {props.text || b.site?.hero?.subtitle || ACTIVE_TENANT?.intro || 'Bağışlarınızı güvenle uygulama içinden ulaştırabilirsiniz.'}
      </Text>
      <View style={s.heroActions}>
        {props.primary_label && isKnown(props.primary_action) ? (
          <Pressable onPress={() => open(props.primary_action)} accessibilityRole="button"
            style={[s.heroBtn, { backgroundColor: b.accent, borderRadius: b.buttonRadius }]}>
            {PrimaryIcon ? <PrimaryIcon size={18} color={b.onAccent} /> : null}
            <Text style={{ color: b.onAccent, fontSize: b.fs(14), fontWeight: '800', flexShrink: 1 }}>{props.primary_label}</Text>
          </Pressable>
        ) : null}
        {props.secondary_label && isKnown(props.secondary_action) ? (
          <Pressable onPress={() => open(props.secondary_action)} accessibilityRole="button"
            style={[s.heroBtn, { borderRadius: b.buttonRadius, borderWidth: 1, borderColor: `${ink}59`, backgroundColor: `${ink}1F` }]}>
            <Text style={{ color: ink, fontSize: b.fs(14), fontWeight: '700', flexShrink: 1 }}>{props.secondary_label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
  if (card) {
    return (
      <View style={{ margin: space.lg, backgroundColor: b.surface, borderRadius: b.radius, overflow: 'hidden', borderWidth: 1, borderColor: b.line }}>
        {image ? <Cover uri={image} height={150} /> : null}
        {body}
      </View>
    );
  }
  return (
    <View style={[s.heroBox, { backgroundColor: b.primary, borderBottomLeftRadius: b.radius + 10, borderBottomRightRadius: b.radius + 10 }]}>
      {onImage ? (
        <>
          <Image source={{ uri: image! }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15,23,42,0.55)' }]} />
        </>
      ) : null}
      {body}
    </View>
  );
}

function BannerSlider({ props }: P) {
  const b = useBrand();
  const open = useAction();
  const { width } = useWindowDimensions();
  const cardW = width - space.lg * 2;
  const slides = listOf(props.items).filter((i) => i?.image_url);
  const look = props.look || 'overlay';
  const height = props.height || 158;
  if (!slides.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast"
      snapToInterval={cardW + space.sm} contentContainerStyle={s.row}>
      {slides.map((item, i) => {
        const over = look === 'overlay';
        const texts = look !== 'plain' && (item.title || item.text);
        return (
          <Pressable key={i} disabled={!isKnown(item.action)} onPress={() => open(item.action)}
            accessibilityRole="button" accessibilityLabel={item.title || 'Slayt'}
            style={{ width: cardW, borderRadius: b.radius, overflow: 'hidden', backgroundColor: b.surface }}>
            <Cover uri={resolveMediaUrl(item.image_url, b.site?.url)} height={height} />
            {texts ? (
              <View style={over ? s.bannerOverlay : { padding: space.md }}>
                {item.title ? <Text numberOfLines={2} style={{ color: over ? '#FFFFFF' : b.text, fontSize: b.fs(15), fontWeight: '800' }}>{item.title}</Text> : null}
                {item.text ? <Text numberOfLines={2} style={{ color: over ? 'rgba(255,255,255,0.9)' : b.muted, fontSize: b.fs(12), marginTop: 2 }}>{item.text}</Text> : null}
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function QuickCategories({ props, ink }: P) {
  const b = useBrand();
  const open = useAction();
  const { data: cats = [] } = useQuery({ queryKey: ['public', 'donation-categories'], queryFn: fetchDonationCategories });
  const { data: campaigns = [] } = useCampaigns();
  if (!cats.length) return null;
  const grid = props.look === 'grid';
  const cards = cats.map((cat) => {
    const img = resolveMediaUrl(cat.image_url, b.site?.url);
    const linked = cat.campaign_id ? campaigns.find((c) => c.id === cat.campaign_id) : undefined;
    return (
      <Pressable key={cat.id} accessibilityRole="button"
        onPress={() => open(linked ? { type: 'campaign', target: linked.slug } : screen('bagis-yap'))}
        style={[s.quickCard, { backgroundColor: b.surface, borderColor: b.line, borderRadius: Math.min(b.radius, 16) }, grid ? { width: '31.5%' } : { width: 118 }]}>
        {img ? (
          <Image source={{ uri: img }} style={[s.quickImg, { borderRadius: Math.min(b.radius, 14) }]} resizeMode="cover" />
        ) : (
          <View style={[s.quickImg, s.center, { borderRadius: Math.min(b.radius, 14), backgroundColor: `${b.primary}14` }]}>
            <Heart size={20} color={b.primary} />
          </View>
        )}
        <Text numberOfLines={2} style={{ fontSize: b.fs(12), fontWeight: '700', color: b.text, textAlign: 'center' }}>{cat.title}</Text>
        {cat.suggested_amounts_cents?.[0] ? (
          <Text style={{ fontSize: b.fs(12), fontWeight: '800', color: b.primary }}>{money(cat.suggested_amounts_cents[0])}</Text>
        ) : null}
      </Pressable>
    );
  });
  return (
    <View>
      <View style={s.pad}><Title text={props.title} ink={ink} /></View>
      {grid ? <View style={[s.pad, s.wrap]}>{cards}</View>
        : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>{cards}</ScrollView>}
    </View>
  );
}

function CampaignCard({ c, compact }: { c: PublicCampaign; compact?: boolean }) {
  const b = useBrand();
  const open = useAction();
  const add = useQuickAdd();
  const img = resolveMediaUrl(c.cover_image_url, b.site?.url);
  const first = c.suggested_amounts_cents?.[0] || c.reference_amounts?.TRY;
  const pct = percent(c);
  const go = () => open({ type: 'campaign', target: c.slug });
  const price = first ? money(first, c.currency || 'TRY') : 'Serbest Tutar';
  if (compact) {
    return (
      <Pressable onPress={go} style={[s.compact, { backgroundColor: b.surface, borderColor: b.line, borderRadius: b.radius }]}>
        <View style={{ width: 72, height: 72, borderRadius: Math.min(b.radius, 14), overflow: 'hidden' }}><Cover uri={img} height={72} /></View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={2} style={{ fontSize: b.fs(14), fontWeight: '800', color: b.text }}>{c.title}</Text>
          {pct !== null ? <Bar value={pct} /> : null}
          <Text style={{ fontSize: b.fs(13), fontWeight: '800', color: b.primary }}>{price}</Text>
        </View>
        <ChevronRight size={18} color={b.primary} />
      </Pressable>
    );
  }
  return (
    <Pressable onPress={go} style={{ backgroundColor: b.surface, borderRadius: b.radius, overflow: 'hidden', borderWidth: 1, borderColor: b.line }}>
      {img ? <Cover uri={img} height={175} /> : null}
      <View style={{ padding: space.md, gap: 8 }}>
        <View style={s.between}>
          {c.category ? (
            <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: `${b.primary}14` }}>
              <Text style={{ fontSize: b.fs(11), fontWeight: '800', color: b.primary }}>{CATEGORY_LABELS[c.category.toLowerCase()] || c.category}</Text>
            </View>
          ) : null}
          {c.country ? <Text style={{ fontSize: b.fs(12), color: b.muted, fontWeight: '600' }}>{c.country}</Text> : null}
        </View>
        <Text style={{ fontSize: b.fs(16), fontWeight: '800', color: b.text }}>{c.title}</Text>
        {c.summary ? <Text numberOfLines={2} style={{ fontSize: b.fs(13), color: b.muted, lineHeight: b.fs(19) }}>{c.summary}</Text> : null}
        {pct !== null ? <Bar value={pct} /> : null}
        <View style={[s.between, { marginTop: 4 }]}>
          <View>
            <Text style={{ fontSize: b.fs(10), color: b.muted, fontWeight: '600' }}>Önerilen Tutar</Text>
            <Text style={{ fontSize: b.fs(16), fontWeight: '800', color: b.primary }}>{price}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable onPress={() => add(c)} accessibilityRole="button" accessibilityLabel="Sepete Ekle"
              style={[s.cartMini, { borderColor: b.primary, backgroundColor: b.surface }]}>
              <Plus size={16} color={b.primary} /><ShoppingBag size={15} color={b.primary} />
            </Pressable>
            <Pressable onPress={go} accessibilityRole="button" style={[s.donateBtn, { backgroundColor: b.primary }]}>
              <Heart size={15} color={b.onPrimary} />
              <Text style={{ color: b.onPrimary, fontSize: b.fs(13), fontWeight: '800' }}>Bağış Yap</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function CampaignList({ props, ink }: P) {
  const b = useBrand();
  const query = useCampaigns();
  const [cat, setCat] = useState('all');
  const campaigns = query.data ?? [];
  const keys = useMemo(
    () => ['all', ...Array.from(new Set(campaigns.map((c) => (c.category || '').toLowerCase()).filter(Boolean)))],
    [campaigns],
  );
  const matching = cat === 'all' ? campaigns : campaigns.filter((c) => (c.category || '').toLowerCase() === cat);
  const shown = matching.slice(0, props.limit || 100);
  return (
    <View>
      {props.show_filter !== false && keys.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.md, gap: 8 }}>
          {keys.map((key) => (
            <Pressable key={key} onPress={() => setCat(key)}
              style={[s.chip, { backgroundColor: cat === key ? b.primary : b.surface, borderColor: cat === key ? b.primary : b.line }]}>
              <Text style={{ fontSize: b.fs(13), fontWeight: '700', color: cat === key ? b.onPrimary : b.text }}>
                {CATEGORY_LABELS[key] || key.toLocaleUpperCase('tr-TR')}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={[s.pad, { gap: space.md }]}>
        <Title text={props.title} ink={ink} right={`${shown.length} kampanya`} />
        {query.isLoading ? <ActivityIndicator size="large" color={b.primary} style={{ marginVertical: 40 }} />
          : shown.length === 0 ? (
            <View style={{ backgroundColor: b.surface, borderRadius: b.radius, padding: space.xl, alignItems: 'center' }}>
              <Text style={{ color: b.muted, fontSize: b.fs(14) }}>Bu kategoride aktif kampanya bulunamadı.</Text>
            </View>
          ) : shown.map((c) => <CampaignCard key={c.id} c={c} compact={props.look === 'compact'} />)}
      </View>
    </View>
  );
}

function CampaignCarousel({ props, ink }: P) {
  const b = useBrand();
  const open = useAction();
  const { data: all = [] } = useCampaigns();
  const picked = listOf(props.campaigns);
  const featured = all.filter((c) => c.is_featured);
  const source = picked.length ? picked.map((id) => all.find((c) => c.id === id)).filter((c): c is PublicCampaign => !!c) : featured.length ? featured : all;
  const shown = source.slice(0, props.limit || 8);
  if (!shown.length) return null;
  const poster = props.look === 'poster';
  return (
    <View>
      <View style={s.pad}><Title text={props.title} ink={ink} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {shown.map((c) => {
          const img = resolveMediaUrl(c.cover_image_url, b.site?.url);
          return (
            <Pressable key={c.id} onPress={() => open({ type: 'campaign', target: c.slug })} accessibilityRole="button"
              style={{ width: poster ? 168 : 220, borderRadius: b.radius, overflow: 'hidden', backgroundColor: b.surface, borderWidth: poster ? 0 : 1, borderColor: b.line }}>
              <Cover uri={img} height={poster ? 232 : 124} />
              <View style={poster ? s.bannerOverlay : { padding: space.md, gap: 6 }}>
                <Text numberOfLines={2} style={{ color: poster ? '#FFFFFF' : b.text, fontSize: b.fs(14), fontWeight: '800' }}>{c.title}</Text>
                {!poster && percent(c) !== null ? <Bar value={percent(c)!} /> : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function usePicked(id?: string) {
  const { data = [] } = useCampaigns();
  return id ? data.find((c) => c.id === id) : data.find((c) => c.is_featured) || data[0];
}

function FeaturedCampaign({ props }: P) {
  const b = useBrand();
  const c = usePicked(props.campaign);
  if (!c) return null;
  if (props.look !== 'cover') return <View style={s.pad}><CampaignCard c={c} /></View>;
  return (
    <View style={[s.pad]}>
      <View style={{ borderRadius: b.radius, overflow: 'hidden' }}>
        <Cover uri={resolveMediaUrl(c.cover_image_url, b.site?.url)} height={300} />
        <View style={[s.bannerOverlay, { gap: 10, padding: space.lg }]}>
          <Text style={{ color: '#FFFFFF', fontSize: b.fs(20), fontWeight: '800' }}>{c.title}</Text>
          {c.summary ? <Text numberOfLines={2} style={{ color: 'rgba(255,255,255,0.9)', fontSize: b.fs(13) }}>{c.summary}</Text> : null}
          <Button label={props.button_label || 'Bağış Yap'} kind="accent" action={{ type: 'campaign', target: c.slug }} />
        </View>
      </View>
    </View>
  );
}

function Progress({ props }: P) {
  const b = useBrand();
  const open = useAction();
  const c = usePicked(props.campaign);
  const pct = c ? percent(c) : null;
  if (!c || pct === null) return null;
  return (
    <View style={s.pad}>
      <Pressable onPress={() => open({ type: 'campaign', target: c.slug })}
        style={{ backgroundColor: b.surface, borderRadius: b.radius, padding: space.lg, gap: 10, borderWidth: 1, borderColor: b.line }}>
        <Text style={{ fontSize: b.fs(15), fontWeight: '800', color: b.text }}>{props.title || c.title}</Text>
        <Bar value={pct} />
        <Text style={{ fontSize: b.fs(12), color: b.muted }}>{money(c.collected_cents || 0)} / {money(c.target_cents || 0)}</Text>
      </Pressable>
    </View>
  );
}

function QuickDonate({ props }: P) {
  const b = useBrand();
  const add = useQuickAdd();
  const c = usePicked(props.campaign);
  const amounts = listOf(props.amounts).map((a) => Number(a?.amount)).filter((n) => n > 0);
  const choices = amounts.length ? amounts : [100, 250, 500];
  const [value, setValue] = useState(String(choices[0]));
  if (!c) return null;
  const submit = () => {
    const lira = parseFloat(value.replace(',', '.'));
    const cents = Math.round(lira * 100);
    if (!(cents > 0)) return notify('Geçerli bir tutar girin.');
    if (c.min_donation_cents && cents < c.min_donation_cents) return notify(`En az ${money(c.min_donation_cents)} bağışlayabilirsiniz.`);
    add(c, cents);
  };
  return (
    <View style={s.pad}>
      <View style={{ backgroundColor: b.surface, borderRadius: b.radius, padding: space.lg, gap: space.md, borderWidth: 1, borderColor: b.line }}>
        {props.title ? <Text style={{ fontSize: b.fs(17), fontWeight: '800', color: b.text }}>{props.title}</Text> : null}
        {props.text ? <Text style={{ fontSize: b.fs(13), color: b.muted }}>{props.text}</Text> : null}
        <Text style={{ fontSize: b.fs(12), color: b.primary, fontWeight: '700' }}>{c.title}</Text>
        <View style={s.wrap}>
          {choices.map((n, i) => {
            const on = value === String(n);
            return (
              <Pressable key={i} onPress={() => setValue(String(n))}
                style={[s.chip, { backgroundColor: on ? b.primary : b.surface, borderColor: on ? b.primary : b.line }]}>
                <Text style={{ color: on ? b.onPrimary : b.text, fontWeight: '800', fontSize: b.fs(14) }}>{n} ₺</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput value={value} onChangeText={setValue} keyboardType="decimal-pad" accessibilityLabel="Bağış tutarı"
          style={{ borderWidth: 1, borderColor: b.line, borderRadius: b.buttonRadius, padding: 12, fontSize: b.fs(16), color: b.text }} />
        <Button label={props.button_label || 'Sepete Ekle'} onPress={submit} />
      </View>
    </View>
  );
}

function Shortcuts({ props, ink }: P) {
  const b = useBrand();
  const open = useAction();
  const columns = Math.min(4, Math.max(2, props.columns || 4));
  const look = props.look || 'tile';
  const items = listOf(props.items).filter((i) => isKnown(i?.action));
  if (!items.length) return null;
  return (
    <View style={s.pad}>
      <Title text={props.title} ink={ink} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
        {items.map((item, i) => {
          const Icon = iconOf(item.icon);
          const circle = look === 'circle';
          return (
            <View key={i} style={{ width: `${100 / columns}%`, padding: 4 }}>
              <Pressable onPress={() => open(item.action)} accessibilityRole="button" style={[s.shortcut, !circle && {
                backgroundColor: look === 'outline' ? 'transparent' : b.surface, borderRadius: Math.min(b.radius, 16),
                borderWidth: look === 'outline' ? 1.5 : 1, borderColor: look === 'outline' ? b.primary : b.line,
              }]}>
                <View style={[s.center, { width: 46, height: 46, borderRadius: circle ? 23 : Math.min(b.radius, 12), backgroundColor: circle ? b.primary : `${b.primary}14` }]}>
                  <Icon size={21} color={circle ? b.onPrimary : b.primary} />
                </View>
                <Text numberOfLines={2} style={{ fontSize: b.fs(11), fontWeight: '700', textAlign: 'center', color: circle || look === 'outline' ? ink : b.text }}>{item.label}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ToolCards({ props }: P) {
  const b = useBrand();
  const open = useAction();
  const items = listOf(props.items).filter((i) => isKnown(i?.action));
  if (!items.length) return null;
  return (
    <View style={[s.pad, s.wrap]}>
      {items.map((item, i) => {
        const Icon = iconOf(item.icon);
        const color = item.color === 'accent' ? b.accent : b.primary;
        return (
          <Pressable key={i} onPress={() => open(item.action)} accessibilityRole="button"
            style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: b.surface, borderRadius: Math.min(b.radius, 16), borderWidth: 1, borderColor: `${color}44`, padding: space.md, gap: 6 }}>
            <View style={[s.center, { width: 38, height: 38, borderRadius: Math.min(b.radius, 12), backgroundColor: `${color}1C` }]}><Icon size={20} color={color} /></View>
            <Text style={{ fontSize: b.fs(14), fontWeight: '800', color: b.text }}>{item.title}</Text>
            {item.text ? <Text style={{ fontSize: b.fs(12), color: b.muted }}>{item.text}</Text> : null}
            <View style={{ alignSelf: 'flex-end' }}><ChevronRight size={16} color={color} /></View>
          </Pressable>
        );
      })}
    </View>
  );
}

function Buttons({ props, ink }: P) {
  return (
    <View style={[s.pad, { gap: space.sm }]}>
      {listOf(props.items).map((item, i) => <Button key={i} label={item.label} action={item.action} kind={item.style || 'primary'} ink={ink} />)}
    </View>
  );
}

function CtaBand({ props }: P) {
  const b = useBrand();
  if (!props.title && !props.text && !props.button_label) return null;
  return (
    <View style={s.pad}>
      <View style={{ backgroundColor: b.primary, borderRadius: b.radius, padding: space.xl, gap: space.md, alignItems: 'center' }}>
        {props.title ? <Text style={{ color: b.onPrimary, fontSize: b.fs(20), fontWeight: '800', textAlign: 'center' }}>{props.title}</Text> : null}
        {props.text ? <Text style={{ color: b.onPrimary, opacity: 0.9, fontSize: b.fs(14), textAlign: 'center' }}>{props.text}</Text> : null}
        <Button label={props.button_label} action={props.action} kind="accent" />
      </View>
    </View>
  );
}

function Heading({ props, ink }: P) {
  const b = useBrand();
  const textAlign = props.align === 'center' ? 'center' : 'left';
  return (
    <View style={[s.pad, { gap: 4 }]}>
      {props.title ? <Text style={{ fontSize: b.fs(20), fontWeight: '800', color: ink, textAlign }}>{props.title}</Text> : null}
      {props.text ? <Text style={{ fontSize: b.fs(14), color: ink, opacity: 0.75, textAlign }}>{props.text}</Text> : null}
    </View>
  );
}

/** Kalın, italik ve bağlantı; HTML çizilmez. */
function inline(text: string, link: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g).filter(Boolean).map((part, i) => {
    const href = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (href) {
      const safe = /^https?:\/\//i.test(href[2]);
      return <Text key={i} onPress={safe ? () => openUrl(href[2]) : undefined} style={safe ? { color: link, textDecorationLine: 'underline' } : undefined}>{href[1]}</Text>;
    }
    if (/^\*\*.+\*\*$/.test(part)) return <Text key={i} style={{ fontWeight: '800' }}>{part.slice(2, -2)}</Text>;
    if (/^\*.+\*$/.test(part)) return <Text key={i} style={{ fontStyle: 'italic' }}>{part.slice(1, -1)}</Text>;
    return part;
  });
}

function RichText({ props, ink }: P) {
  const b = useBrand();
  const textAlign = props.align === 'center' ? 'center' : 'left';
  const lines = String(props.text || '').split('\n').filter((l) => l.trim());
  return (
    <View style={[s.pad, { gap: 8 }]}>
      {lines.map((line, i) => {
        const head = /^#{2,3}\s+(.*)/.exec(line);
        const item = /^[-*]\s+(.*)/.exec(line);
        return (
          <Text key={i} style={{ color: ink, textAlign, fontSize: b.fs(head ? 17 : 15), lineHeight: b.fs(head ? 24 : 22), fontWeight: head ? '800' : '400', paddingLeft: item ? 12 : 0 }}>
            {item ? '•  ' : ''}{inline(head ? head[1] : item ? item[1] : line, b.primary)}
          </Text>
        );
      })}
    </View>
  );
}

function Faq({ props, ink }: P) {
  const b = useBrand();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <View style={[s.pad, { gap: 8 }]}>
      <Title text={props.title} ink={ink} />
      {listOf(props.items).map((item, i) => (
        <Pressable key={i} onPress={() => setOpen(open === i ? null : i)} accessibilityRole="button" accessibilityState={{ expanded: open === i }}
          style={{ backgroundColor: b.surface, borderRadius: b.buttonRadius, borderWidth: 1, borderColor: b.line, padding: space.md, gap: 8 }}>
          <View style={s.between}>
            <Text style={{ flex: 1, fontSize: b.fs(14), fontWeight: '700', color: b.text }}>{item.question}</Text>
            {open === i ? <ChevronUp size={18} color={b.primary} /> : <ChevronDown size={18} color={b.primary} />}
          </View>
          {open === i ? <Text style={{ fontSize: b.fs(14), color: b.muted, lineHeight: b.fs(21) }}>{item.answer}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

function Stats({ props, ink }: P) {
  const b = useBrand();
  const band = props.look === 'band';
  const items = listOf(props.items);
  if (!items.length) return null;
  return (
    <View style={s.pad}>
      <Title text={props.title} ink={ink} />
      <View style={[s.wrap, band && { backgroundColor: b.primary, borderRadius: b.radius, padding: space.md }]}>
        {items.map((item, i) => (
          <View key={i} style={[{ flexGrow: 1, flexBasis: '28%', alignItems: 'center', padding: space.md }, !band && { backgroundColor: b.surface, borderRadius: Math.min(b.radius, 16), borderWidth: 1, borderColor: b.line }]}>
            <Text style={{ fontSize: b.fs(20), fontWeight: '900', color: band ? b.onPrimary : b.primary }}>{item.value}</Text>
            <Text style={{ fontSize: b.fs(11), color: band ? b.onPrimary : b.muted, textAlign: 'center' }}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ContactCard({ props }: P) {
  const b = useBrand();
  const phone = b.site?.contact?.phone;
  return (
    <View style={s.pad}>
      <View style={{ backgroundColor: b.surface, borderRadius: b.radius, padding: space.lg, borderWidth: 1, borderColor: b.line, gap: space.sm }}>
        <Text style={{ fontSize: b.fs(15), fontWeight: '800', color: b.text }}>{props.title || b.name}</Text>
        {phone ? (
          <Pressable onPress={() => call(phone)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Phone size={16} color={b.primary} />
            <Text style={{ fontSize: b.fs(15), fontWeight: '700', color: b.primary }}>{phone}</Text>
          </Pressable>
        ) : null}
        {props.show_buttons !== false ? (
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: 6 }}>
            <View style={{ flex: 1 }}><Button label="Makbuz Doğrula" action={screen('makbuz-dogrula')} kind="outline" /></View>
            <View style={{ flex: 1 }}><Button label="Hakkımızda & İletişim" action={screen('iletisim')} kind="outline" ink={b.text} /></View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function NewsList({ props, ink }: P) {
  const b = useBrand();
  const open = useAction();
  const kind = props.kind || 'all';
  const { data = [] } = useQuery({ queryKey: ['public', 'content-posts', kind], queryFn: () => fetchContentPosts(kind) });
  const posts = data.slice(0, props.limit || 5);
  if (!posts.length) return null;
  const look = props.look || 'list';
  const cards = posts.map((p) => {
    const img = resolveMediaUrl(p.image_url, b.site?.url);
    const row = look === 'list';
    return (
      <Pressable key={p.id} onPress={() => open({ type: 'news', target: p.slug })} accessibilityRole="button"
        style={[{ backgroundColor: b.surface, borderRadius: b.radius, overflow: 'hidden', borderWidth: 1, borderColor: b.line }, row && s.compact, look === 'carousel' && { width: 240 }]}>
        {row ? <View style={{ width: 72, height: 72, borderRadius: Math.min(b.radius, 14), overflow: 'hidden' }}><Cover uri={img} height={72} /></View> : <Cover uri={img} height={140} />}
        <View style={[{ gap: 4 }, row ? { flex: 1 } : { padding: space.md }]}>
          <Text numberOfLines={2} style={{ fontSize: b.fs(14), fontWeight: '800', color: b.text }}>{p.title}</Text>
          {p.summary ? <Text numberOfLines={2} style={{ fontSize: b.fs(12), color: b.muted }}>{p.summary}</Text> : null}
        </View>
      </Pressable>
    );
  });
  return (
    <View>
      <View style={s.pad}><Title text={props.title} ink={ink} /></View>
      {look === 'carousel' ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>{cards}</ScrollView>
        : <View style={[s.pad, { gap: space.md }]}>{cards}</View>}
    </View>
  );
}

const RATIOS: Record<string, number> = { '16-9': 16 / 9, '4-3': 4 / 3, '1-1': 1, '3-4': 3 / 4 };

function ImageBlock({ props }: P) {
  const b = useBrand();
  const open = useAction();
  const uri = resolveMediaUrl(props.image_url, b.site?.url);
  if (!uri) return null;
  return (
    <View style={s.pad}>
      <Pressable disabled={!isKnown(props.action)} onPress={() => open(props.action)} accessibilityLabel={props.alt}>
        <Image source={{ uri }} accessibilityLabel={props.alt} resizeMode="cover"
          style={{ width: '100%', aspectRatio: RATIOS[props.ratio || '16-9'] || 16 / 9, borderRadius: b.radius, backgroundColor: b.line }} />
      </Pressable>
    </View>
  );
}

function Gallery({ props, ink }: P) {
  const b = useBrand();
  const grid = (props.look || 'grid') === 'grid';
  const images = listOf(props.items).map((item, i) => {
    const uri = resolveMediaUrl(item?.image_url, b.site?.url);
    return uri ? (
      <Image key={i} source={{ uri }} accessibilityLabel={item.alt} resizeMode="cover"
        style={{ width: grid ? '48%' : 220, flexGrow: grid ? 1 : 0, height: 140, borderRadius: Math.min(b.radius, 16), backgroundColor: b.line }} />
    ) : null;
  }).filter(Boolean);
  if (!images.length) return null;
  return (
    <View>
      <View style={s.pad}><Title text={props.title} ink={ink} /></View>
      {grid ? <View style={[s.pad, s.wrap]}>{images}</View>
        : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>{images}</ScrollView>}
    </View>
  );
}

function VideoBlock({ props, ink }: P) {
  const b = useBrand();
  const v = props.video;
  if (!v?.id) return null;
  const url = v.provider === 'vimeo' ? `https://vimeo.com/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`;
  const cover = resolveMediaUrl(props.image_url, b.site?.url) || (v.provider === 'youtube' ? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` : null);
  return (
    <View style={s.pad}>
      <Title text={props.title} ink={ink} />
      <Pressable onPress={() => openUrl(url)} accessibilityRole="button" accessibilityLabel={props.title || 'Videoyu aç'}
        style={{ borderRadius: b.radius, overflow: 'hidden' }}>
        <Cover uri={cover} height={196} />
        <View style={[StyleSheet.absoluteFill, s.center]}>
          <View style={[s.center, { width: 60, height: 60, borderRadius: 30, backgroundColor: b.accent }]}><Play size={26} color={b.onAccent} /></View>
        </View>
      </Pressable>
    </View>
  );
}

function Countdown({ props, ink }: P) {
  const b = useBrand();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const end = props.ends_at ? new Date(props.ends_at).getTime() : NaN;
  if (Number.isNaN(end)) return null;
  const left = Math.max(0, Math.floor((end - now) / 1000));
  if (!left && !props.done_text) return null;
  const parts: [string, number][] = [['Gün', Math.floor(left / 86400)], ['Saat', Math.floor(left / 3600) % 24], ['Dakika', Math.floor(left / 60) % 60], ['Saniye', left % 60]];
  return (
    <View style={[s.pad, { gap: space.sm }]}>
      {props.title ? <Text style={{ fontSize: b.fs(16), fontWeight: '800', color: ink, textAlign: 'center' }}>{props.title}</Text> : null}
      {!left ? <Text style={{ fontSize: b.fs(18), fontWeight: '800', color: ink, textAlign: 'center' }}>{props.done_text}</Text> : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {parts.map(([label, value]) => (
            <View key={label} style={{ flex: 1, alignItems: 'center', backgroundColor: b.primary, borderRadius: b.buttonRadius, paddingVertical: 10 }}>
              <Text style={{ fontSize: b.fs(20), fontWeight: '900', color: b.onPrimary }}>{value}</Text>
              <Text style={{ fontSize: b.fs(11), color: b.onPrimary }}>{label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Spacer({ props }: P) {
  return <View style={{ height: props.size || 24 }} />;
}

function Divider({ ink }: P) {
  return <View style={[s.pad]}><View style={{ height: 1, backgroundColor: ink, opacity: 0.15 }} /></View>;
}

const BLOCKS: Record<string, React.ComponentType<P>> = {
  hero: Hero,
  banner_slider: BannerSlider,
  quick_categories: QuickCategories,
  campaign_list: CampaignList,
  campaign_carousel: CampaignCarousel,
  featured_campaign: FeaturedCampaign,
  progress: Progress,
  quick_donate: QuickDonate,
  shortcuts: Shortcuts,
  tool_cards: ToolCards,
  buttons: Buttons,
  cta_band: CtaBand,
  heading: Heading,
  richtext: RichText,
  faq: Faq,
  stats: Stats,
  contact_card: ContactCard,
  news_list: NewsList,
  image: ImageBlock,
  gallery: Gallery,
  video: VideoBlock,
  countdown: Countdown,
  spacer: Spacer,
  divider: Divider,
};

const SPACE: Record<string, number> = { none: 0, small: 6, normal: space.md, large: 28 };

function tone(b: Brand, value?: string): string | null {
  switch (value) {
    case 'white': return '#FFFFFF';
    case 'soft': return `${b.primary}12`;
    case 'brand': return b.primary;
    case 'accent': return b.accent;
    case 'dark': return '#0F172A';
    default: return null;
  }
}

/** Bir sayfanın blokları. Bu sürümün tanımadığı bloklar atlanır. */
export function Blocks({ blocks }: { blocks: { id: string; type: string; props: Record<string, any> }[] }) {
  const b = useBrand();
  return (
    <>
      {blocks.map((block) => {
        const Block = BLOCKS[block.type];
        if (!Block) return null;
        const props = block.props || {};
        const bg = tone(b, props.tone);
        const ink = props.tone === 'white' ? '#0F172A' : bg && props.tone !== 'soft' ? onColor(bg) : b.text;
        // Boş kalan blok (ör. banner yok) boşluk bırakmasın diye dolgu yalnız zemin rengi varken verilir.
        const pad = SPACE[props.space || 'normal'] ?? space.md;
        return (
          <View key={block.id} style={bg ? { backgroundColor: bg, paddingVertical: pad } : { marginVertical: pad / 2 }}>
            <Block props={props} ink={ink} />
          </View>
        );
      })}
    </>
  );
}

const s = StyleSheet.create({
  pad: { paddingHorizontal: space.lg },
  row: { paddingHorizontal: space.lg, gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  center: { alignItems: 'center', justifyContent: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  sectionTitle: { fontWeight: '800', letterSpacing: 0.8, opacity: 0.72 },
  button: { minHeight: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  heroBox: { marginTop: -1, paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: space.xl, overflow: 'hidden' },
  hero: { gap: 8 },
  heroKicker: { fontWeight: '800', letterSpacing: 1.2 },
  heroActions: { flexDirection: 'row', gap: space.sm, marginTop: 10, alignSelf: 'stretch' },
  heroBtn: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 8 },
  bannerOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.md, backgroundColor: 'rgba(15, 23, 42, 0.56)' },
  quickCard: { padding: space.sm, borderWidth: 1, alignItems: 'center', gap: 6 },
  quickImg: { width: 52, height: 52 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  compact: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, borderWidth: 1 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTrack: { flex: 1, height: 7, borderRadius: 4, overflow: 'hidden' },
  cartMini: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, height: 38, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1.5 },
  donateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 15, borderRadius: radius.pill },
  shortcut: { alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 4 },
});
