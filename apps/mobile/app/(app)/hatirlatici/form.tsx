import React, { useState } from 'react';
import { Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { af } from '@/lib/api';
import { recall } from '@/lib/selected';
import {
  combine, formatWhen, inMinutes, localDate, localTime, nextHour, REMINDERS_KEY, REPEAT_OPTIONS, Reminder, RepeatKind, tomorrowAt,
} from '@/lib/reminders';
import { Btn, Card, Chips, Field, Notice, Row, Screen, useUi } from '@/components/ui';
import { DateField } from '@/components/fields';
import { notify } from '@/components/toast';
import { space } from '@/theme';

const QUICK = [
  { value: '1h', label: '1 saat sonra', at: () => inMinutes(60) },
  { value: 'evening', label: 'Bu akşam 18:00', at: () => { const d = new Date(); d.setHours(18, 0, 0, 0); return d; } },
  { value: 'tomorrow', label: 'Yarın 10:00', at: () => tomorrowAt(10) },
  { value: 'week', label: '1 hafta sonra', at: () => { const d = tomorrowAt(10); d.setDate(d.getDate() + 6); return d; } },
];

export default function ReminderForm() {
  const { id, donorId, donorName } = useLocalSearchParams<{ id?: string; donorId?: string; donorName?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const ui = useUi();
  const existing = id ? recall<Reminder>('reminder', id) : undefined;
  const start = existing ? new Date(existing.remind_at) : nextHour();

  const [content, setContent] = useState(existing?.content || '');
  const [day, setDay] = useState<string | null>(localDate(start));
  const [time, setTime] = useState(localTime(start));
  const [repeat, setRepeat] = useState<RepeatKind>(existing?.repeat || 'none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linkedDonor = existing?.donor?.name || donorName || null;

  const pick = (at: Date) => {
    setDay(localDate(at));
    setTime(localTime(at));
  };

  const save = async () => {
    setError(null);
    if (!content.trim()) return setError('Hatırlatma metnini yazın.');
    const at = combine(day, time);
    if (!at) return setError('Geçerli bir tarih (GG.AA.YYYY) ve saat (SS:DD) yazın.');
    setBusy(true);
    try {
      const body: Record<string, unknown> = { content: content.trim(), repeat };
      // Düzenlemede saat değişmediyse gönderilmez: yeni saat bildirimi baştan kurar.
      if (!existing || at.getTime() !== new Date(existing.remind_at).getTime()) body.remind_at = at.toISOString();
      // Metin değişince sunucu bağışçıyı metindeki numaradan yeniden bulur; bağlı bağışçı korunsun.
      const keepDonor = id ? existing?.donor?.id : donorId;
      if (keepDonor) body.donor_id = keepDonor;
      await af<Reminder>(id ? `/reminders/${id}` : '/reminders', { method: id ? 'PATCH' : 'POST', body });
      await queryClient.invalidateQueries({ queryKey: REMINDERS_KEY });
      notify(`${id ? 'Hatırlatma güncellendi' : 'Hatırlatma eklendi'} · ${formatWhen(at.toISOString())}`);
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Btn title={id ? 'Kaydet' : 'Hatırlatma ekle'} onPress={save} loading={busy} />}>
      <Stack.Screen options={{ title: id ? 'Hatırlatmayı düzenle' : 'Yeni hatırlatma' }} />
      {error ? <Notice text={error} tone="danger" /> : null}
      {linkedDonor ? <Card><Row label="Bağışçı" value={linkedDonor} /></Card> : null}
      <Card style={{ gap: space.md }}>
        <Field label="Ne hatırlatılsın?" value={content} onChangeText={setContent} multiline maxLength={2000} autoFocus={!id}
          placeholder="Örn. Ahmet Bey'i ara, kurban hissesini sor 0532 000 00 00"
          hint={linkedDonor ? undefined : 'Metne telefon numarası yazarsanız o numaralı bağışçıya bağlanır.'} />
        <Text style={ui.muted}>Hızlı seçim</Text>
        <Chips options={QUICK.map(({ value, label }) => ({ value, label }))} value={null} onChange={(v) => pick(QUICK.find((x) => x.value === v)!.at())} wrap />
        <DateField label="Tarih" value={day} onChange={setDay} />
        <Field label="Saat" value={time} onChangeText={setTime} placeholder="SS:DD" keyboardType="numbers-and-punctuation" maxLength={5} />
        <Text style={ui.muted}>Tekrar</Text>
        <Chips options={REPEAT_OPTIONS} value={repeat} onChange={setRepeat} wrap />
      </Card>
    </Screen>
  );
}
