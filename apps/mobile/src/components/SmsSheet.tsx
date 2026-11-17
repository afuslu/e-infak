import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { af } from '@/lib/api';
import { Btn, Field, Notice, Select, Sheet, ui } from './ui';
import { notify } from './toast';

export type SmsTemplate = { id: string; name: string; body: string; event_label?: string | null; is_active: boolean };

/** Bir bağışçıya / bağışa tekli SMS: şablon seç, doldurulmuş metni gör, düzenle, gönder. */
export function SmsSheet({ visible, onClose, donorId, donationId, phone }: {
  visible: boolean; onClose: () => void; donorId?: string | null; donationId?: string | null; phone?: string | null;
}) {
  const queryClient = useQueryClient();
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allow, setAllow] = useState<boolean | null>(null);

  const templates = useQuery({
    queryKey: ['sms-templates'],
    enabled: visible,
    queryFn: () => af<SmsTemplate[]>('/sms/templates'),
  });

  useEffect(() => {
    if (!visible) {
      setTemplateId(null);
      setBody('');
      setError(null);
      setAllow(null);
    }
  }, [visible]);

  const pick = async (id: string | null) => {
    setTemplateId(id);
    setError(null);
    if (!id) return;
    try {
      const preview = await af<{ body: string; allow_sms: boolean | null }>('/sms/preview', {
        query: { template_id: id, donor_id: donorId, donation_id: donationId },
      });
      setBody(preview.body);
      setAllow(preview.allow_sms);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const send = async () => {
    if (body.trim().length < 2) return setError('Mesaj metnini yazın.');
    setBusy(true);
    setError(null);
    try {
      await af('/sms/send', {
        method: 'POST',
        body: { donor_id: donorId || undefined, donation_id: donationId || undefined, phone: phone || undefined, body: body.trim(), template_id: templateId || undefined },
      });
      queryClient.invalidateQueries({ queryKey: ['sms-messages'] });
      notify('SMS gönderim kuyruğuna alındı.');
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="SMS gönder" footer={<Btn title="Gönder" onPress={send} loading={busy} />}>
      {phone ? <Text style={ui.muted}>Alıcı: {phone}</Text> : null}
      {error ? <Notice text={error} tone="danger" /> : null}
      {allow === false && !donationId ? <Notice tone="warn" text="Bağışçının SMS izni yok; tanıtım içerikli ileti gönderilemez." /> : null}
      <Select label="Şablon" value={templateId} onChange={pick} searchable allowClear placeholder="Şablonsuz (serbest metin)"
        options={(templates.data || []).filter((t) => t.is_active).map((t) => ({ value: t.id, label: t.name, hint: t.event_label || undefined }))} />
      <Field label="Mesaj" value={body} onChangeText={setBody} multiline maxLength={1500} hint={`${body.length} karakter`} />
    </Sheet>
  );
}
