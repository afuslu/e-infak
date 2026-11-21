import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { af } from '@/lib/api';
import { can, ROLE_LABELS } from '@/lib/access';
import { dateTime, initials } from '@/lib/format';
import { useStaff } from '@/api/hooks';
import { Department, useDepartments, useStaffRoles } from '@/api/staff';
import { Avatar, Badge, Btn, Card, Chips, Field, ListItem, QueryView, Screen, Sheet, ui } from '@/components/ui';
import { confirm, notify, notifyError } from '@/components/toast';
import { colors, space } from '@/theme';

const TABS = [
  { value: 'users', label: 'Kullanıcılar' },
  { value: 'roles', label: 'Roller' },
  { value: 'departments', label: 'Birimler' },
];

export default function StaffScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { access } = useAuth();
  const manage = can(access, 'users.manage');
  const [tab, setTab] = useState('users');
  const users = useStaff();
  const roles = useStaffRoles();
  const departments = useDepartments();
  const [dept, setDept] = useState<Partial<Department> | null>(null);
  const [busy, setBusy] = useState(false);

  const limit = access?.limits?.users;
  const used = access?.usage?.users;

  const saveDept = async () => {
    if (!dept?.name || dept.name.trim().length < 2) return notify('Birim adını yazın.', 'error');
    setBusy(true);
    try {
      const body = { name: dept.name.trim(), description: dept.description?.trim() || null };
      await af(dept.id ? `/departments/${dept.id}` : '/departments', { method: dept.id ? 'PUT' : 'POST', body });
      await queryClient.invalidateQueries({ queryKey: ['departments'] });
      setDept(null);
      notify('Birim kaydedildi.');
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen onRefresh={() => { users.refetch(); roles.refetch(); departments.refetch(); }} refreshing={users.isRefetching}>
      <Stack.Screen options={{ title: 'Kullanıcılar ve roller' }} />
      <Chips options={TABS} value={tab} onChange={setTab} />

      {tab === 'users' ? (
        <>
          {limit ? <Text style={ui.muted}>Paketinizde {limit} kullanıcı hakkı var; {used ?? '?'} kullanılıyor.</Text> : null}
          {manage ? <Btn title="Kullanıcı ekle" icon={<Plus size={18} color={colors.white} />} onPress={() => router.push('/ayarlar/kullanicilar/form')} /> : null}
          <QueryView query={users}>
            {(list) => (
              <View style={ui.listCard}>
                {list.map((u, i) => (
                  <View key={u.id}>
                    {i ? <View style={ui.separator} /> : null}
                    <ListItem
                      left={<Avatar text={initials(`${u.first_name} ${u.last_name}`)} />}
                      title={`${u.first_name} ${u.last_name}`}
                      subtitle={u.email}
                      meta={[u.staff_role_name || u.role_label || ROLE_LABELS[u.role], u.department_name, u.last_login_at ? `Son giriş ${dateTime(u.last_login_at)}` : null].filter(Boolean).join(' · ')}
                      right={u.is_active ? undefined : <Badge label="Pasif" />}
                      chevron={manage}
                      onPress={manage ? () => router.push({ pathname: '/ayarlar/kullanicilar/form', params: { id: u.id } }) : undefined}
                    />
                  </View>
                ))}
              </View>
            )}
          </QueryView>
        </>
      ) : null}

      {tab === 'roles' ? (
        <>
          <Text style={ui.muted}>Özel roller, hazır rollerin yerine tek tek seçilen yetkilerle tanımlanır.</Text>
          {manage ? <Btn title="Rol ekle" icon={<Plus size={18} color={colors.white} />} onPress={() => router.push('/ayarlar/kullanicilar/rol')} /> : null}
          <QueryView query={roles}>
            {(list) => list.length ? (
              <View style={ui.listCard}>
                {list.map((r, i) => (
                  <View key={r.id}>
                    {i ? <View style={ui.separator} /> : null}
                    <ListItem title={r.name} subtitle={r.description} meta={`${r.capabilities.length} yetki · ${r.user_count} kullanıcı`} chevron={manage}
                      onPress={manage ? () => router.push({ pathname: '/ayarlar/kullanicilar/rol', params: { id: r.id } }) : undefined} />
                  </View>
                ))}
              </View>
            ) : <Text style={ui.muted}>Henüz özel rol yok.</Text>}
          </QueryView>
        </>
      ) : null}

      {tab === 'departments' ? (
        <>
          {manage ? <Btn title="Birim ekle" icon={<Plus size={18} color={colors.white} />} onPress={() => setDept({ name: '', description: '' })} /> : null}
          <QueryView query={departments}>
            {(list) => list.length ? (
              <View style={ui.listCard}>
                {list.map((d, i) => (
                  <View key={d.id}>
                    {i ? <View style={ui.separator} /> : null}
                    <ListItem title={d.name} subtitle={d.description} meta={`${d.user_count} kullanıcı`} chevron={manage}
                      onPress={manage ? () => setDept(d) : undefined} />
                  </View>
                ))}
              </View>
            ) : <Text style={ui.muted}>Henüz birim yok.</Text>}
          </QueryView>
        </>
      ) : null}

      <Sheet visible={!!dept} onClose={() => setDept(null)} title={dept?.id ? 'Birimi düzenle' : 'Yeni birim'}
        footer={(
          <View style={{ gap: space.sm }}>
            <Btn title="Kaydet" onPress={saveDept} loading={busy} />
            {dept?.id ? (
              <Btn title="Birimi sil" variant="danger" onPress={async () => {
                if (!(await confirm(`${dept.name} silinsin mi?`, undefined, 'Sil', true))) return;
                try {
                  await af(`/departments/${dept.id}`, { method: 'DELETE' });
                  await queryClient.invalidateQueries({ queryKey: ['departments'] });
                  setDept(null);
                  notify('Birim silindi.');
                } catch (e) {
                  notifyError(e);
                }
              }} />
            ) : null}
          </View>
        )}>
        <Card style={{ gap: space.md, borderWidth: 0, padding: 0 }}>
          <Field label="Birim adı" value={dept?.name || ''} onChangeText={(name) => setDept({ ...dept, name })} />
          <Field label="Açıklama" value={dept?.description || ''} onChangeText={(description) => setDept({ ...dept, description })} multiline />
        </Card>
      </Sheet>
    </Screen>
  );
}
