import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { CloudOff, RefreshCw, Trash2 } from 'lucide-react-native';
import { api } from '@/lib/api';
import { dateTime, toCents } from '@/lib/format';
import {
  enqueueOffline,
  KEY_CACHED_CAMPAIGNS,
  listOfflineQueue,
  readOfflineJson,
  removeOfflineItem,
  syncOfflineQueue,
  writeOfflineJson,
  type OfflineItem,
} from '@/lib/offlineQueue';
import { Badge, Btn, Card, Empty, Field, ListItem, Notice, Screen, SectionTitle, Select } from '@/components/ui';
import { confirm, notify } from '@/components/toast';
import { space, useTheme } from '@/theme';

type CampOption = { id: string; title: string };

export default function OfflineQueueScreen() {
  const { colors } = useTheme();
  const [items, setItems] = useState<OfflineItem[]>([]);
  const [campaigns, setCampaigns] = useState<CampOption[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [donorPhone, setDonorPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setItems(await listOfflineQueue());
    const cached = await readOfflineJson<CampOption[]>(KEY_CACHED_CAMPAIGNS, []);
    if (cached.length) {
      setCampaigns(cached);
      setCampaignId((prev) => prev || cached[0]?.id || null);
    }
    try {
      const res = await api<{ items?: CampOption[] } | CampOption[]>('/campaigns', { query: { page_size: 100 } });
      const rows = Array.isArray(res) ? res : res.items || [];
      const fresh = rows.map((c) => ({ id: c.id, title: c.title }));
      if (fresh.length) {
        setCampaigns(fresh);
        setCampaignId((prev) => prev || fresh[0].id);
        await writeOfflineJson(KEY_CACHED_CAMPAIGNS, fresh);
      }
    } catch {
      // Çevrimdışıyken önbellekteki kalemler kullanılır.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await syncOfflineQueue();
      await load();
      if (res.synced > 0 && res.failed === 0) {
        notify(`${res.synced} kayıt başarıyla sunucuya aktarıldı.`);
      } else if (res.synced > 0) {
        notify(`${res.synced} kayıt aktarıldı, ${res.failed} kayıt beklemede.`, 'error');
      } else if (res.failed > 0) {
        notify('Sunucuya ulaşılamadı, kayıtlar güvenle kuyrukta bekliyor.', 'error');
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveOffline = async () => {
    const cents = toCents(amount);
    if (!firstName.trim() || !cents || !campaignId) {
      notify('Bağışçı adı, bağış kalemi ve tutar gereklidir.', 'error');
      return;
    }
    const idempotencyKey = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
    await enqueueOffline({
      kind: 'receipt',
      label: `${fullName} · ${amount} TL`,
      endpoint: '/donations/manual',
      useAf: true,
      body: {
        idempotency_key: idempotencyKey,
        donor: {
          first_name: firstName.trim(),
          last_name: lastName.trim() || undefined,
          phone: donorPhone.trim() || undefined,
        },
        lines: [
          {
            campaign_id: campaignId,
            amount_cents: cents,
            currency: 'TRY',
            quantity: 1,
          },
        ],
        currency: 'TRY',
        payment_method: 'cash',
        status: 'paid',
        note: note.trim() || undefined,
      },
    });
    setFirstName('');
    setLastName('');
    setDonorPhone('');
    setAmount('');
    setNote('');
    await load();
    notify('Çevrimdışı kuyruğa eklendi. İnternet gelince senkronize edebilirsiniz.');
  };

  return (
    <Screen onRefresh={load}>
      <Stack.Screen options={{ title: 'Çevrimdışı Saha Kuyruğu' }} />
      <Notice text="İnternet çekmeyen sahalarda elden bağış kayıtlarını burada biriktirebilir, bağlantı geldiğinde tek tıkla sunucuya aktarabilirsiniz." />

      <SectionTitle
        right={
          items.length > 0 ? (
            <Btn
              title="Senkronize Et"
              small
              loading={syncing}
              icon={<RefreshCw size={15} color={colors.white} />}
              onPress={handleSync}
            />
          ) : undefined
        }
      >
        Bekleyen Kayıtlar ({items.length})
      </SectionTitle>

      {items.length === 0 ? (
        <Card>
          <Empty title="Bekleyen kayıt yok" text="Tüm saha kayıtlarınız senkronize." />
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {items.map((item) => (
            <ListItem
              key={item.id}
              title={item.label}
              subtitle={item.last_error ? `Hata: ${item.last_error}` : 'Gönderilmeyi bekliyor'}
              meta={dateTime(item.created_at)}
              left={<CloudOff size={18} color={colors.warn} />}
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Badge label="Bekliyor" tone="warn" />
                  <Trash2
                    size={18}
                    color={colors.danger}
                    onPress={async () => {
                      if (await confirm('Kayıt silinsin mi?', item.label)) {
                        await removeOfflineItem(item.id);
                        await load();
                      }
                    }}
                  />
                </View>
              }
            />
          ))}
        </Card>
      )}

      <SectionTitle>Hızlı Çevrimdışı Makbuz Ekle</SectionTitle>
      <Card style={{ gap: space.md }}>
        <Select
          label="Bağış Kalemi"
          value={campaignId}
          options={campaigns.map((c) => ({ value: c.id, label: c.title }))}
          onChange={setCampaignId}
          placeholder="Bağış kalemi seçin"
          searchable
        />
        <Field label="Bağışçı Adı" value={firstName} onChangeText={setFirstName} placeholder="Örn. Ahmet" />
        <Field label="Bağışçı Soyadı (opsiyonel)" value={lastName} onChangeText={setLastName} placeholder="Örn. Yılmaz" />
        <Field label="Telefon (opsiyonel)" value={donorPhone} onChangeText={setDonorPhone} keyboardType="phone-pad" placeholder="05XX..." />
        <Field label="Tutar (TL)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="500" />
        <Field label="Not (opsiyonel)" value={note} onChangeText={setNote} placeholder="Örn. Saha elden bağış" />
        <Btn title="Çevrimdışı Kuyruğa Kaydet" onPress={handleSaveOffline} />
      </Card>
    </Screen>
  );
}
