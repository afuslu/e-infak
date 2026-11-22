import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { pf } from '@/lib/api';
import { openPlatformPdf } from '@/lib/files';
import { dateTime, money, openUrl } from '@/lib/format';
import { Badge, Btn, Card, Chips, Field, ListItem, Notice, QueryView, Row, Screen, SectionTitle, SwitchRow, useUi } from '@/components/ui';
import { confirm, notify, notifyError } from '@/components/toast';
import { space } from '@/theme';

type OrgDomain = { id: string; domain: string; status: string; is_primary?: boolean; last_check_error?: string | null };
type ProviderAcc = {
  key: string;
  provider?: string;
  label?: string;
  kind: 'payment' | 'sms';
  configured: boolean;
  values?: Record<string, string>;
  fields?: { key: string; label: string; secret?: boolean }[];
};

type OrgDetail = {
  id: string;
  name: string;
  legal_name: string | null;
  slug: string;
  email: string;
  phone: string | null;
  city: string | null;
  plan: string;
  plan_label: string;
  enabled_addons: string[];
  extra_user_seats: number;
  user_limit: number;
  subscription_status: string;
  billing_cycle: string;
  subscription_ends_at: string | null;
  monthly_fee_cents: number;
  platform_notes: string | null;
  is_active: boolean;
  url: string;
  domains: OrgDomain[];
  users: { id: string; email: string; name: string; role: string | null; role_label: string | null; is_active: boolean; last_login_at: string | null }[];
  provider_accounts: ProviderAcc[];
};

type Payment = {
  id: string;
  amount_cents: number;
  currency: string;
  period_label?: string;
  payment_method?: string | null;
  status: string;
  paid_at: string | null;
  created_at: string;
};

type Catalog = {
  plans: { key: string; label: string; addons: string[] }[];
  features: Record<string, string>;
  roles: { key: string; label: string }[];
};

type Tab = 'genel' | 'kullanicilar' | 'alanlar' | 'saglayicilar' | 'odemeler';

export default function PlatformOrgDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { enterOrgSimulation } = useAuth();
  const queryClient = useQueryClient();
  const ui = useUi();
  const [tab, setTab] = useState<Tab>('genel');
  const [simulating, setSimulating] = useState(false);

  // Abonelik & Notlar
  const [subStatus, setSubStatus] = useState('active');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [feeTry, setFeeTry] = useState('0');
  const [endsAt, setEndsAt] = useState('');
  const [extraSeats, setExtraSeats] = useState('0');
  const [notes, setNotes] = useState('');
  const [confirmDeleteName, setConfirmDeleteName] = useState('');

  // Yeni kullanıcı
  const [uFirst, setUFirst] = useState('');
  const [uLast, setULast] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uRole, setURole] = useState('stk_admin');
  const [uTempPw, setUTempPw] = useState<string | null>(null);

  // Domain
  const [newDomain, setNewDomain] = useState('');

  // Test SMS & Sağlayıcı
  const [testPhone, setTestPhone] = useState('');
  const [editingProvider, setEditingProvider] = useState<ProviderAcc | null>(null);
  const [provValues, setProvValues] = useState<Record<string, string>>({});

  // Ödeme ekle
  const [payTry, setPayTry] = useState('');
  const [payPeriod, setPayPeriod] = useState('');
  const [payMethod, setPayMethod] = useState<'havale' | 'kart' | 'nakit'>('havale');
  const [payExtendDays, setPayExtendDays] = useState('30');

  const org = useQuery({
    queryKey: ['platform', 'organization', id],
    queryFn: () => pf<OrgDetail>(`/organizations/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (!org.data) return;
    setSubStatus(org.data.subscription_status || 'active');
    setBillingCycle(org.data.billing_cycle || 'monthly');
    setFeeTry(String(Math.round((org.data.monthly_fee_cents || 0) / 100)));
    setEndsAt(org.data.subscription_ends_at ? org.data.subscription_ends_at.slice(0, 10) : '');
    setExtraSeats(String(org.data.extra_user_seats || 0));
    setNotes(org.data.platform_notes || '');
  }, [org.data]);

  const catalog = useQuery({
    queryKey: ['platform', 'catalog'],
    queryFn: () => pf<Catalog>('/catalog'),
  });

  const payments = useQuery({
    queryKey: ['platform', 'organization', id, 'payments'],
    queryFn: () => pf<Payment[]>(`/organizations/${id}/payments`),
    enabled: !!id && tab === 'odemeler',
  });

  const refreshOrg = () => {
    queryClient.invalidateQueries({ queryKey: ['platform', 'organization', id] });
    queryClient.invalidateQueries({ queryKey: ['platform', 'organizations'] });
  };

  const patchOrg = useMutation({
    mutationFn: (body: Record<string, unknown>) => pf(`/organizations/${id}`, { method: 'PATCH', body }),
    onSuccess: () => { refreshOrg(); notify('Kurum güncellendi.'); },
    onError: notifyError,
  });

  const patchSub = useMutation({
    mutationFn: () =>
      pf(`/organizations/${id}/subscription`, {
        method: 'PATCH',
        body: {
          subscription_status: subStatus,
          billing_cycle: billingCycle,
          monthly_fee_cents: Math.max(0, Math.round(Number(feeTry.replace(',', '.')) * 100) || 0),
          subscription_ends_at: endsAt.trim() ? `${endsAt.trim()}T23:59:59Z` : null,
        },
      }),
    onSuccess: () => { refreshOrg(); notify('Abonelik güncellendi.'); },
    onError: notifyError,
  });

  const sendRenewal = useMutation({
    mutationFn: () => pf(`/organizations/${id}/send-renewal-reminder`, { method: 'POST' }),
    onSuccess: () => notify('Yenileme hatırlatması gönderildi.'),
    onError: notifyError,
  });

  const createUser = useMutation({
    mutationFn: () =>
      pf<{ temporary_password?: string }>(`/organizations/${id}/users`, {
        method: 'POST',
        body: {
          email: uEmail.trim(),
          first_name: uFirst.trim(),
          last_name: uLast.trim(),
          role: uRole,
          password_mode: 'temp',
          send_email: false,
        },
      }),
    onSuccess: (res) => {
      setUFirst(''); setULast(''); setUEmail('');
      setUTempPw(res.temporary_password || null);
      refreshOrg();
      notify('Kullanıcı eklendi.');
    },
    onError: notifyError,
  });

  const toggleUserActive = async (u: OrgDetail['users'][number]) => {
    try {
      await pf(`/organizations/${id}/users/${u.id}`, { method: 'PATCH', body: { is_active: !u.is_active } });
      refreshOrg();
      notify('Kullanıcı güncellendi.');
    } catch (e) { notifyError(e); }
  };

  const resetUserPassword = async (userId: string, name: string) => {
    if (!(await confirm(`${name} kullanıcısının şifresi sıfırlansın mı?`))) return;
    try {
      const res = await pf<{ temporary_password?: string }>(`/organizations/${id}/users/${userId}/reset-password`, { method: 'POST' });
      setUTempPw(res.temporary_password || null);
      notify(res.temporary_password ? `Geçici şifre: ${res.temporary_password}` : 'Şifre sıfırlandı.');
    } catch (e) { notifyError(e); }
  };

  const addDomain = useMutation({
    mutationFn: () => pf(`/organizations/${id}/domains`, { method: 'POST', body: { domain: newDomain.trim() } }),
    onSuccess: () => { setNewDomain(''); refreshOrg(); notify('Alan adı eklendi.'); },
    onError: notifyError,
  });

  const domainAction = async (domainId: string, action: 'verify' | 'activate' | 'delete') => {
    try {
      if (action === 'delete') {
        if (!(await confirm('Alan adı silinsin mi?', undefined, 'Sil', true))) return;
        await pf(`/organizations/${id}/domains/${domainId}`, { method: 'DELETE' });
      } else {
        await pf(`/organizations/${id}/domains/${domainId}/${action}`, { method: 'POST' });
      }
      refreshOrg();
      notify('Alan adı işlemi tamamlandı.');
    } catch (e) { notifyError(e); }
  };

  const saveProvider = useMutation({
    mutationFn: () => {
      const providerKey = editingProvider!.key || editingProvider!.provider;
      return pf(`/organizations/${id}/provider-accounts/${providerKey}`, {
        method: 'PUT',
        body: { values: provValues },
      });
    },
    onSuccess: () => { setEditingProvider(null); setProvValues({}); refreshOrg(); notify('Sağlayıcı kaydedildi.'); },
    onError: notifyError,
  });

  const sendTestSms = useMutation({
    mutationFn: () => pf(`/organizations/${id}/test-sms`, { method: 'POST', body: { phone: testPhone.trim() } }),
    onSuccess: () => { setTestPhone(''); notify('Test SMS gönderildi.'); },
    onError: notifyError,
  });

  const addPayment = useMutation({
    mutationFn: () =>
      pf(`/organizations/${id}/payments`, {
        method: 'POST',
        body: {
          amount_cents: Math.round(Number(payTry.replace(',', '.')) * 100),
          period_label: payPeriod.trim(),
          payment_method: payMethod,
          extend_days: Number(payExtendDays) || 0,
        },
      }),
    onSuccess: () => {
      setPayTry(''); setPayPeriod('');
      queryClient.invalidateQueries({ queryKey: ['platform', 'organization', id, 'payments'] });
      refreshOrg();
      notify('Ödeme kaydedildi.');
    },
    onError: notifyError,
  });

  const deletePayment = async (pid: string) => {
    if (!(await confirm('Ödeme kaydı silinsin mi?', undefined, 'Sil', true))) return;
    try {
      await pf(`/organizations/${id}/payments/${pid}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['platform', 'organization', id, 'payments'] });
      notify('Ödeme silindi.');
    } catch (e) { notifyError(e); }
  };

  const deleteOrg = async (orgName: string) => {
    if (confirmDeleteName.trim() !== orgName.trim()) {
      return notify('Onay için kurum adını birebir aynı yazın.', 'error');
    }
    if (!(await confirm(`"${orgName}" kalıcı olarak silinecek!`, 'Bu işlem geri alınamaz.', 'Kalıcı Sil', true))) return;
    try {
      await pf(`/organizations/${id}`, { method: 'DELETE', body: { confirm_name: confirmDeleteName.trim() } });
      queryClient.invalidateQueries({ queryKey: ['platform', 'organizations'] });
      queryClient.invalidateQueries({ queryKey: ['platform', 'metrics'] });
      notify('Kurum kalıcı olarak silindi.');
      router.back();
    } catch (e) { notifyError(e); }
  };

  const handleSimulate = async () => {
    if (!id) return;
    setSimulating(true);
    try {
      await enterOrgSimulation(id);
    } catch (e) {
      notifyError(e);
      setSimulating(false);
    }
  };

  return (
    <Screen onRefresh={() => { org.refetch(); payments.refetch(); }} refreshing={org.isRefetching}>
      <Stack.Screen options={{ title: org.data?.name || 'Kurum Detayı' }} />
      <QueryView query={org}>
        {(o) => {
          const planAddons = catalog.data?.plans.find((p) => p.key === o.plan)?.addons || [];
          return (
            <>
              <Card style={{ gap: space.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={ui.title}>{o.name}</Text>
                    <Text style={ui.muted}>{o.url}</Text>
                  </View>
                  <Badge label={o.is_active ? 'Aktif' : 'Askıda'} tone={o.is_active ? 'ok' : 'danger'} />
                </View>
                <View style={ui.rowGap}>
                  <Btn title="Kuruma Gir (Simüle)" style={{ flex: 1 }} disabled={!o.is_active} loading={simulating} onPress={handleSimulate} />
                  <Btn title="Özet PDF" variant="outline" onPress={() => openPlatformPdf(`/organizations/${o.id}/summary.pdf`, `${o.slug}-ozet.pdf`).catch(notifyError)} />
                  <Btn title="Site" variant="outline" onPress={() => openUrl(o.url)} />
                </View>
              </Card>

              <Chips<Tab>
                options={[
                  { value: 'genel', label: 'Genel & Abonelik' },
                  { value: 'kullanicilar', label: `Kullanıcılar (${o.users.length})` },
                  { value: 'alanlar', label: `Alan Adları (${o.domains.length})` },
                  { value: 'saglayicilar', label: 'Sağlayıcılar' },
                  { value: 'odemeler', label: 'Ödemeler' },
                ]}
                value={tab}
                onChange={setTab}
              />

              {tab === 'genel' ? (
                <>
                  <SectionTitle>Kurum Bilgileri</SectionTitle>
                  <Card>
                    <Row label="E-posta" value={o.email} />
                    <Row label="Telefon" value={o.phone} />
                    <Row label="Şehir" value={o.city} />
                    <Row label="Paket" value={o.plan_label || o.plan} />
                    <Row label="Kullanıcı Limiti" value={`${o.users.length} / ${o.user_limit}`} />
                  </Card>

                  <SectionTitle>Paket & Ek Modüller</SectionTitle>
                  <Card style={{ gap: space.md }}>
                    <SwitchRow label="Kurum aktif" value={o.is_active} disabled={patchOrg.isPending} onValueChange={(is_active) => patchOrg.mutate({ is_active })} />
                    {catalog.data?.plans?.length ? (
                      <Chips
                        options={catalog.data.plans.map((p) => ({ value: p.key, label: p.label }))}
                        value={o.plan}
                        onChange={(plan) => { if (plan !== o.plan) patchOrg.mutate({ plan }); }}
                      />
                    ) : null}
                    {planAddons.map((addon) => {
                      const on = (o.enabled_addons || []).includes(addon);
                      return (
                        <SwitchRow
                          key={addon}
                          label={catalog.data?.features?.[addon] || addon}
                          value={on}
                          onValueChange={(next) => {
                            const list = next
                              ? [...new Set([...(o.enabled_addons || []), addon])]
                              : (o.enabled_addons || []).filter((a) => a !== addon);
                            patchOrg.mutate({ enabled_addons: list });
                          }}
                        />
                      );
                    })}
                    <Field label="Ek Kullanıcı Koltuğu" value={extraSeats} onChangeText={setExtraSeats} keyboardType="number-pad" />
                    <Field label="Platform Notları" value={notes} onChangeText={setNotes} multiline placeholder="İç notlar..." />
                    <Btn
                      title="Koltuk & Notları Kaydet"
                      variant="outline"
                      small
                      loading={patchOrg.isPending}
                      onPress={() => patchOrg.mutate({ extra_user_seats: Number(extraSeats) || 0, platform_notes: notes })}
                    />
                  </Card>

                  <SectionTitle>Abonelik</SectionTitle>
                  <Card style={{ gap: space.sm }}>
                    <Chips
                      options={[
                        { value: 'active', label: 'Aktif' },
                        { value: 'trial', label: 'Deneme' },
                        { value: 'past_due', label: 'Gecikmiş' },
                        { value: 'suspended', label: 'Askıda' },
                      ]}
                      value={subStatus}
                      onChange={setSubStatus}
                    />
                    <Chips
                      options={[
                        { value: 'monthly', label: 'Aylık' },
                        { value: 'yearly', label: 'Yıllık' },
                      ]}
                      value={billingCycle}
                      onChange={setBillingCycle}
                    />
                    <Field label="Aylık Ücret (TRY)" value={feeTry} onChangeText={setFeeTry} keyboardType="numeric" />
                    <Field label="Bitiş Tarihi (YYYY-AA-GG)" value={endsAt} onChangeText={setEndsAt} placeholder="2026-12-31" />
                    <View style={ui.rowGap}>
                      <Btn title="Aboneliği Kaydet" style={{ flex: 1 }} loading={patchSub.isPending} onPress={() => patchSub.mutate()} />
                      <Btn title="Hatırlatma" variant="outline" loading={sendRenewal.isPending} onPress={() => sendRenewal.mutate()} />
                    </View>
                  </Card>

                  <SectionTitle>Tehlikeli Bölge</SectionTitle>
                  <Card style={{ gap: space.sm }}>
                    <Field label={`Kalıcı silmek için "${o.name}" yazın`} value={confirmDeleteName} onChangeText={setConfirmDeleteName} placeholder={o.name} />
                    <Btn title="Kurumu Kalıcı Sil" variant="danger" onPress={() => deleteOrg(o.name)} />
                  </Card>
                </>
              ) : null}

              {tab === 'kullanicilar' ? (
                <>
                  {uTempPw ? (
                    <Card style={{ gap: 4 }}>
                      <Text style={ui.title}>Geçici Şifre</Text>
                      <Text style={ui.text} selectable>{uTempPw}</Text>
                    </Card>
                  ) : null}
                  <SectionTitle>Yeni Kullanıcı Ekle</SectionTitle>
                  <Card style={{ gap: space.sm }}>
                    <Field label="Ad" value={uFirst} onChangeText={setUFirst} />
                    <Field label="Soyad" value={uLast} onChangeText={setULast} />
                    <Field label="E-posta" value={uEmail} onChangeText={setUEmail} autoCapitalize="none" keyboardType="email-address" />
                    <Chips
                      options={(catalog.data?.roles || [{ key: 'stk_admin', label: 'Dernek Yöneticisi' }, { key: 'muhasebe', label: 'Muhasebe' }, { key: 'readonly', label: 'Görüntüleme' }]).map((r) => ({ value: r.key, label: r.label }))}
                      value={uRole}
                      onChange={setURole}
                    />
                    <Btn title="Kullanıcı Ekle" disabled={!uFirst.trim() || !uEmail.trim()} loading={createUser.isPending} onPress={() => createUser.mutate()} />
                  </Card>

                  <SectionTitle>Kullanıcılar</SectionTitle>
                  <View style={{ gap: space.sm }}>
                    {o.users.map((u) => (
                      <Card key={u.id} style={{ gap: space.xs }}>
                        <ListItem
                          title={u.name || u.email}
                          subtitle={`${u.email} · ${u.role_label || u.role || 'Yetkili'}`}
                          meta={u.last_login_at ? `Son giriş: ${dateTime(u.last_login_at)}` : 'Henüz giriş yok'}
                          right={<Badge label={u.is_active ? 'Aktif' : 'Pasif'} tone={u.is_active ? 'ok' : 'danger'} />}
                        />
                        <View style={ui.rowGap}>
                          <Btn title={u.is_active ? 'Pasifleştir' : 'Aktifleştir'} variant="outline" small style={{ flex: 1 }} onPress={() => toggleUserActive(u)} />
                          <Btn title="Şifre Sıfırla" variant="ghost" small onPress={() => resetUserPassword(u.id, u.name || u.email)} />
                        </View>
                      </Card>
                    ))}
                  </View>
                </>
              ) : null}

              {tab === 'alanlar' ? (
                <>
                  <SectionTitle>Özel Alan Adı Ekle</SectionTitle>
                  <Card style={{ gap: space.sm }}>
                    <Field label="Alan Adı" value={newDomain} onChangeText={setNewDomain} autoCapitalize="none" placeholder="bagis.kurum.org" />
                    <Btn title="Alan Adı Ekle" disabled={!newDomain.trim()} loading={addDomain.isPending} onPress={() => addDomain.mutate()} />
                  </Card>
                  <SectionTitle>Kayıtlı Alan Adları</SectionTitle>
                  <View style={{ gap: space.sm }}>
                    {o.domains.map((d) => (
                      <Card key={d.id} style={{ gap: space.xs }}>
                        <ListItem
                          title={d.domain}
                          subtitle={d.last_check_error || (d.is_primary ? 'Ana alan adı' : undefined)}
                          right={<Badge label={d.status === 'active' ? 'Aktif' : 'Bekliyor'} tone={d.status === 'active' ? 'ok' : 'warn'} />}
                        />
                        <View style={ui.rowGap}>
                          <Btn title="Doğrula" variant="outline" small style={{ flex: 1 }} onPress={() => domainAction(d.id, 'verify')} />
                          {d.status !== 'active' ? (
                            <Btn title="Aktif Et" variant="outline" small style={{ flex: 1 }} onPress={() => domainAction(d.id, 'activate')} />
                          ) : null}
                          <Btn title="Sil" variant="danger" small onPress={() => domainAction(d.id, 'delete')} />
                        </View>
                      </Card>
                    ))}
                  </View>
                </>
              ) : null}

              {tab === 'saglayicilar' ? (
                <>
                  <SectionTitle>Test SMS Gönder</SectionTitle>
                  <Card style={{ gap: space.sm }}>
                    <Field label="Telefon Numarası" value={testPhone} onChangeText={setTestPhone} keyboardType="phone-pad" placeholder="05xx xxx xx xx" />
                    <Btn title="Test SMS Gönder" disabled={testPhone.trim().length < 10} loading={sendTestSms.isPending} onPress={() => sendTestSms.mutate()} />
                  </Card>

                  {editingProvider ? (
                    <>
                      <SectionTitle>{editingProvider.label || editingProvider.key || editingProvider.provider} Düzenle</SectionTitle>
                      <Card style={{ gap: space.sm }}>
                        {(editingProvider.fields || []).map((f) => (
                          <Field
                            key={f.key}
                            label={f.label}
                            value={provValues[f.key] || ''}
                            onChangeText={(v) => setProvValues((p) => ({ ...p, [f.key]: v }))}
                            secureTextEntry={!!f.secret}
                            autoCapitalize="none"
                          />
                        ))}
                        {!editingProvider.fields?.length ? <Notice text="Bu sağlayıcı için alan tanımı bulunamadı." tone="info" /> : null}
                        <View style={ui.rowGap}>
                          <Btn title="Kaydet" style={{ flex: 1 }} loading={saveProvider.isPending} onPress={() => saveProvider.mutate()} />
                          <Btn title="Vazgeç" variant="ghost" onPress={() => setEditingProvider(null)} />
                        </View>
                      </Card>
                    </>
                  ) : null}

                  <SectionTitle>Ödeme & SMS Sağlayıcıları</SectionTitle>
                  <View style={ui.listCard}>
                    {o.provider_accounts.map((p, idx) => {
                      const pKey = p.key || p.provider || String(idx);
                      return (
                        <View key={pKey}>
                          {idx > 0 ? <View style={ui.separator} /> : null}
                          <ListItem
                            title={p.label || pKey}
                            subtitle={p.kind === 'payment' ? 'Ödeme Sağlayıcı' : 'SMS Sağlayıcı'}
                            right={<Badge label={p.configured ? 'Kurulu' : 'Boş'} tone={p.configured ? 'ok' : 'muted'} />}
                            chevron
                            onPress={() => { setEditingProvider(p); setProvValues(p.values || {}); }}
                          />
                        </View>
                      );
                    })}
                  </View>
                </>
              ) : null}

              {tab === 'odemeler' ? (
                <>
                  <SectionTitle>Yeni Tahsilat Ekle</SectionTitle>
                  <Card style={{ gap: space.sm }}>
                    <Field label="Tutar (TRY)" value={payTry} onChangeText={setPayTry} keyboardType="numeric" placeholder="2500" />
                    <Field label="Dönem Etiketi" value={payPeriod} onChangeText={setPayPeriod} placeholder="Kasım 2026" />
                    <Chips
                      options={[
                        { value: 'havale', label: 'Havale' },
                        { value: 'kart', label: 'Kart' },
                        { value: 'nakit', label: 'Nakit' },
                      ]}
                      value={payMethod}
                      onChange={setPayMethod}
                    />
                    <Field label="Abonelik Uzatma (Gün)" value={payExtendDays} onChangeText={setPayExtendDays} keyboardType="number-pad" />
                    <Btn title="Tahsilatı Kaydet" disabled={!payTry.trim() || payPeriod.trim().length < 2} loading={addPayment.isPending} onPress={() => addPayment.mutate()} />
                  </Card>

                  <SectionTitle>Ödeme Geçmişi</SectionTitle>
                  <QueryView query={payments}>
                    {(rows) => (
                      <View style={{ gap: space.sm }}>
                        {rows.map((p) => (
                          <Card key={p.id} style={{ gap: space.xs }}>
                            <ListItem
                              title={money(p.amount_cents, p.currency || 'TRY')}
                              subtitle={`${p.period_label || ''} · ${p.payment_method || 'Ödeme'}`}
                              meta={dateTime(p.paid_at || p.created_at)}
                              right={<Badge label={p.status === 'paid' ? 'Ödendi' : p.status} tone={p.status === 'paid' ? 'ok' : 'warn'} />}
                            />
                            <View style={ui.rowGap}>
                              <Btn
                                title="Makbuz PDF"
                                variant="outline"
                                small
                                style={{ flex: 1 }}
                                onPress={() => openPlatformPdf(`/organizations/${o.id}/payments/${p.id}/receipt.pdf`, `makbuz-${p.id.slice(0, 8)}.pdf`).catch(notifyError)}
                              />
                              <Btn title="Sil" variant="danger" small onPress={() => deletePayment(p.id)} />
                            </View>
                          </Card>
                        ))}
                      </View>
                    )}
                  </QueryView>
                </>
              ) : null}
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}
