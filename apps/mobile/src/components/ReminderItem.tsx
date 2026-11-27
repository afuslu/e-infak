import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Href, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { AlarmClock, Check, Pencil, Phone, Repeat, RotateCcw, Trash2, User } from 'lucide-react-native';
import { af } from '@/lib/api';
import { call, dateTime, isDialable } from '@/lib/format';
import { remember } from '@/lib/selected';
import { combine, formatWhen, isDue, localDate, localTime, nextHour, REMINDERS_KEY, REPEAT_LABEL, Reminder, SNOOZE_OPTIONS } from '@/lib/reminders';
import { Badge, Btn, Field, Notice, Sheet, useUi } from '@/components/ui';
import { DateField } from '@/components/fields';
import { confirm, notify, notifyError } from '@/components/toast';
import { space, useTheme } from '@/theme';

/** Tek hatırlatma satırı: tamamla, ertele, düzenle, sil, ara. Hatırlatıcı listesi ve bağışçı kartı ortak kullanır. */
export function ReminderItem({ reminder: r, showDonor = true }: { reminder: Reminder; showDonor?: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const ui = useUi();
  const [busy, setBusy] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const mine = r.mine !== false;
  const due = isDue(r);
  const phone = r.phone || null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: REMINDERS_KEY });
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      notify(done);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  const complete = () => run(() => af(`/reminders/${r.id}/complete`, { method: 'POST' }),
    r.repeat !== 'none' ? 'Tamamlandı, sonraki tekrar oluşturuldu.' : 'Tamamlandı.');
  const reopen = () => run(() => af(`/reminders/${r.id}/reopen`, { method: 'POST' }), 'Yeniden açıldı.');
  const snooze = (at: Date) => {
    setSnoozeOpen(false);
    return run(() => af(`/reminders/${r.id}`, { method: 'PATCH', body: { remind_at: at.toISOString() } }), `Ertelendi · ${formatWhen(at.toISOString())}`);
  };
  const remove = async () => {
    if (!(await confirm('Hatırlatma silinsin mi?', r.content, 'Sil', true))) return;
    run(() => af(`/reminders/${r.id}`, { method: 'DELETE' }), 'Hatırlatma silindi.');
  };

  const action = (label: string, icon: React.ReactNode, onPress: () => void, color = colors.primaryDark) => (
    <Pressable onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, opacity: busy ? 0.5 : 1 }}>
      {icon}
      <Text style={{ color, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ padding: space.md, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
        <Text style={[ui.text, { flex: 1 }, r.completed_at ? { textDecorationLine: 'line-through', color: colors.muted } : null]}>{r.content}</Text>
        {r.completed_at ? <Badge label="Tamamlandı" tone="ok" /> : due ? <Badge label="Vakti geldi" tone="danger" /> : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
        <Text style={[ui.muted, due ? { color: colors.danger, fontWeight: '700' } : null]}>
          {r.completed_at ? `Bitti ${dateTime(r.completed_at)}` : formatWhen(r.remind_at)}
        </Text>
        {r.repeat !== 'none' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Repeat size={12} color={colors.muted} /><Text style={ui.muted}>{REPEAT_LABEL[r.repeat]}</Text>
          </View>
        ) : null}
        {!mine && r.author ? <Text style={ui.muted}>· {r.author}</Text> : null}
      </View>
      {showDonor && r.donor ? (
        <Pressable onPress={() => router.push({ pathname: '/bagisci/[id]', params: { id: r.donor!.id } })} accessibilityRole="link"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <User size={14} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: '600' }}>{r.donor.name}</Text>
        </Pressable>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.lg }}>
        {phone && isDialable(phone) ? action('Ara', <Phone size={14} color={colors.primaryDark} />, () => call(phone)) : null}
        {mine && !r.completed_at ? (
          <>
            {action('Tamamla', <Check size={14} color={colors.primaryDark} />, complete)}
            {action('Ertele', <AlarmClock size={14} color={colors.primaryDark} />, () => setSnoozeOpen(true))}
            {action('Düzenle', <Pencil size={14} color={colors.primaryDark} />, () => {
              remember('reminder', r.id, r);
              router.push({ pathname: '/hatirlatici/form', params: { id: r.id } } as unknown as Href);
            })}
          </>
        ) : null}
        {mine && r.completed_at ? action('Yeniden aç', <RotateCcw size={14} color={colors.primaryDark} />, reopen) : null}
        {mine ? action('Sil', <Trash2 size={14} color={colors.danger} />, remove, colors.danger) : null}
      </View>
      <SnoozeSheet visible={snoozeOpen} onClose={() => setSnoozeOpen(false)} content={r.content} onPick={snooze} />
    </View>
  );
}

function SnoozeSheet({ visible, onClose, content, onPick }: {
  visible: boolean; onClose: () => void; content: string; onPick: (at: Date) => void;
}) {
  const ui = useUi();
  const start = nextHour();
  const [day, setDay] = useState<string | null>(localDate(start));
  const [time, setTime] = useState(localTime(start));
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet visible={visible} onClose={onClose} title="Ertele">
      <Text style={ui.muted} numberOfLines={3}>{content}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {SNOOZE_OPTIONS.map((o) => (
          <Btn key={o.label} title={o.label} variant="outline" small style={{ flexGrow: 1, flexBasis: '45%' }} onPress={() => onPick(o.at())} />
        ))}
      </View>
      <Text style={ui.muted}>Başka bir zaman</Text>
      {error ? <Notice text={error} tone="danger" /> : null}
      <DateField label="Tarih" value={day} onChange={setDay} />
      <Field label="Saat" value={time} onChangeText={setTime} placeholder="SS:DD" keyboardType="numbers-and-punctuation" maxLength={5} />
      <Btn title="Ertele" onPress={() => {
        const at = combine(day, time);
        if (!at) return setError('Geçerli bir tarih ve saat yazın.');
        setError(null);
        onPick(at);
      }} />
    </Sheet>
  );
}
