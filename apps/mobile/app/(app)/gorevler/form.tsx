import React, { useState } from 'react';
import { Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { af } from '@/lib/api';
import { recall, remember } from '@/lib/selected';
import { useStaffOptions } from '@/api/hooks';
import { PRIORITY, Task } from '@/api/types';
import { Btn, Card, Chips, Field, Notice, Screen, Select, useUi } from '@/components/ui';
import { DateField } from '@/components/fields';
import { notify } from '@/components/toast';
import { space } from '@/theme';

const PRIORITIES = Object.entries(PRIORITY).map(([value, label]) => ({ value, label }));
const RECURRENCE = [
  { value: 'none', label: 'Tekrarsız' }, { value: 'daily', label: 'Her gün' }, { value: 'weekly', label: 'Her hafta' }, { value: 'monthly', label: 'Her ay' },
];

export default function TaskForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { me } = useAuth();
  const ui = useUi();
  const staff = useStaffOptions();
  const existing = id ? recall<Task>('task', id) : undefined;

  const [title, setTitle] = useState(existing?.title || '');
  const [description, setDescription] = useState(existing?.description || '');
  const [priority, setPriority] = useState<string>(existing?.priority || 'normal');
  const [due, setDue] = useState<string | null>(existing?.due_date || null);
  const [assignee, setAssignee] = useState<string | null>(existing ? existing.assigned_to_id : me?.id || null);
  const [recurrence, setRecurrence] = useState(existing?.recurrence || 'none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (!title.trim()) return setError('Görev başlığını yazın.');
    setBusy(true);
    try {
      const body = {
        title: title.trim(), description: description.trim() || null, priority, due_date: due,
        assigned_to_id: assignee, recurrence,
      };
      const saved = await af<Task>(id ? `/tasks/${id}` : '/tasks', { method: id ? 'PUT' : 'POST', body });
      remember('task', saved.id, saved);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      notify(id ? 'Görev güncellendi.' : 'Görev eklendi.');
      if (id) router.back();
      else router.replace({ pathname: '/gorevler/[id]', params: { id: saved.id } });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Btn title={id ? 'Kaydet' : 'Görev ekle'} onPress={save} loading={busy} />}>
      <Stack.Screen options={{ title: id ? 'Görevi düzenle' : 'Yeni görev' }} />
      {error ? <Notice text={error} tone="danger" /> : null}
      <Card style={{ gap: space.md }}>
        <Field label="Başlık" value={title} onChangeText={setTitle} maxLength={200} />
        <Field label="Açıklama" value={description} onChangeText={setDescription} multiline maxLength={5000} />
        <Select label="Atanan kişi" value={assignee} options={staff} onChange={setAssignee} searchable allowClear placeholder="Atanmamış" />
        <DateField label="Son tarih" value={due} onChange={setDue} />
        <Text style={ui.muted}>Öncelik</Text>
        <Chips options={PRIORITIES} value={priority} onChange={setPriority} wrap />
        <Text style={ui.muted}>Tekrar</Text>
        <Chips options={RECURRENCE} value={recurrence} onChange={setRecurrence} wrap />
      </Card>
    </Screen>
  );
}
