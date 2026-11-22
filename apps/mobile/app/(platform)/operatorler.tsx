import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pf } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Badge, Btn, Card, Chips, Field, ListItem, QueryView, Screen, SectionTitle, useUi } from '@/components/ui';
import { confirm, notify, notifyError } from '@/components/toast';
import { space } from '@/theme';

type Operator = {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'support';
  is_active: boolean;
  totp_enabled?: boolean;
  last_login_at?: string | null;
};

export default function PlatformOperatorsScreen() {
  const queryClient = useQueryClient();
  const ui = useUi();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'admin' | 'support'>('support');
  const [tempPw, setTempPw] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['platform', 'operators'],
    queryFn: () => pf<Operator[]>('/operators'),
  });

  const create = useMutation({
    mutationFn: () =>
      pf<{ operator: Operator; temporary_password: string }>('/operators', {
        method: 'POST',
        body: { email: email.trim(), full_name: fullName.trim(), role },
      }),
    onSuccess: (res) => {
      setEmail('');
      setFullName('');
      setTempPw(`${res.operator.email}: ${res.temporary_password}`);
      queryClient.invalidateQueries({ queryKey: ['platform', 'operators'] });
      notify('Platform operatörü eklendi.');
    },
    onError: notifyError,
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { is_active?: boolean; role?: string } }) =>
      pf(`/operators/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'operators'] });
      notify('Operatör güncellendi.');
    },
    onError: notifyError,
  });

  const resetPw = async (op: Operator) => {
    if (!(await confirm(`${op.full_name} için şifre sıfırlansın mı?`))) return;
    try {
      const res = await pf<{ email: string; temporary_password: string }>(`/operators/${op.id}/reset-password`, { method: 'POST' });
      setTempPw(`${res.email}: ${res.temporary_password}`);
      notify('Geçici şifre oluşturuldu.');
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <Stack.Screen options={{ title: 'Platform Operatörleri' }} />

      {tempPw ? (
        <Card style={{ gap: 4 }}>
          <Text style={ui.title}>Geçici Şifre (tek seferlik)</Text>
          <Text style={ui.text} selectable>{tempPw}</Text>
        </Card>
      ) : null}

      <SectionTitle>Yeni Operatör Ekle</SectionTitle>
      <Card style={{ gap: space.sm }}>
        <Field label="Ad Soyad" value={fullName} onChangeText={setFullName} placeholder="Ahmet Yılmaz" />
        <Field label="E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="destek@e-infak.org" />
        <Chips
          options={[
            { value: 'support', label: 'Destek (Support)' },
            { value: 'admin', label: 'Yönetici (Admin)' },
          ]}
          value={role}
          onChange={setRole}
        />
        <Btn
          title="Operatör Oluştur"
          disabled={!email.trim() || fullName.trim().length < 2}
          loading={create.isPending}
          onPress={() => create.mutate()}
        />
      </Card>

      <SectionTitle>Kayıtlı Operatörler</SectionTitle>
      <QueryView query={query}>
        {(rows) => (
          <View style={{ gap: space.sm }}>
            {rows.map((op) => (
              <Card key={op.id} style={{ gap: space.xs }}>
                <ListItem
                  title={op.full_name}
                  subtitle={`${op.email} · ${op.role === 'admin' ? 'Yönetici' : 'Destek'}`}
                  meta={op.last_login_at ? `Son giriş: ${dateTime(op.last_login_at)}` : 'Henüz giriş yok'}
                  right={<Badge label={op.is_active ? 'Aktif' : 'Pasif'} tone={op.is_active ? 'ok' : 'danger'} />}
                />
                <View style={ui.rowGap}>
                  <Btn
                    title={op.role === 'admin' ? 'Destek Yap' : 'Yönetici Yap'}
                    variant="outline"
                    small
                    style={{ flex: 1 }}
                    onPress={() => patch.mutate({ id: op.id, body: { role: op.role === 'admin' ? 'support' : 'admin' } })}
                  />
                  <Btn
                    title={op.is_active ? 'Pasifleştir' : 'Aktifleştir'}
                    variant="outline"
                    small
                    style={{ flex: 1 }}
                    onPress={() => patch.mutate({ id: op.id, body: { is_active: !op.is_active } })}
                  />
                  <Btn title="Şifre" variant="ghost" small onPress={() => resetPw(op)} />
                </View>
              </Card>
            ))}
          </View>
        )}
      </QueryView>
    </Screen>
  );
}
