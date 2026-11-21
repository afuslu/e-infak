import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { CheckSquare, Square } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { af } from '@/lib/api';
import { useStaffRoles } from '@/api/staff';
import { Btn, Card, Field, Loading, Notice, Screen, ui } from '@/components/ui';
import { confirm, notify, notifyError } from '@/components/toast';
import { colors, font, space } from '@/theme';

export default function RoleForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { access } = useAuth();
  const roles = useStaffRoles();
  const existing = id ? roles.data?.find((r) => r.id === id) : undefined;
  const catalog = access?.capability_catalog || [];

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(!id);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existing || loaded) return;
    setName(existing.name);
    setDescription(existing.description || '');
    setPicked(new Set(existing.capabilities));
    setLoaded(true);
  }, [existing, loaded]);

  if (!loaded) return <Loading />;

  const toggle = (key: string) => setPicked((s) => {
    const next = new Set(s);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const toggleGroup = (keys: string[]) => setPicked((s) => {
    const next = new Set(s);
    const all = keys.every((k) => next.has(k));
    keys.forEach((k) => (all ? next.delete(k) : next.add(k)));
    return next;
  });

  const save = async () => {
    setError(null);
    if (name.trim().length < 2) return setError('Rol adını yazın.');
    if (!picked.size) return setError('En az bir yetki seçin.');
    setBusy('save');
    try {
      const body = { name: name.trim(), description: description.trim() || null, permissions: [], capabilities: [...picked] };
      await af(id ? `/staff-roles/${id}` : '/staff-roles', { method: id ? 'PUT' : 'POST', body });
      await queryClient.invalidateQueries({ queryKey: ['staff-roles'] });
      notify('Rol kaydedildi.');
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen footer={(
      <View style={{ gap: space.sm }}>
        <Btn title="Kaydet" onPress={save} loading={busy === 'save'} />
        {id ? (
          <Btn title="Rolü sil" variant="danger" loading={busy === 'delete'} onPress={async () => {
            if (!(await confirm(`${name} rolü silinsin mi?`, 'Bu role sahip kullanıcılar hazır rollerine döner.', 'Sil', true))) return;
            setBusy('delete');
            try {
              await af(`/staff-roles/${id}`, { method: 'DELETE' });
              await queryClient.invalidateQueries({ queryKey: ['staff-roles'] });
              notify('Rol silindi.');
              router.back();
            } catch (e) {
              notifyError(e);
            } finally {
              setBusy(null);
            }
          }} />
        ) : null}
      </View>
    )}>
      <Stack.Screen options={{ title: id ? 'Rolü düzenle' : 'Yeni rol' }} />
      {error ? <Notice text={error} tone="danger" /> : null}
      <Card style={{ gap: space.md }}>
        <Field label="Rol adı" value={name} onChangeText={setName} />
        <Field label="Açıklama" value={description} onChangeText={setDescription} multiline />
      </Card>
      <Text style={ui.muted}>{picked.size} yetki seçili</Text>
      {catalog.map((group) => {
        const keys = group.capabilities.map((c) => c.key);
        const all = keys.every((k) => picked.has(k));
        return (
          <Card key={group.key}>
            <Pressable onPress={() => toggleGroup(keys)} style={[ui.rowGap, { justifyContent: 'space-between' }]} accessibilityRole="checkbox" accessibilityState={{ checked: all }}>
              <Text style={{ fontSize: font.md, fontWeight: '700', color: colors.text }}>{group.label}</Text>
              <Text style={{ color: colors.primaryDark, fontWeight: '600' }}>{all ? 'Hiçbiri' : 'Tümü'}</Text>
            </Pressable>
            {group.capabilities.map((c) => {
              const on = picked.has(c.key);
              return (
                <Pressable key={c.key} onPress={() => toggle(c.key)} style={[ui.rowGap, { paddingVertical: 8 }]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                  {on ? <CheckSquare size={20} color={colors.primary} /> : <Square size={20} color={colors.faint} />}
                  <View style={{ flex: 1 }}>
                    <Text style={ui.text}>{c.label}</Text>
                    {c.description ? <Text style={ui.muted}>{c.description}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </Card>
        );
      })}
    </Screen>
  );
}
