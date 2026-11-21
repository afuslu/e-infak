import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { af } from '@/lib/api';
import { date, dateTime } from '@/lib/format';
import { recall, remember } from '@/lib/selected';
import { PRIORITY, Task, TASK_STATUS } from '@/api/types';
import { Badge, Btn, Card, Chips, Field, Notice, Row, Screen, SectionTitle, ui } from '@/components/ui';
import { confirm, notify, notifyError } from '@/components/toast';
import { space } from '@/theme';

const STATUS_OPTIONS = Object.entries(TASK_STATUS).map(([value, s]) => ({ value, label: s.label }));

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [task, setTask] = useState<Task | undefined>(recall<Task>('task', id));
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  if (!task) {
    return <Screen><Notice text="Görev bulunamadı; listeden yeniden açın." /><Btn title="Görevlere dön" onPress={() => router.replace('/gorevler')} /></Screen>;
  }

  const update = (next: Task) => {
    remember('task', next.id, next);
    setTask(next);
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const setStatus = async (status: string) => {
    setBusy('status');
    try {
      update(await af<Task>(`/tasks/${id}`, { method: 'PUT', body: { status } }));
      notify('Durum güncellendi.');
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(null);
    }
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    setBusy('comment');
    try {
      update(await af<Task>(`/tasks/${id}/comments`, { method: 'POST', body: { text: comment.trim() } }));
      setComment('');
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Görev' }} />
      <Card>
        <Text style={ui.title}>{task.title}</Text>
        <View style={ui.wrapGap}>
          <Badge label={TASK_STATUS[task.status]?.label || task.status} tone={TASK_STATUS[task.status]?.tone} />
          <Badge label={PRIORITY[task.priority] || task.priority} tone={task.priority === 'urgent' || task.priority === 'high' ? 'danger' : 'muted'} />
          {task.overdue ? <Badge label="Gecikti" tone="danger" /> : null}
        </View>
        {task.description ? <Text style={[ui.text, { marginTop: space.sm }]}>{task.description}</Text> : null}
        <Row label="Atanan" value={task.assigned_to_name || '—'} />
        <Row label="Son tarih" value={date(task.due_date)} />
        {task.donor_name ? <Row label="Bağışçı" value={task.donor_name} onPress={task.donor_id ? () => router.push({ pathname: '/bagisci/[id]', params: { id: task.donor_id! } }) : undefined} /> : null}
        <Row label="Oluşturan" value={task.created_by_name || '—'} />
        {task.subtasks_total ? <Row label="Alt görevler" value={`${task.subtasks_done}/${task.subtasks_total}`} /> : null}
      </Card>
      <SectionTitle>Durum</SectionTitle>
      <Chips options={STATUS_OPTIONS} value={task.status} onChange={setStatus} wrap />
      <Btn title="Düzenle" variant="outline" small onPress={() => router.push({ pathname: '/gorevler/form', params: { id: task.id } })} />

      <SectionTitle>Notlar</SectionTitle>
      {task.comments.map((c) => (
        <Card key={c.id}>
          <Text style={ui.text}>{c.text}</Text>
          <Text style={ui.muted}>{c.user_name} · {dateTime(c.created_at)}</Text>
        </Card>
      ))}
      <Card>
        <Field label="Not ekle" value={comment} onChangeText={setComment} multiline maxLength={2000} />
        <Btn title="Ekle" small onPress={addComment} loading={busy === 'comment'} disabled={!comment.trim()} />
      </Card>
      <Btn title="Görevi sil" variant="danger" loading={busy === 'delete'} onPress={async () => {
        if (!(await confirm('Görev silinsin mi?', undefined, 'Sil', true))) return;
        setBusy('delete');
        try {
          await af(`/tasks/${id}`, { method: 'DELETE' });
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          notify('Görev silindi.');
          router.back();
        } catch (e) {
          notifyError(e);
        } finally {
          setBusy(null);
        }
      }} />
    </Screen>
  );
}
