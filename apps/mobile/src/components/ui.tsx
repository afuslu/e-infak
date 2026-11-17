import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView,
  StyleProp, StyleSheet, Switch, Text, TextInput, TextInputProps, View, ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronDown, ChevronRight, Search, X } from 'lucide-react-native';
import { colors, font, radius, space } from '@/theme';

export function Screen({ children, onRefresh, refreshing, scroll = true, footer, style }: {
  children: React.ReactNode; onRefresh?: () => void; refreshing?: boolean; scroll?: boolean;
  footer?: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[{ padding: space.lg, paddingBottom: space.xl + (footer ? 0 : insets.bottom), gap: space.md }, style]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, style]}>{children}</View>
  );
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {body}
      {footer ? <View style={[styles.footer, { paddingBottom: space.md + insets.bottom }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.7 }]} accessibilityRole="button">
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{children}</Text>
      {right}
    </View>
  );
}

export function Row({ label, value, onPress }: { label: string; value?: React.ReactNode; onPress?: () => void }) {
  const content = (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={[styles.rowValue, onPress && { color: colors.primaryDark }]} selectable>{value || '—'}</Text>
      ) : (value ?? <Text style={styles.rowValue}>—</Text>)}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

type Variant = 'primary' | 'outline' | 'danger' | 'ghost';

export function Btn({ title, onPress, variant = 'primary', loading, disabled, icon, small, style }: {
  title: string; onPress?: () => void; variant?: Variant; loading?: boolean; disabled?: boolean;
  icon?: React.ReactNode; small?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || loading;
  const textColor = variant === 'primary' ? colors.white : variant === 'danger' ? colors.danger : colors.primaryDark;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      style={({ pressed }) => [
        styles.btn, small && styles.btnSmall,
        variant === 'primary' && { backgroundColor: colors.primary },
        variant === 'outline' && { borderWidth: 1, borderColor: colors.primaryLine, backgroundColor: colors.card },
        variant === 'danger' && { borderWidth: 1, borderColor: '#FECACA', backgroundColor: colors.dangerSoft },
        off && { opacity: 0.5 }, pressed && { opacity: 0.75 }, style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={textColor} /> : icon}
      <Text style={[styles.btnText, small && { fontSize: font.sm }, { color: textColor }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, error, hint, style, ...input }: TextInputProps & { label?: string; error?: string | null; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.faint}
        accessibilityLabel={label}
        {...input}
        style={[styles.input, input.multiline && { minHeight: 88, textAlignVertical: 'top' }, error ? { borderColor: colors.danger } : null, style]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function SwitchRow({ label, hint, value, onValueChange, disabled }: {
  label: string; hint?: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean;
}) {
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.switchLabel}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ true: colors.primary, false: '#CBD5D1' }} accessibilityLabel={label} />
    </View>
  );
}

export type Option<T extends string = string> = { value: T; label: string; hint?: string };

export function Chips<T extends string>({ options, value, onChange, wrap }: {
  options: Option<T>[]; value: T | null | undefined; onChange: (value: T) => void; wrap?: boolean;
}) {
  const items = options.map((o) => {
    const on = o.value === value;
    return (
      <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: on }}
        style={[styles.chip, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
        <Text style={[styles.chipText, on && { color: colors.white }]}>{o.label}</Text>
      </Pressable>
    );
  });
  if (wrap) return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{items}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ flexGrow: 0 }}>
      {items}
    </ScrollView>
  );
}

type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'muted';
const TONES: Record<Tone, [string, string]> = {
  ok: [colors.primarySoft, colors.primaryDeep],
  warn: [colors.warnSoft, colors.warn],
  danger: [colors.dangerSoft, colors.danger],
  info: [colors.infoSoft, colors.info],
  muted: ['#EEF1F0', colors.muted],
};

export function Badge({ label, tone = 'muted' }: { label: string; tone?: Tone }) {
  const [bg, fg] = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} size="large" />
      {label ? <Text style={styles.hint}>{label}</Text> : null}
    </View>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <View style={styles.center}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={[styles.hint, { textAlign: 'center' }]}>{text}</Text> : null}
      {action}
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.emptyTitle}>Yüklenemedi</Text>
      <Text style={[styles.hint, { textAlign: 'center' }]}>{(error as any)?.message || 'Bir hata oluştu.'}</Text>
      {onRetry ? <Btn title="Tekrar dene" variant="outline" small onPress={onRetry} /> : null}
    </View>
  );
}

/** Sorgu durumuna göre yükleniyor / hata / içerik gösterir. */
export function QueryView<T>({ query, children }: {
  query: { data: T | undefined; isLoading: boolean; error: unknown; refetch: () => void };
  children: (data: T) => React.ReactNode;
}) {
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorView error={query.error} onRetry={() => query.refetch()} />;
  return <Loading />;
}

export function ListItem({ title, subtitle, meta, right, left, onPress, chevron }: {
  title: string; subtitle?: string | null; meta?: string | null; right?: React.ReactNode; left?: React.ReactNode;
  onPress?: () => void; chevron?: boolean;
}) {
  const inner = (
    <>
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.itemTitle} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={styles.itemSub} numberOfLines={2}>{subtitle}</Text> : null}
        {meta ? <Text style={styles.itemMeta} numberOfLines={1}>{meta}</Text> : null}
      </View>
      {right ? <View style={{ alignItems: 'flex-end', gap: 4 }}>{right}</View> : null}
      {chevron ? <ChevronRight size={18} color={colors.faint} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.item}>{inner}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.primarySoft }]}>
      {inner}
    </Pressable>
  );
}

export function Avatar({ text }: { text: string }) {
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{text}</Text>
    </View>
  );
}

export function SearchBar({ value, onChangeText, placeholder, right }: {
  value: string; onChangeText: (text: string) => void; placeholder?: string; right?: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
      <View style={styles.search}>
        <Search size={18} color={colors.faint} />
        <TextInput
          value={value} onChangeText={onChangeText} placeholder={placeholder || 'Ara'} placeholderTextColor={colors.faint}
          style={styles.searchInput} autoCapitalize="none" autoCorrect={false} returnKeyType="search" accessibilityLabel={placeholder || 'Ara'}
        />
        {value ? (
          <Pressable onPress={() => onChangeText('')} hitSlop={10} accessibilityLabel="Aramayı temizle">
            <X size={18} color={colors.faint} />
          </Pressable>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Sheet({ visible, onClose, title, children, footer }: {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheetBack} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Kapat" />
        <View style={[styles.sheet, { paddingBottom: space.lg + insets.bottom }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Kapat" accessibilityRole="button">
              <X size={22} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: space.md }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Select<T extends string>({ label, value, options, onChange, placeholder, searchable, allowClear, error }: {
  label?: string; value: T | null | undefined; options: Option<T>[]; onChange: (value: T | null) => void;
  placeholder?: string; searchable?: boolean; allowClear?: boolean; error?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const insets = useSafeAreaInsets();
  const selected = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const t = term.trim().toLocaleLowerCase('tr-TR');
    return t ? options.filter((o) => o.label.toLocaleLowerCase('tr-TR').includes(t)) : options;
  }, [options, term]);
  const pick = (next: T | null) => {
    onChange(next);
    setOpen(false);
    setTerm('');
  };
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable onPress={() => setOpen(true)} style={[styles.input, styles.select, error ? { borderColor: colors.danger } : null]} accessibilityRole="button" accessibilityLabel={label}>
        <Text style={[styles.selectText, !selected && { color: colors.faint }]} numberOfLines={1}>
          {selected?.label || placeholder || 'Seçin'}
        </Text>
        <ChevronDown size={18} color={colors.faint} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.sheetBack}>
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} accessibilityLabel="Kapat" />
          <View style={[styles.sheet, { paddingBottom: space.lg + insets.bottom }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{label || 'Seçin'}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12} accessibilityLabel="Kapat"><X size={22} color={colors.muted} /></Pressable>
            </View>
            {searchable ? <SearchBar value={term} onChangeText={setTerm} /> : null}
            <FlatList
              data={shown}
              keyExtractor={(o) => o.value}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 420 }}
              ListHeaderComponent={allowClear && value ? (
                <Pressable onPress={() => pick(null)} style={styles.option}><Text style={[styles.optionText, { color: colors.danger }]}>Seçimi temizle</Text></Pressable>
              ) : null}
              ListEmptyComponent={<Text style={[styles.hint, { padding: space.lg, textAlign: 'center' }]}>Sonuç yok</Text>}
              renderItem={({ item }) => (
                <Pressable onPress={() => pick(item.value)} style={styles.option} accessibilityRole="button">
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionText}>{item.label}</Text>
                    {item.hint ? <Text style={styles.hint}>{item.hint}</Text> : null}
                  </View>
                  {item.value === value ? <Check size={18} color={colors.primary} /> : null}
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function Fab({ label, onPress, icon }: { label: string; onPress: () => void; icon?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [styles.fab, { bottom: space.lg + insets.bottom }, pressed && { opacity: 0.8 }]}>
      {icon}
      <Text style={styles.fabText}>{label}</Text>
    </Pressable>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={[styles.card, { flex: 1, minWidth: 150, gap: 4 }]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={styles.hint}>{sub}</Text> : null}
    </View>
  );
}

export function Notice({ text, tone = 'info' }: { text: string; tone?: Tone }) {
  const [bg, fg] = TONES[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.md, padding: space.md }}>
      <Text style={{ color: fg, fontSize: font.sm, lineHeight: 19 }}>{text}</Text>
    </View>
  );
}

export const ui = StyleSheet.create({
  title: { fontSize: font.xl, fontWeight: '700', color: colors.text },
  text: { fontSize: font.md, color: colors.text },
  muted: { fontSize: font.sm, color: colors.muted },
  amount: { fontSize: font.md, fontWeight: '700', color: colors.text },
  rowGap: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  wrapGap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  listCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  separator: { height: 1, backgroundColor: colors.line, marginLeft: space.lg },
});

const styles = StyleSheet.create({
  footer: { padding: space.lg, paddingTop: space.md, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line, gap: space.sm },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space.lg, gap: space.sm },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  section: { fontSize: font.sm, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: 6 },
  rowLabel: { fontSize: font.sm, color: colors.muted, flexShrink: 0 },
  rowValue: { fontSize: font.md, color: colors.text, flex: 1, textAlign: 'right' },
  btn: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  btnSmall: { minHeight: 38, paddingHorizontal: space.md },
  btnText: { fontSize: font.md, fontWeight: '700' },
  label: { fontSize: font.sm, fontWeight: '600', color: colors.text },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10, fontSize: font.md, color: colors.text, backgroundColor: colors.card },
  error: { fontSize: font.xs, color: colors.danger },
  hint: { fontSize: font.xs, color: colors.muted, lineHeight: 17 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  switchLabel: { fontSize: font.md, color: colors.text, fontWeight: '500' },
  chip: { paddingHorizontal: 14, minHeight: 36, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  chipText: { fontSize: font.sm, fontWeight: '600', color: colors.muted },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  center: { padding: space.xl * 1.5, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  emptyTitle: { fontSize: font.lg, fontWeight: '700', color: colors.text, textAlign: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 60, backgroundColor: colors.card },
  itemTitle: { fontSize: font.md, fontWeight: '600', color: colors.text },
  itemSub: { fontSize: font.sm, color: colors.muted },
  itemMeta: { fontSize: font.xs, color: colors.faint },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primaryDeep, fontWeight: '700', fontSize: font.sm },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 46 },
  searchInput: { flex: 1, fontSize: font.md, color: colors.text, paddingVertical: 8 },
  sheetBack: { flex: 1, backgroundColor: 'rgba(14,27,23,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: space.lg, maxHeight: '88%', gap: space.md },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: font.lg, fontWeight: '700', color: colors.text },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  selectText: { fontSize: font.md, color: colors.text, flex: 1 },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line, minHeight: 48 },
  optionText: { fontSize: font.md, color: colors.text },
  fab: { position: 'absolute', right: space.lg, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 18, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.sm, elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  fabText: { color: colors.white, fontWeight: '700', fontSize: font.md },
  statLabel: { fontSize: font.xs, color: colors.muted, fontWeight: '600' },
  statValue: { fontSize: font.xl, fontWeight: '800', color: colors.text },
});
