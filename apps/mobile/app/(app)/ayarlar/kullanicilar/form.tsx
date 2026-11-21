import React, { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { af } from '@/lib/api';
import { useStaff } from '@/api/hooks';
import { BUILTIN_ROLE_OPTIONS, useDepartments, useStaffRoles } from '@/api/staff';
import { Btn, Card, Field, Loading, Notice, Screen, SectionTitle, Select, SwitchRow } from '@/components/ui';
import { confirm, notify, notifyError } from '@/components/toast';
import { space } from '@/theme';

export default function StaffForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { me } = useAuth();
  const users = useStaff();
  const roles = useStaffRoles();
  const departments = useDepartments();
  const existing = id ? users.data?.find((u) => u.id === id) : undefined;

  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', password: '', role: 'readonly',
    staff_role_id: null as string | null, department_id: null as string | null, is_active: true,
  });
  const [loaded, setLoaded] = useState(!id);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!existing || loaded) return;
    setForm({
      first_name: existing.first_name, last_name: existing.last_name, email: existing.email, phone: existing.phone || '', password: '',
      role: existing.role, staff_role_id: existing.staff_role_id, department_id: existing.department_id, is_active: existing.is_active,
    });
    setLoaded(true);
  }, [existing, loaded]);

  if (!loaded) return <Loading />;
  const self = id === me?.id;

  const save = async () => {
    setError(null);
    if (!form.first_name.trim() || !form.last_name.trim()) return setError('Ad ve soyadı yazın.');
    if (!id && !form.email.trim()) return setError('E-posta adresini yazın.');
    if (!id && form.password.length < 10) return setError('Şifre en az 10 karakter olmalı.');
    setBusy('save');
    try {
      if (id) {
        await af(`/users/${id}`, {
          method: 'PUT',
          body: {
            first_name: form.first_name.trim(), last_name: form.last_name.trim(), phone: form.phone.trim() || null,
            role: form.role, is_active: form.is_active,
            staff_role_id: form.staff_role_id || undefined, clear_staff_role: !form.staff_role_id,
            department_id: form.department_id || undefined, clear_department: !form.department_id,
          },
        });
      } else {
        await af('/users', {
          method: 'POST',
          body: {
            first_name: form.first_name.trim(), last_name: form.last_name.trim(), email: form.email.trim(),
            phone: form.phone.trim() || null, password: form.password, role: form.role,
            staff_role_id: form.staff_role_id || null, department_id: form.department_id || null,
          },
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
      notify(id ? 'Kullanıcı güncellendi.' : 'Kullanıcı eklendi.');
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const setPassword = async () => {
    if (newPassword.length < 10) return notify('Şifre en az 10 karakter olmalı.', 'error');
    if (!(await confirm('Şifre değiştirilsin mi?', 'Kullanıcının tüm oturumları kapatılır.'))) return;
    setBusy('password');
    try {
      await af(`/users/${id}/password`, { method: 'POST', body: { password: newPassword } });
      setNewPassword('');
      notify('Şifre belirlendi; kullanıcı yeniden giriş yapmalı.');
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen footer={<Btn title={id ? 'Kaydet' : 'Kullanıcı ekle'} onPress={save} loading={busy === 'save'} />}>
      <Stack.Screen options={{ title: id ? 'Kullanıcıyı düzenle' : 'Yeni kullanıcı' }} />
      {error ? <Notice text={error} tone="danger" /> : null}
      <Card style={{ gap: space.md }}>
        <Field label="Ad" value={form.first_name} onChangeText={(first_name) => set({ first_name })} autoCapitalize="words" />
        <Field label="Soyad" value={form.last_name} onChangeText={(last_name) => set({ last_name })} autoCapitalize="words" />
        <Field label="E-posta" value={form.email} onChangeText={(email) => set({ email })} keyboardType="email-address" autoCapitalize="none" editable={!id}
          hint={id ? 'E-posta adresi değiştirilemez.' : undefined} />
        <Field label="Telefon" value={form.phone} onChangeText={(phone) => set({ phone })} keyboardType="phone-pad" />
        {!id ? <Field label="Geçici şifre" value={form.password} onChangeText={(password) => set({ password })} secureTextEntry autoComplete="new-password" hint="En az 10 karakter. Kullanıcıya iletin." /> : null}
      </Card>
      <SectionTitle>Yetki</SectionTitle>
      <Card style={{ gap: space.md }}>
        <Select label="Hazır rol" value={form.role} options={BUILTIN_ROLE_OPTIONS} onChange={(role) => set({ role: role || 'readonly' })} />
        <Select label="Özel rol" value={form.staff_role_id} allowClear placeholder="Yok (hazır rol geçerli)"
          options={(roles.data || []).map((r) => ({ value: r.id, label: r.name, hint: r.description || undefined }))}
          onChange={(staff_role_id) => set({ staff_role_id })} />
        <Select label="Birim" value={form.department_id} allowClear placeholder="Birimsiz"
          options={(departments.data || []).map((d) => ({ value: d.id, label: d.name }))} onChange={(department_id) => set({ department_id })} />
        {id ? <SwitchRow label="Hesap etkin" hint={self ? 'Kendi hesabınızı pasif yapamazsınız.' : 'Pasif kullanıcı giriş yapamaz.'}
          value={form.is_active} onValueChange={(is_active) => set({ is_active })} disabled={self} /> : null}
      </Card>
      {id && !self ? (
        <>
          <SectionTitle>Şifre belirle</SectionTitle>
          <Card style={{ gap: space.md }}>
            <Field label="Yeni şifre" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoComplete="new-password" hint="En az 10 karakter." />
            <Btn title="Şifreyi belirle" variant="outline" small onPress={setPassword} loading={busy === 'password'} />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
