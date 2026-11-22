import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { af } from '@/lib/api';
import { can } from '@/lib/access';
import { dateTime } from '@/lib/format';
import { SmsTemplate } from '@/components/SmsSheet';
import { Btn, Card, Field, Notice, Row, Screen, SectionTitle, Select, SwitchRow, useUi } from '@/components/ui';
import { confirm, notify } from '@/components/toast';
import { font, space, useTheme } from '@/theme';

type Options = {
  kinds: { key: string; label: string }[]; tags: string[]; cities: string[];
  campaigns: { id: string; title: string }[]; kurban_years: number[];
};
type Preview = {
  recipients: number; stats: Record<string, number>; parts_total: number; max_parts: number;
  sample: { name: string; phone: string; body: string; segments: { parts: number; length: number } } | null;
  send_at: string | null; moved_for_quiet_hours: boolean; label: string;
};

const MONTH_KINDS = ['active_donors', 'lapsed_donors'];

export default function BulkSms() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { access } = useAuth();
  const { colors } = useTheme();
  const ui = useUi();
  const options = useQuery({ queryKey: ['sms-audience-options'], queryFn: () => af<Options>('/sms/audience-options') });
  const templates = useQuery({ queryKey: ['sms-templates'], queryFn: () => af<SmsTemplate[]>('/sms/templates') });
  const account = useQuery({ queryKey: ['sms-account'], queryFn: () => af<{ provider: string; balance: number | null; sender: string | null; own_account: boolean }>('/sms/account') });

  const [kind, setKind] = useState('all_donors');
  const [months, setMonths] = useState('6');
  const [tag, setTag] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const [numbers, setNumbers] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [name, setName] = useState('');
  const [commercial, setCommercial] = useState(false);
  const [quiet, setQuiet] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audience = () => ({
    kind,
    months: MONTH_KINDS.includes(kind) ? Number(months) || 6 : undefined,
    tag: kind === 'tag' ? tag : undefined,
    city: kind === 'city' ? city : undefined,
    campaign_id: kind === 'campaign' ? campaign : undefined,
    year: kind === 'kurban' && year ? Number(year) : undefined,
    numbers: kind === 'numbers' ? numbers : undefined,
  });
  const payload = () => ({
    name: name.trim() || undefined, body: body.trim(), audience: audience(), commercial, template_id: templateId || undefined,
    quiet_hours: quiet,
  });

  const check = () => {
    if (body.trim().length < 2) return 'Mesaj metnini yazın.';
    if (kind === 'tag' && !tag) return 'Etiket seçin.';
    if (kind === 'city' && !city) return 'Şehir seçin.';
    if (kind === 'campaign' && !campaign) return 'Kampanya seçin.';
    if (kind === 'numbers' && numbers.replace(/\D/g, '').length < 10) return 'En az bir telefon numarası yazın.';
    return null;
  };

  const runPreview = async () => {
    const problem = check();
    if (problem) return setError(problem);
    setError(null);
    setBusy('preview');
    try {
      setPreview(await af<Preview>('/sms/batches/preview', { method: 'POST', body: payload() }));
    } catch (e: any) {
      setError(e.message);
      setPreview(null);
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!preview) return;
    if (!(await confirm(`${preview.recipients} kişiye SMS gönderilsin mi?`, `Toplam ${preview.parts_total} SMS kredisi kullanılır.`, 'Gönder'))) return;
    setBusy('send');
    try {
      await af('/sms/batches', { method: 'POST', body: payload() });
      queryClient.invalidateQueries({ queryKey: ['sms-batches'] });
      queryClient.invalidateQueries({ queryKey: ['sms-messages'] });
      notify('Toplu SMS kuyruğa alındı.');
      router.replace('/sms/gonderimler');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const o = options.data;
  const canSend = can(access, 'sms.bulk');
  const reset = () => setPreview(null);

  return (
    <Screen footer={canSend ? (
      <View style={{ gap: space.sm }}>
        {preview ? <Btn title={`${preview.recipients} kişiye gönder`} onPress={send} loading={busy === 'send'} disabled={!preview.recipients} /> : null}
        <Btn title="Önizle" variant={preview ? 'outline' : 'primary'} onPress={runPreview} loading={busy === 'preview'} />
      </View>
    ) : undefined}>
      <Stack.Screen options={{ title: 'Toplu SMS' }} />
      {!canSend ? <Notice tone="warn" text="Toplu SMS gönderme yetkiniz yok." /> : null}
      {account.data ? (
        <Text style={ui.muted}>
          Sağlayıcı: {account.data.provider}{account.data.sender ? ` · Başlık: ${account.data.sender}` : ''}{account.data.balance != null ? ` · Bakiye: ${account.data.balance}` : ''}
        </Text>
      ) : null}
      {error ? <Notice text={error} tone="danger" /> : null}

      <SectionTitle>Alıcılar</SectionTitle>
      <Card style={{ gap: space.md }}>
        <Select label="Hedef kitle" value={kind} options={(o?.kinds || []).map((k) => ({ value: k.key, label: k.label }))} onChange={(v) => { setKind(v || 'all_donors'); reset(); }} />
        {MONTH_KINDS.includes(kind) ? <Field label="Ay sayısı" value={months} onChangeText={(v) => { setMonths(v); reset(); }} keyboardType="number-pad" /> : null}
        {kind === 'tag' ? <Select label="Etiket" value={tag} options={(o?.tags || []).map((t) => ({ value: t, label: t }))} onChange={(v) => { setTag(v); reset(); }} searchable /> : null}
        {kind === 'city' ? <Select label="Şehir" value={city} options={(o?.cities || []).map((c) => ({ value: c, label: c }))} onChange={(v) => { setCity(v); reset(); }} searchable /> : null}
        {kind === 'campaign' ? <Select label="Kampanya" value={campaign} options={(o?.campaigns || []).map((c) => ({ value: c.id, label: c.title }))} onChange={(v) => { setCampaign(v); reset(); }} searchable /> : null}
        {kind === 'kurban' ? <Select label="Yıl" value={year} allowClear options={(o?.kurban_years || []).map((y) => ({ value: String(y), label: String(y) }))} onChange={(v) => { setYear(v); reset(); }} /> : null}
        {kind === 'numbers' ? <Field label="Telefon numaraları" value={numbers} onChangeText={(v) => { setNumbers(v); reset(); }} multiline hint="Her satıra bir numara ya da virgülle ayırın." /> : null}
        <SwitchRow label="Tanıtım / kampanya duyurusu" hint="Açıksa yalnızca SMS izni olanlara gider (İYS)." value={commercial} onValueChange={(v) => { setCommercial(v); reset(); }} />
      </Card>

      <SectionTitle>Mesaj</SectionTitle>
      <Card style={{ gap: space.md }}>
        <Select label="Şablon" value={templateId} allowClear placeholder="Şablonsuz"
          options={(templates.data || []).filter((t) => t.is_active).map((t) => ({ value: t.id, label: t.name }))}
          onChange={(id) => { setTemplateId(id); const t = templates.data?.find((x) => x.id === id); if (t) setBody(t.body); reset(); }} />
        <Field label="Metin" value={body} onChangeText={(v) => { setBody(v); reset(); }} multiline maxLength={1500}
          hint="Değişkenler: {ad_soyad}, {ad}, {kurum} …" />
        <Field label="Gönderim adı (isteğe bağlı)" value={name} onChangeText={setName} maxLength={120} />
        <SwitchRow label="Gece gönderme" hint="22:00–08:00 arası sıraya alınır, sabah gönderilir." value={quiet} onValueChange={(v) => { setQuiet(v); reset(); }} />
      </Card>

      {preview ? (
        <>
          <SectionTitle>Önizleme</SectionTitle>
          <Card>
            <Row label="Alıcı" value={`${preview.recipients} kişi`} />
            <Row label="SMS kredisi" value={`${preview.parts_total} (mesaj başına en çok ${preview.max_parts})`} />
            {preview.stats.no_consent ? <Row label="İzinsiz (atlanır)" value={String(preview.stats.no_consent)} /> : null}
            {preview.stats.no_phone ? <Row label="Telefonsuz" value={String(preview.stats.no_phone)} /> : null}
            {preview.moved_for_quiet_hours && preview.send_at ? <Row label="Gönderim zamanı" value={dateTime(preview.send_at)} /> : null}
            {preview.sample ? (
              <View style={{ backgroundColor: colors.primarySoft, borderRadius: 12, padding: space.md, marginTop: space.sm }}>
                <Text style={[ui.muted, { fontSize: font.xs }]}>{preview.sample.name} için örnek</Text>
                <Text style={ui.text}>{preview.sample.body}</Text>
              </View>
            ) : null}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
