'use no memo';
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetProps } from './data';

function palette(dark?: boolean) {
  return dark
    ? {
        bg: '#0F172A' as const,
        surface: '#1E293B' as const,
        primary: '#34D399' as const,
        primaryBg: '#059669' as const,
        text: '#F8FAFC' as const,
        muted: '#94A3B8' as const,
        faint: '#64748B' as const,
        warn: '#FCD34D' as const,
        warnBg: '#3B2809' as const,
        danger: '#F87171' as const,
        track: '#1E293B' as const,
      }
    : {
        bg: '#FFFFFF' as const,
        surface: '#F1F5F4' as const,
        primary: '#059669' as const,
        primaryBg: '#059669' as const,
        text: '#0E1B17' as const,
        muted: '#5B6B66' as const,
        faint: '#8A9792' as const,
        warn: '#B45309' as const,
        warnBg: '#FFFBEB' as const,
        danger: '#DC2626' as const,
        track: '#E3E8E6' as const,
      };
}

/** 1. Bugün gelen para (3x2) */
export function AndroidInflowWidget({ data, compact }: { data: WidgetProps; compact?: boolean }) {
  const c = palette(data.dark);
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: data.signedOut ? 'einfak://login' : 'einfak://para-girisleri' }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: c.bg,
        borderRadius: 20,
        padding: 14,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
      accessibilityLabel={`Bugün gelen para ${data.total}`}
    >
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: 'match_parent' }}>
        <TextWidget text={data.org} maxLines={1} style={{ fontSize: 12, fontWeight: 'bold', color: c.primary }} />
        <FlexWidget clickAction="REFRESH" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextWidget text={`${data.updated ? data.updated + ' · ' : ''}↻`} style={{ fontSize: 11, color: c.faint }} />
        </FlexWidget>
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'column' }}>
        <TextWidget text="Bugün gelen para" style={{ fontSize: 12, color: c.muted }} />
        <TextWidget text={data.total} maxLines={1} style={{ fontSize: compact ? 24 : 30, fontWeight: '800', color: c.text }} />
        <FlexWidget style={{ flexDirection: 'row' }}>
          <TextWidget text={data.count} style={{ fontSize: 12, fontWeight: '600', color: c.text }} />
          {data.change ? (
            <TextWidget text={`  ${data.change}`} style={{ fontSize: 12, fontWeight: '600', color: data.up ? c.primary : c.danger }} />
          ) : null}
        </FlexWidget>
      </FlexWidget>
      {!compact ? (
        <FlexWidget style={{ flexDirection: 'column' }}>
          {data.lines.map((line) => (
            <TextWidget key={line} text={line} maxLines={1} style={{ fontSize: 12, color: c.muted }} />
          ))}
          {data.waiting ? (
            <TextWidget text={data.waiting} style={{ fontSize: 12, fontWeight: 'bold', color: c.warn }} />
          ) : null}
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

/** 2. Mini Sayaç (2x2) */
export function AndroidCompactWidget({ data }: { data: WidgetProps }) {
  const c = palette(data.dark);
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: data.signedOut ? 'einfak://login' : 'einfak://para-girisleri' }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: c.bg,
        borderRadius: 20,
        padding: 12,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
        <TextWidget text="e-İnfak" style={{ fontSize: 11, fontWeight: 'bold', color: c.primary }} />
        <FlexWidget clickAction="REFRESH">
          <TextWidget text="↻" style={{ fontSize: 12, color: c.faint }} />
        </FlexWidget>
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'column' }}>
        <TextWidget text={data.total} maxLines={1} style={{ fontSize: 22, fontWeight: '800', color: c.text }} />
        <TextWidget text={data.count} maxLines={1} style={{ fontSize: 11, color: c.muted }} />
      </FlexWidget>
      {data.waitingCount && data.waitingCount > 0 ? (
        <FlexWidget style={{ backgroundColor: c.warnBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <TextWidget text={`${data.waitingCount} bekleyen`} maxLines={1} style={{ fontSize: 11, fontWeight: 'bold', color: c.warn }} />
        </FlexWidget>
      ) : (
        <TextWidget text={data.monthTotal ? `Ay: ${data.monthTotal}` : data.updated} maxLines={1} style={{ fontSize: 11, color: c.faint }} />
      )}
    </FlexWidget>
  );
}

/** 3. Hızlı İşlemler (4x1) */
export function AndroidQuickActionsWidget({ data }: { data: WidgetProps }) {
  const c = palette(data.dark);
  const actions = [
    { label: 'Makbuz', uri: 'einfak://makbuz-kes', primary: true },
    { label: 'Kumbara', uri: 'einfak://kumbara/tara', primary: false },
    { label: 'Havaleler', uri: 'einfak://havaleler', primary: false },
    { label: 'Ara', uri: 'einfak://arama', primary: false },
  ];
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: c.bg,
        borderRadius: 20,
        padding: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      {actions.map((a) => (
        <FlexWidget
          key={a.label}
          clickAction="OPEN_URI"
          clickActionData={{ uri: a.uri }}
          style={{
            flex: 1,
            height: 'match_parent',
            marginHorizontal: 3,
            borderRadius: 14,
            backgroundColor: a.primary ? c.primaryBg : c.surface,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 4,
          }}
        >
          <TextWidget
            text={a.label}
            maxLines={1}
            style={{ fontSize: 12, fontWeight: 'bold', color: a.primary ? '#FFFFFF' : c.text }}
          />
        </FlexWidget>
      ))}
    </FlexWidget>
  );
}

/** 4. Bekleyen Havaleler (4x2) */
export function AndroidTransfersWidget({ data }: { data: WidgetProps }) {
  const c = palette(data.dark);
  const items = data.transfers || [];
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: data.signedOut ? 'einfak://login' : 'einfak://havaleler' }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: c.bg,
        borderRadius: 20,
        padding: 14,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: 'match_parent' }}>
        <TextWidget text="Bekleyen Havaleler" style={{ fontSize: 13, fontWeight: 'bold', color: c.warn }} />
        <FlexWidget clickAction="REFRESH">
          <TextWidget text={`${data.waitingCount || 0} adet · ${data.waitingTotal || '₺0'}  ↻`} style={{ fontSize: 11, fontWeight: '600', color: c.muted }} />
        </FlexWidget>
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
        {items.length === 0 ? (
          <TextWidget text={data.signedOut ? 'Görmek için giriş yapın' : 'Bekleyen havale yok ✓'} style={{ fontSize: 13, color: c.muted }} />
        ) : (
          items.map((t, idx) => (
            <FlexWidget
              key={`${t.sender}-${idx}`}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: 'match_parent',
                backgroundColor: c.surface,
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 6,
                marginTop: idx === 0 ? 0 : 4,
              }}
            >
              <TextWidget text={t.sender} maxLines={1} style={{ fontSize: 12, color: c.text }} />
              <TextWidget text={t.amount} maxLines={1} style={{ fontSize: 12, fontWeight: 'bold', color: c.primary }} />
            </FlexWidget>
          ))
        )}
      </FlexWidget>
    </FlexWidget>
  );
}

/** 5. Kampanya Hedefi & Görevlerim (4x2) */
export function AndroidTasksGoalsWidget({ data }: { data: WidgetProps }) {
  const c = palette(data.dark);
  const tasks = data.tasks || [];
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: data.signedOut ? 'einfak://login' : 'einfak://gorevler' }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: c.bg,
        borderRadius: 20,
        padding: 14,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: 'match_parent' }}>
        <TextWidget text="Kampanya & Görevler" style={{ fontSize: 12, fontWeight: 'bold', color: c.primary }} />
        <FlexWidget clickAction="REFRESH">
          <TextWidget text={`${data.tasksOpen || 0} görev  ↻`} style={{ fontSize: 11, color: c.muted }} />
        </FlexWidget>
      </FlexWidget>
      {data.campaign ? (
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
          <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
            <TextWidget text={data.campaign.title} maxLines={1} style={{ fontSize: 12, fontWeight: 'bold', color: c.text }} />
            <TextWidget text={`%${data.campaign.percent}`} style={{ fontSize: 12, fontWeight: 'bold', color: c.primary }} />
          </FlexWidget>
          <TextWidget text={data.campaign.summary} maxLines={1} style={{ fontSize: 11, color: c.muted }} />
        </FlexWidget>
      ) : null}
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
        {tasks.length === 0 ? (
          <TextWidget text={data.signedOut ? 'Görmek için giriş yapın' : 'Açık görev bulunmuyor ✓'} style={{ fontSize: 12, color: c.muted }} />
        ) : (
          tasks.slice(0, 2).map((t, idx) => (
            <TextWidget
              key={`${t.title}-${idx}`}
              text={`${t.overdue ? '!' : '•'} ${t.title}`}
              maxLines={1}
              style={{ fontSize: 12, color: t.overdue ? c.danger : c.text }}
            />
          ))
        )}
      </FlexWidget>
    </FlexWidget>
  );
}
