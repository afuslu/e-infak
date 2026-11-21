import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { af } from '@/lib/api';
import { Badge, Btn, Card, Chips, Field, Notice, QueryView, Screen, SectionTitle, Select, Sheet, ui } from '@/components/ui';
import { confirm, notify, notifyError } from '@/components/toast';
import { colors, font, space } from '@/theme';

type ProviderField = { key: string; label: string; secret: boolean; optional: boolean; choices: Record<string, string> | string[] | null };
type Provider = { key: string; label: string; note: string | null; fields: ProviderField[]; values: Record<string, string | null>; configured: boolean };
type Accounts = {
  encryption_ready: boolean; live_payments_enabled: boolean; payment_provider: string; sms_provider: string;
  payment_providers: Provider[]; sms_providers: Provider[];
};

function choiceOptions(choices: ProviderField['choices']) {
  if (!choices) return [];
  if (Array.isArray(choices)) return choices.map((c) => ({ value: c, label: c }));
  return Object.entries(choices).map(([value, label]) => ({ value, label: String(label) }));
}

export default function Providers() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['provider-accounts'], queryFn: () => af<Accounts>('/provider-accounts') });
  const [kind, setKind] = useState<'payment' | 'sms'>('payment');
  const [editing, setEditing] = useState<Provider | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState('');

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['provider-accounts'] });

  const open = (p: Provider) => {
    // Gizli alanlar boş açılır; boş bırakılırsa backend kayıtlı değeri korur.
    const initial: Record<string, string> = {};
    for (const f of p.fields) initial[f.key] = f.secret ? '' : p.values[f.key] || '';
    setValues(initial);
    setEditing(p);
  };

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    try {
      await action();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <Stack.Screen options={{ title: 'Ödeme ve SMS sağlayıcıları' }} />
      <QueryView query={query}>
        {(data) => {
          const list = kind === 'payment' ? data.payment_providers : data.sms_providers;
          const active = kind === 'payment' ? data.payment_provider : data.sms_provider;
          return (
            <>
              {!data.encryption_ready ? <Notice tone="danger" text="Sunucuda şifreleme anahtarı tanımlı değil; sağlayıcı bilgileri kaydedilemez." /> : null}
              {kind === 'payment' && !data.live_payments_enabled ? <Notice tone="warn" text="Canlı ödemeler platformda henüz açık değil; sağlayıcılar test modunda çalışır." /> : null}
              <Chips options={[{ value: 'payment', label: 'Sanal POS' }, { value: 'sms', label: 'SMS' }]} value={kind} onChange={(v) => setKind(v as any)} />
              {list.map((p) => (
                <Card key={p.key}>
                  <View style={[ui.rowGap, { justifyContent: 'space-between' }]}>
                    <Text style={{ fontSize: font.lg, fontWeight: '700', color: colors.text }}>{p.label}</Text>
                    <View style={ui.rowGap}>
                      {p.key === active ? <Badge label="Etkin" tone="ok" /> : null}
                      <Badge label={p.configured ? 'Bilgiler girili' : 'Ayarlanmadı'} tone={p.configured ? 'info' : 'muted'} />
                    </View>
                  </View>
                  {p.note ? <Text style={ui.muted}>{p.note}</Text> : null}
                  <View style={ui.wrapGap}>
                    <Btn title="Bilgileri düzenle" small variant="outline" onPress={() => open(p)} />
                    {p.key !== active && p.configured ? (
                      <Btn title="Etkin yap" small loading={busy === `sel-${p.key}`} onPress={() => run(`sel-${p.key}`, async () => {
                        await af('/provider-accounts/selection', { method: 'POST', body: kind === 'payment' ? { payment_provider: p.key } : { sms_provider: p.key } });
                        await refresh();
                        notify(`${p.label} etkin sağlayıcı yapıldı.`);
                      })} />
                    ) : null}
                    {p.configured ? (
                      <Btn title="Bilgileri sil" small variant="danger" loading={busy === `del-${p.key}`} onPress={async () => {
                        if (!(await confirm(`${p.label} bilgileri silinsin mi?`, undefined, 'Sil', true))) return;
                        run(`del-${p.key}`, async () => {
                          await af(`/provider-accounts/${p.key}`, { method: 'DELETE' });
                          await refresh();
                          notify('Sağlayıcı bilgileri silindi.');
                        });
                      }} />
                    ) : null}
                  </View>
                </Card>
              ))}
              {kind === 'sms' ? (
                <>
                  <SectionTitle>Test SMS'i</SectionTitle>
                  <Card>
                    <Field label="Telefon" value={testPhone} onChangeText={setTestPhone} keyboardType="phone-pad" placeholder="05xx xxx xx xx"
                      hint="Etkin SMS sağlayıcısıyla bu numaraya deneme mesajı gönderilir." />
                    <Btn title="Test SMS'i gönder" small variant="outline" loading={busy === 'test'} disabled={testPhone.replace(/\D/g, '').length < 10}
                      onPress={() => run('test', async () => {
                        const result = await af<{ provider: string }>('/provider-accounts/sms-test', { method: 'POST', body: { phone: testPhone } });
                        notify(`Test SMS'i ${result?.provider || 'sağlayıcı'} ile gönderildi.`);
                      })} />
                  </Card>
                </>
              ) : null}
            </>
          );
        }}
      </QueryView>

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing?.label || ''}
        footer={(
          <Btn title="Kaydet" loading={busy === 'save'} onPress={() => run('save', async () => {
            if (!editing) return;
            for (const f of editing.fields) {
              const has = values[f.key]?.trim() || (f.secret && editing.values[f.key]);
              if (!f.optional && !has) throw new Error(`${f.label} alanı zorunlu.`);
            }
            await af(`/provider-accounts/${editing.key}`, { method: 'PUT', body: { values } });
            await refresh();
            setEditing(null);
            notify('Sağlayıcı bilgileri kaydedildi.');
          })} />
        )}>
        {editing?.fields.map((f) => {
          const options = choiceOptions(f.choices);
          if (options.length) {
            return <Select key={f.key} label={f.label} value={values[f.key] || null} options={options} onChange={(v) => setValues({ ...values, [f.key]: v || '' })} />;
          }
          return (
            <Field key={f.key} label={`${f.label}${f.optional ? ' (isteğe bağlı)' : ''}`} value={values[f.key] || ''}
              onChangeText={(v) => setValues({ ...values, [f.key]: v })} secureTextEntry={f.secret} autoCapitalize="none" autoCorrect={false}
              placeholder={f.secret && editing.values[f.key] ? `Kayıtlı (${editing.values[f.key]})` : undefined}
              hint={f.secret && editing.values[f.key] ? 'Değiştirmek istemiyorsanız boş bırakın.' : undefined} />
          );
        })}
        <Text style={[ui.muted, { marginTop: space.sm }]}>Gizli bilgiler sunucuda şifrelenerek saklanır ve bir daha gösterilmez.</Text>
      </Sheet>
    </Screen>
  );
}
