import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { pf } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Badge, Card, ListItem, QueryView, Row, Screen, SectionTitle, useUi } from '@/components/ui';

type Health = {
  db_ok?: boolean;
  db_ms?: number;
  db_size_mb?: number;
  redis_ok?: boolean;
  sms_failed_24h?: number;
  checked_at?: string;
  status?: string;
  database?: { ok: boolean; latency_ms?: number };
  redis?: { ok: boolean };
  disk?: { free_gb?: number; used_pct?: number };
};

type AuditItem = {
  id: string;
  action: string;
  operator?: string | null;
  organization?: string | null;
  ip?: string | null;
  actor_email?: string | null;
  organization_name?: string | null;
  ip_address?: string | null;
  created_at: string;
};

export default function PlatformSystemScreen() {
  const ui = useUi();

  const health = useQuery({
    queryKey: ['platform', 'health'],
    queryFn: () => pf<Health>('/health'),
  });

  const audit = useQuery({
    queryKey: ['platform', 'audit'],
    queryFn: () => pf<AuditItem[]>('/audit', { query: { limit: 30 } }),
  });

  return (
    <Screen
      onRefresh={() => { health.refetch(); audit.refetch(); }}
      refreshing={health.isRefetching || audit.isRefetching}
    >
      <Stack.Screen options={{ title: 'Sistem Sağlığı & Denetim' }} />

      <SectionTitle>Sistem Durumu</SectionTitle>
      <QueryView query={health}>
        {(h) => {
          const dbOk = h.db_ok ?? h.database?.ok ?? false;
          const dbMs = h.db_ms ?? h.database?.latency_ms ?? 0;
          const redisOk = h.redis_ok ?? h.redis?.ok ?? false;
          const overallOk = h.status ? h.status === 'ok' : dbOk && redisOk;
          return (
            <Card>
              <Row
                label="Genel Durum"
                value={<Badge label={overallOk ? 'Sağlıklı' : 'Kontrol Gerekli'} tone={overallOk ? 'ok' : 'warn'} />}
              />
              <Row
                label="Veritabanı"
                value={dbOk ? `Açık (${dbMs} ms${h.db_size_mb !== undefined ? ` · ${h.db_size_mb} MB` : ''})` : 'Hata'}
              />
              <Row label="Redis" value={redisOk ? 'Açık' : 'Kapalı'} />
              {h.sms_failed_24h !== undefined ? (
                <Row label="Başarısız SMS (24s)" value={String(h.sms_failed_24h)} />
              ) : null}
              {h.disk?.free_gb !== undefined ? (
                <Row label="Disk" value={`${h.disk.free_gb} GB boş (%${h.disk.used_pct ?? 0} dolu)`} />
              ) : null}
            </Card>
          );
        }}
      </QueryView>

      <SectionTitle>Son Platform İşlemleri</SectionTitle>
      <QueryView query={audit}>
        {(rows) => (
          <View style={ui.listCard}>
            {(Array.isArray(rows) ? rows : []).map((a, idx) => {
              const actor = a.operator || a.actor_email;
              const org = a.organization || a.organization_name;
              const ip = a.ip || a.ip_address;
              return (
                <View key={a.id}>
                  {idx > 0 ? <View style={ui.separator} /> : null}
                  <ListItem
                    title={a.action}
                    subtitle={[actor, org].filter(Boolean).join(' · ') || undefined}
                    meta={`${dateTime(a.created_at)}${ip ? ` · ${ip}` : ''}`}
                  />
                </View>
              );
            })}
          </View>
        )}
      </QueryView>
    </Screen>
  );
}
