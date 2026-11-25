'use no memo';
import React from 'react';
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetChannelItem, WidgetProps, WidgetSparkPoint } from './data';
import { channelColor, type HexColor, type WidgetPalette } from './palette';

function uriFor(data: WidgetProps, path: string): string {
  const scheme = data.scheme || 'einfak';
  if (data.signedOut) return `${scheme}://login`;
  return `${scheme}://${path}`;
}

function crescentSvg(primary: HexColor, accent: HexColor): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z" fill="${primary}"/>
    <circle cx="15.5" cy="8.5" r="2.3" fill="${accent}"/>
  </svg>`;
}

function actionIconSvg(kind: 'receipt' | 'qr' | 'bank' | 'search', color: HexColor): string {
  switch (kind) {
    case 'receipt':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 2v20l3-2 2.5 2 2.5-2 2.5 2 2.5-2 3 2V2l-3 2-2.5-2-2.5 2-2.5-2-2.5 2-3-2Z"/>
        <path d="M12 8v6"/><path d="M9 11h6"/>
      </svg>`;
    case 'qr':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5"/>
        <path d="M14 14h3v3h-3z"/><path d="M20 14v3"/><path d="M14 20h7"/>
      </svg>`;
    case 'bank':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 10l5-6 5 6"/><path d="M12 4v12"/>
        <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>
      </svg>`;
    case 'search':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
      </svg>`;
  }
}

function sparklineSvg(
  points: WidgetSparkPoint[] | undefined,
  c: WidgetPalette,
  width = 88,
  height = 38
): string {
  const safe =
    points && points.length > 0
      ? points.slice(-7)
      : [
          { label: '1', amount: '', ratio: 22, isToday: false },
          { label: '2', amount: '', ratio: 40, isToday: false },
          { label: '3', amount: '', ratio: 32, isToday: false },
          { label: '4', amount: '', ratio: 58, isToday: false },
          { label: '5', amount: '', ratio: 46, isToday: false },
          { label: '6', amount: '', ratio: 74, isToday: false },
          { label: '7', amount: '', ratio: 100, isToday: true },
        ];
  const n = safe.length;
  const gap = 4;
  const barW = Math.max(4, Math.floor((width - gap * (n - 1)) / n));
  const maxBarH = height - 4;
  const rects = safe
    .map((pt, i) => {
      const h = Math.max(4, Math.round((Math.max(6, Math.min(100, pt.ratio)) / 100) * maxBarH));
      const x = i * (barW + gap);
      const y = height - h;
      const fill = pt.isToday ? c.primary : c.mode === 'dark' ? '#334155' : '#CBD5E1';
      const opacity = pt.isToday ? '1' : '0.85';
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="${fill}" fill-opacity="${opacity}"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rects}</svg>`;
}

function progressBarSvg(percent: number, fill: HexColor, track: HexColor, width = 260, height = 8): string {
  const clamped = Math.max(0, Math.min(100, percent || 0));
  const fillW = clamped > 0 ? Math.max(height, Math.round((clamped / 100) * width)) : 0;
  const r = Math.floor(height / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect x="0" y="0" width="${width}" height="${height}" rx="${r}" fill="${track}"/>
    ${fillW > 0 ? `<rect x="0" y="0" width="${fillW}" height="${height}" rx="${r}" fill="${fill}"/>` : ''}
  </svg>`;
}

function channelBarSvg(channels: WidgetChannelItem[] | undefined, c: WidgetPalette, width = 260, height = 8): string {
  const list = (channels || []).filter((ch) => ch.percent > 0);
  const r = Math.floor(height / 2);
  if (list.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect x="0" y="0" width="${width}" height="${height}" rx="${r}" fill="${c.track}"/>
    </svg>`;
  }
  const sum = Math.max(1, list.reduce((acc, item) => acc + item.percent, 0));
  const gap = list.length > 1 ? 3 : 0;
  const usable = width - gap * (list.length - 1);
  let cursor = 0;
  const segs = list
    .map((ch, idx) => {
      const segW =
        idx === list.length - 1
          ? Math.max(6, width - cursor)
          : Math.max(6, Math.round((ch.percent / sum) * usable));
      const x = cursor;
      cursor += segW + gap;
      const color = channelColor(c, ch.colorKey);
      return `<rect x="${x}" y="0" width="${Math.min(segW, width - x)}" height="${height}" rx="${r}" fill="${color}"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${segs}</svg>`;
}

function dotSvg(color: HexColor, size = 7): string {
  const r = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${r}" cy="${r}" r="${r}" fill="${color}"/>
  </svg>`;
}

function HeaderBar({
  data,
  c,
  subtitle,
  rightText,
}: {
  data: WidgetProps;
  c: WidgetPalette;
  subtitle?: string;
  rightText?: string;
}) {
  return (
    <FlexWidget
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: 'match_parent',
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
        <SvgWidget svg={crescentSvg(c.primary, c.accent)} style={{ width: 15, height: 15, marginRight: 5 }} />
        <TextWidget
          text={data.org || 'e-İnfak'}
          maxLines={1}
          style={{ fontSize: 12, fontWeight: 'bold', color: c.primary }}
        />
        {subtitle ? (
          <TextWidget text={` · ${subtitle}`} maxLines={1} style={{ fontSize: 11, color: c.muted }} />
        ) : null}
      </FlexWidget>
      <FlexWidget clickAction="REFRESH" style={{ flexDirection: 'row', alignItems: 'center' }}>
        {data.unreadCount && data.unreadCount > 0 ? (
          <FlexWidget
            style={{
              backgroundColor: c.primarySoft,
              borderRadius: 99,
              paddingHorizontal: 6,
              paddingVertical: 2,
              marginRight: 6,
            }}
          >
            <TextWidget
              text={`${data.unreadCount} bildirim`}
              style={{ fontSize: 10, fontWeight: 'bold', color: c.primary }}
            />
          </FlexWidget>
        ) : null}
        <TextWidget
          text={rightText ?? `${data.updated ? data.updated + ' ' : ''}↻`}
          style={{ fontSize: 11, color: c.muted }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

/** 1. Bugün Gelen Para & Trend (3x2 / esnek) */
export function AndroidInflowWidget({
  data,
  palette: c,
  compact,
}: {
  data: WidgetProps;
  palette: WidgetPalette;
  compact?: boolean;
}) {
  const channels = (data.channels || []).slice(0, 3);
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: uriFor(data, 'para-girisleri') }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundGradient: { from: c.bg, to: c.bgEnd, orientation: 'TL_BR' },
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 22,
        padding: 14,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
      accessibilityLabel={`Bugün gelen para ${data.total}`}
    >
      <HeaderBar data={data} c={c} subtitle="Bugün Gelen" />

      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
          marginVertical: 2,
        }}
      >
        <FlexWidget style={{ flexDirection: 'column', flex: 1, paddingRight: 8 }}>
          <TextWidget
            text={data.total}
            maxLines={1}
            style={{ fontSize: compact ? 24 : 28, fontWeight: '800', color: c.text }}
          />
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
            <TextWidget text={data.count} style={{ fontSize: 12, fontWeight: '600', color: c.subtext }} />
            {data.change ? (
              <FlexWidget
                style={{
                  backgroundColor: data.up ? c.primarySoft : c.dangerSoft,
                  borderRadius: 8,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  marginLeft: 6,
                }}
              >
                <TextWidget
                  text={data.change}
                  style={{ fontSize: 10, fontWeight: 'bold', color: data.up ? c.primary : c.danger }}
                />
              </FlexWidget>
            ) : null}
          </FlexWidget>
        </FlexWidget>
        {!data.signedOut ? (
          <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
            <SvgWidget svg={sparklineSvg(data.sparkline, c, 82, 34)} style={{ width: 82, height: 34 }} />
            <TextWidget text="Son 7 gün" style={{ fontSize: 9, color: c.muted, marginTop: 2 }} />
          </FlexWidget>
        ) : null}
      </FlexWidget>

      {!compact ? (
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
          {channels.length > 0 ? (
            <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', marginBottom: 5 }}>
              <SvgWidget svg={channelBarSvg(channels, c, 280, 6)} style={{ width: 'match_parent', height: 6 }} />
              <FlexWidget
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: 'match_parent',
                  marginTop: 5,
                }}
              >
                {channels.slice(0, 2).map((ch) => (
                  <FlexWidget key={ch.key} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <SvgWidget
                      svg={dotSvg(channelColor(c, ch.colorKey), 7)}
                      style={{ width: 7, height: 7, marginRight: 4 }}
                    />
                    <TextWidget
                      text={`${ch.label} ${ch.amount}`}
                      maxLines={1}
                      style={{ fontSize: 11, fontWeight: '600', color: c.subtext }}
                    />
                  </FlexWidget>
                ))}
              </FlexWidget>
            </FlexWidget>
          ) : null}

          <FlexWidget
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: 'match_parent',
            }}
          >
            <TextWidget
              text={
                data.otherCurrencies
                  ? `Döviz: ${data.otherCurrencies}`
                  : data.monthTotal
                    ? `Bu ay: ${data.monthTotal}`
                    : ''
              }
              maxLines={1}
              style={{ fontSize: 11, color: c.muted }}
            />
            {data.waitingCount && data.waitingCount > 0 ? (
              <FlexWidget
                clickAction="OPEN_URI"
                clickActionData={{ uri: uriFor(data, 'havaleler') }}
                style={{
                  backgroundColor: c.warnSoft,
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <TextWidget
                  text={`${data.waitingCount} havale bekliyor`}
                  maxLines={1}
                  style={{ fontSize: 10, fontWeight: 'bold', color: c.warn }}
                />
              </FlexWidget>
            ) : null}
          </FlexWidget>
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

/** 2. Mini Sayaç (2x2) */
export function AndroidCompactWidget({ data, palette: c }: { data: WidgetProps; palette: WidgetPalette }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: uriFor(data, 'para-girisleri') }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundGradient: { from: c.bg, to: c.bgEnd, orientation: 'TL_BR' },
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 22,
        padding: 12,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: 'match_parent' }}>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <SvgWidget svg={crescentSvg(c.primary, c.accent)} style={{ width: 14, height: 14, marginRight: 4 }} />
          <TextWidget text={data.org || 'e-İnfak'} maxLines={1} style={{ fontSize: 11, fontWeight: 'bold', color: c.primary }} />
        </FlexWidget>
        <FlexWidget clickAction="REFRESH">
          <TextWidget text="↻" style={{ fontSize: 12, color: c.muted }} />
        </FlexWidget>
      </FlexWidget>

      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
        <TextWidget text="Bugün" style={{ fontSize: 10, color: c.muted }} />
        <TextWidget text={data.total} maxLines={1} style={{ fontSize: 21, fontWeight: '800', color: c.text }} />
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
          <TextWidget text={data.count} maxLines={1} style={{ fontSize: 11, color: c.subtext }} />
          {data.change ? (
            <TextWidget
              text={` ${data.change}`}
              maxLines={1}
              style={{ fontSize: 10, fontWeight: 'bold', color: data.up ? c.primary : c.danger }}
            />
          ) : null}
        </FlexWidget>
      </FlexWidget>

      {data.waitingCount && data.waitingCount > 0 ? (
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: uriFor(data, 'havaleler') }}
          style={{
            backgroundColor: c.warnSoft,
            borderRadius: 9,
            paddingHorizontal: 8,
            paddingVertical: 4,
            width: 'match_parent',
            alignItems: 'center',
          }}
        >
          <TextWidget
            text={`${data.waitingCount} bekleyen havale`}
            maxLines={1}
            style={{ fontSize: 10, fontWeight: 'bold', color: c.warn }}
          />
        </FlexWidget>
      ) : (
        <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: 'match_parent' }}>
          <TextWidget
            text={data.monthTotal ? `Ay: ${data.monthTotal}` : data.updated}
            maxLines={1}
            style={{ fontSize: 10, color: c.muted }}
          />
          {!data.signedOut ? (
            <SvgWidget svg={sparklineSvg(data.sparkline, c, 46, 16)} style={{ width: 46, height: 16 }} />
          ) : null}
        </FlexWidget>
      )}
    </FlexWidget>
  );
}

/** 3. İkonlu Hızlı İşlemler (4x1 ve dikey genişletilebilir) */
export function AndroidQuickActionsWidget({
  data,
  palette: c,
  tall,
}: {
  data: WidgetProps;
  palette: WidgetPalette;
  tall?: boolean;
}) {
  const actions: Array<{
    label: string;
    path: string;
    icon: 'receipt' | 'qr' | 'bank' | 'search';
    primary?: boolean;
    badge?: number;
  }> = [
    { label: 'Makbuz Kes', path: 'makbuz-kes', icon: 'receipt', primary: true },
    { label: 'Kumbara QR', path: 'kumbara/tara', icon: 'qr' },
    { label: 'Havaleler', path: 'havaleler', icon: 'bank', badge: data.waitingCount || 0 },
    { label: 'Bağışçı Ara', path: 'arama', icon: 'search' },
  ];
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundGradient: { from: c.bg, to: c.bgEnd, orientation: 'TL_BR' },
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 22,
        padding: 10,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: 'match_parent',
          flex: 1,
        }}
      >
        {actions.map((a) => {
          const iconColor: HexColor = a.primary
            ? c.mode === 'dark' && c.bg !== '#064E3B'
              ? '#052E16'
              : '#FFFFFF'
            : c.primary;
          const bgColor: HexColor = a.primary ? c.primary : c.card;
          const textColor: HexColor = a.primary ? iconColor : c.text;
          return (
            <FlexWidget
              key={a.label}
              clickAction="OPEN_URI"
              clickActionData={{ uri: uriFor(data, a.path) }}
              style={{
                flex: 1,
                height: 'match_parent',
                marginHorizontal: 3,
                borderRadius: 15,
                backgroundColor: bgColor,
                borderWidth: a.primary ? 0 : 1,
                borderColor: c.border,
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 4,
                paddingVertical: 6,
              }}
            >
              <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
                <SvgWidget svg={actionIconSvg(a.icon, iconColor)} style={{ width: 18, height: 18 }} />
                {a.badge && a.badge > 0 ? (
                  <FlexWidget
                    style={{
                      backgroundColor: c.warnSoft,
                      borderRadius: 99,
                      paddingHorizontal: 5,
                      paddingVertical: 1,
                      marginLeft: 4,
                    }}
                  >
                    <TextWidget text={`${a.badge}`} style={{ fontSize: 9, fontWeight: 'bold', color: c.warn }} />
                  </FlexWidget>
                ) : null}
              </FlexWidget>
              <TextWidget
                text={a.label}
                maxLines={1}
                style={{ fontSize: 11, fontWeight: 'bold', color: textColor, marginTop: 4 }}
              />
            </FlexWidget>
          );
        })}
      </FlexWidget>

      {tall && !data.signedOut ? (
        <FlexWidget
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: 'match_parent',
            marginTop: 8,
            paddingHorizontal: 4,
          }}
        >
          <TextWidget
            text={`Bugün: ${data.total} (${data.count})`}
            maxLines={1}
            style={{ fontSize: 11, fontWeight: '600', color: c.subtext }}
          />
          <TextWidget
            text={data.waiting || (data.monthTotal ? `Ay: ${data.monthTotal}` : data.updated)}
            maxLines={1}
            style={{ fontSize: 11, fontWeight: 'bold', color: data.waiting ? c.warn : c.muted }}
          />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

/** 4. Bekleyen Havaleler (4x2) */
export function AndroidTransfersWidget({ data, palette: c }: { data: WidgetProps; palette: WidgetPalette }) {
  const items = (data.transfers || []).slice(0, 3);
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: uriFor(data, 'havaleler') }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundGradient: { from: c.bg, to: c.bgEnd, orientation: 'TL_BR' },
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 22,
        padding: 13,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: 'match_parent' }}>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <SvgWidget svg={actionIconSvg('bank', c.warn)} style={{ width: 16, height: 16, marginRight: 6 }} />
          <TextWidget text="Bekleyen Havaleler" style={{ fontSize: 13, fontWeight: 'bold', color: c.text }} />
        </FlexWidget>
        <FlexWidget clickAction="REFRESH" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <FlexWidget
            style={{
              backgroundColor: c.warnSoft,
              borderRadius: 99,
              paddingHorizontal: 8,
              paddingVertical: 2,
              marginRight: 6,
            }}
          >
            <TextWidget
              text={`${data.waitingCount || 0} adet · ${data.waitingTotal || '₺0'}`}
              style={{ fontSize: 10, fontWeight: 'bold', color: c.warn }}
            />
          </FlexWidget>
          <TextWidget text="↻" style={{ fontSize: 12, color: c.muted }} />
        </FlexWidget>
      </FlexWidget>

      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', marginTop: 4 }}>
        {items.length === 0 ? (
          <FlexWidget
            style={{
              backgroundColor: c.card,
              borderRadius: 12,
              paddingVertical: 14,
              paddingHorizontal: 12,
              width: 'match_parent',
              alignItems: 'center',
            }}
          >
            <TextWidget
              text={data.signedOut ? 'Havaleleri görmek için giriş yapın' : 'Tüm banka hareketleri eşleştirildi ✓'}
              style={{ fontSize: 12, fontWeight: '600', color: c.subtext }}
            />
          </FlexWidget>
        ) : (
          items.map((t, idx) => (
            <FlexWidget
              key={`${t.id}-${idx}`}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: 'match_parent',
                backgroundColor: c.card,
                borderRadius: 11,
                paddingHorizontal: 9,
                paddingVertical: 5,
                marginTop: idx === 0 ? 0 : 4,
              }}
            >
              <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 6 }}>
                <FlexWidget
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: t.ambiguous ? c.warnSoft : c.primarySoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 8,
                  }}
                >
                  <TextWidget
                    text={t.initials}
                    style={{ fontSize: 9, fontWeight: 'bold', color: t.ambiguous ? c.warn : c.primary }}
                  />
                </FlexWidget>
                <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
                  <TextWidget text={t.sender} maxLines={1} style={{ fontSize: 12, fontWeight: '600', color: c.text }} />
                  <TextWidget
                    text={`${t.time ? t.time + ' · ' : ''}${t.ambiguous ? 'Şüpheli eşleşme' : 'Onay bekliyor'}`}
                    maxLines={1}
                    style={{ fontSize: 10, color: t.ambiguous ? c.warn : c.muted }}
                  />
                </FlexWidget>
              </FlexWidget>
              <TextWidget text={t.amount} maxLines={1} style={{ fontSize: 12, fontWeight: '800', color: c.primary }} />
            </FlexWidget>
          ))
        )}
      </FlexWidget>
    </FlexWidget>
  );
}

/** 5. Kampanya Hedefi & Görevlerim (4x2) */
export function AndroidTasksGoalsWidget({ data, palette: c }: { data: WidgetProps; palette: WidgetPalette }) {
  const tasks = (data.tasks || []).slice(0, 2);
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: uriFor(data, 'gorevler') }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundGradient: { from: c.bg, to: c.bgEnd, orientation: 'TL_BR' },
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 22,
        padding: 13,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: 'match_parent' }}>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <SvgWidget svg={crescentSvg(c.primary, c.accent)} style={{ width: 14, height: 14, marginRight: 5 }} />
          <TextWidget text="Kampanya & Görevler" style={{ fontSize: 12, fontWeight: 'bold', color: c.primary }} />
        </FlexWidget>
        <FlexWidget clickAction="REFRESH" style={{ flexDirection: 'row', alignItems: 'center' }}>
          {data.tasksOverdue && data.tasksOverdue > 0 ? (
            <FlexWidget
              style={{
                backgroundColor: c.dangerSoft,
                borderRadius: 99,
                paddingHorizontal: 6,
                paddingVertical: 2,
                marginRight: 5,
              }}
            >
              <TextWidget
                text={`${data.tasksOverdue} geciken`}
                style={{ fontSize: 10, fontWeight: 'bold', color: c.danger }}
              />
            </FlexWidget>
          ) : null}
          <TextWidget text={`${data.tasksOpen || 0} açık  ↻`} style={{ fontSize: 11, color: c.muted }} />
        </FlexWidget>
      </FlexWidget>

      {data.campaign ? (
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: uriFor(data, 'kampanyalar') }}
          style={{
            flexDirection: 'column',
            width: 'match_parent',
            backgroundColor: c.card,
            borderRadius: 12,
            paddingHorizontal: 10,
            paddingVertical: 7,
          }}
        >
          <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: 'match_parent' }}>
            <FlexWidget style={{ flex: 1, paddingRight: 6 }}>
              <TextWidget
                text={data.campaign.title}
                maxLines={1}
                style={{ fontSize: 12, fontWeight: 'bold', color: c.text }}
              />
            </FlexWidget>
            <TextWidget
              text={`%${data.campaign.percent}`}
              style={{ fontSize: 12, fontWeight: '800', color: c.primary }}
            />
          </FlexWidget>
          <FlexWidget style={{ width: 'match_parent', marginVertical: 5 }}>
            <SvgWidget
              svg={progressBarSvg(data.campaign.percent, c.primary, c.track, 280, 7)}
              style={{ width: 'match_parent', height: 7 }}
            />
          </FlexWidget>
          <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
            <TextWidget text={data.campaign.summary} maxLines={1} style={{ fontSize: 10, color: c.subtext }} />
            <TextWidget text={`Kalan: ${data.campaign.remaining}`} maxLines={1} style={{ fontSize: 10, color: c.muted }} />
          </FlexWidget>
        </FlexWidget>
      ) : null}

      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
        {tasks.length === 0 ? (
          <TextWidget
            text={data.signedOut ? 'Görmek için giriş yapın' : 'Açık saha/ofis görevi bulunmuyor ✓'}
            style={{ fontSize: 11, color: c.muted }}
          />
        ) : (
          tasks.map((t, idx) => (
            <FlexWidget
              key={`${t.id}-${idx}`}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: 'match_parent',
                marginTop: idx === 0 ? 0 : 3,
              }}
            >
              <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 6 }}>
                <SvgWidget
                  svg={dotSvg(t.overdue ? c.danger : t.inProgress ? c.info : c.primary, 7)}
                  style={{ width: 7, height: 7, marginRight: 6 }}
                />
                <TextWidget
                  text={t.title}
                  maxLines={1}
                  style={{ fontSize: 11, fontWeight: '600', color: t.overdue ? c.danger : c.text }}
                />
              </FlexWidget>
              <TextWidget
                text={t.dueLabel}
                maxLines={1}
                style={{ fontSize: 10, fontWeight: 'bold', color: t.overdue ? c.danger : c.muted }}
              />
            </FlexWidget>
          ))
        )}
      </FlexWidget>
    </FlexWidget>
  );
}

/** 6. YENİ: Yönetici Kokpiti — Tam Özet (4x4 Büyük Widget) */
export function AndroidCockpitWidget({ data, palette: c }: { data: WidgetProps; palette: WidgetPalette }) {
  const channels = (data.channels || []).slice(0, 3);
  const transfers = (data.transfers || []).slice(0, 2);
  const tasks = (data.tasks || []).slice(0, 2);
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: uriFor(data, 'para-girisleri') }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundGradient: { from: c.bg, to: c.bgEnd, orientation: 'TL_BR' },
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 24,
        padding: 14,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <HeaderBar data={data} c={c} subtitle="Yönetici Kokpiti" />

      {/* Üst KPI + 7 Günlük Grafik Kartı */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
          backgroundColor: c.card,
          borderRadius: 16,
          padding: 12,
        }}
      >
        <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
          <TextWidget text="Bugün Tahsilat" style={{ fontSize: 11, color: c.muted }} />
          <TextWidget text={data.total} maxLines={1} style={{ fontSize: 26, fontWeight: '800', color: c.text }} />
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
            <TextWidget text={data.count} style={{ fontSize: 11, fontWeight: '600', color: c.subtext }} />
            {data.change ? (
              <TextWidget
                text={`  ${data.change}`}
                style={{ fontSize: 11, fontWeight: 'bold', color: data.up ? c.primary : c.danger }}
              />
            ) : null}
          </FlexWidget>
          {data.monthTotal ? (
            <TextWidget
              text={`Bu ay: ${data.monthTotal} (${data.monthCount || ''})`}
              maxLines={1}
              style={{ fontSize: 10, color: c.muted, marginTop: 3 }}
            />
          ) : null}
        </FlexWidget>

        <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
          <SvgWidget svg={sparklineSvg(data.sparkline, c, 96, 44)} style={{ width: 96, height: 44 }} />
          <TextWidget
            text={data.weekTotal ? `7g: ${data.weekTotal}` : 'Son 7 gün'}
            maxLines={1}
            style={{ fontSize: 10, color: c.muted, marginTop: 3 }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* Kanal Kırılım Çubuğu */}
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
        <SvgWidget svg={channelBarSvg(channels, c, 300, 7)} style={{ width: 'match_parent', height: 7 }} />
        <FlexWidget
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            width: 'match_parent',
            marginTop: 5,
          }}
        >
          {channels.length === 0 ? (
            <TextWidget text="Bugün henüz kanal girişi yok" style={{ fontSize: 10, color: c.muted }} />
          ) : (
            channels.map((ch) => (
              <FlexWidget key={ch.key} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <SvgWidget
                  svg={dotSvg(channelColor(c, ch.colorKey), 7)}
                  style={{ width: 7, height: 7, marginRight: 4 }}
                />
                <TextWidget
                  text={`${ch.label} %${ch.percent}`}
                  maxLines={1}
                  style={{ fontSize: 10, fontWeight: '600', color: c.subtext }}
                />
              </FlexWidget>
            ))
          )}
        </FlexWidget>
      </FlexWidget>

      {/* Aktif Kampanya İlerleme Kartı */}
      {data.campaign ? (
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: uriFor(data, 'kampanyalar') }}
          style={{
            flexDirection: 'column',
            width: 'match_parent',
            backgroundColor: c.card,
            borderRadius: 14,
            paddingHorizontal: 11,
            paddingVertical: 8,
          }}
        >
          <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
            <FlexWidget style={{ flex: 1, paddingRight: 6 }}>
              <TextWidget
                text={data.campaign.title}
                maxLines={1}
                style={{ fontSize: 11, fontWeight: 'bold', color: c.text }}
              />
            </FlexWidget>
            <TextWidget
              text={`%${data.campaign.percent} · ${data.campaign.summary}`}
              maxLines={1}
              style={{ fontSize: 10, fontWeight: 'bold', color: c.primary }}
            />
          </FlexWidget>
          <FlexWidget style={{ width: 'match_parent', marginTop: 5 }}>
            <SvgWidget
              svg={progressBarSvg(data.campaign.percent, c.primary, c.track, 290, 6)}
              style={{ width: 'match_parent', height: 6 }}
            />
          </FlexWidget>
        </FlexWidget>
      ) : null}

      {/* Alt İki Sütun: Bekleyen Havaleler & Açık Görevler */}
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: uriFor(data, 'havaleler') }}
          style={{
            flex: 1,
            backgroundColor: c.card,
            borderRadius: 14,
            padding: 10,
            marginRight: 4,
            flexDirection: 'column',
          }}
        >
          <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
            <TextWidget text="Havaleler" style={{ fontSize: 11, fontWeight: 'bold', color: c.warn }} />
            <TextWidget text={`${data.waitingCount || 0}`} style={{ fontSize: 11, fontWeight: '800', color: c.warn }} />
          </FlexWidget>
          {transfers.length === 0 ? (
            <TextWidget text="Bekleyen yok ✓" style={{ fontSize: 10, color: c.muted, marginTop: 4 }} />
          ) : (
            transfers.map((t, i) => (
              <TextWidget
                key={`${t.id}-${i}`}
                text={`${t.sender.split(' ')[0]} · ${t.amount}`}
                maxLines={1}
                style={{ fontSize: 10, color: c.subtext, marginTop: 3 }}
              />
            ))
          )}
        </FlexWidget>

        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: uriFor(data, 'gorevler') }}
          style={{
            flex: 1,
            backgroundColor: c.card,
            borderRadius: 14,
            padding: 10,
            marginLeft: 4,
            flexDirection: 'column',
          }}
        >
          <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
            <TextWidget text="Görevler" style={{ fontSize: 11, fontWeight: 'bold', color: c.primary }} />
            <TextWidget
              text={data.tasksOverdue ? `${data.tasksOverdue} geciken` : `${data.tasksOpen || 0}`}
              style={{ fontSize: 10, fontWeight: 'bold', color: data.tasksOverdue ? c.danger : c.muted }}
            />
          </FlexWidget>
          {tasks.length === 0 ? (
            <TextWidget text="Açık görev yok ✓" style={{ fontSize: 10, color: c.muted, marginTop: 4 }} />
          ) : (
            tasks.map((t, i) => (
              <TextWidget
                key={`${t.id}-${i}`}
                text={`${t.overdue ? '! ' : '• '}${t.title}`}
                maxLines={1}
                style={{ fontSize: 10, color: t.overdue ? c.danger : c.subtext, marginTop: 3 }}
              />
            ))
          )}
        </FlexWidget>
      </FlexWidget>

      {/* En Alt Kısayol Çubuğu */}
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: uriFor(data, 'makbuz-kes') }}
          style={{
            flex: 1,
            backgroundColor: c.primary,
            borderRadius: 11,
            paddingVertical: 6,
            marginRight: 4,
            alignItems: 'center',
          }}
        >
          <TextWidget
            text="+ Makbuz Kes"
            style={{
              fontSize: 11,
              fontWeight: 'bold',
              color: c.mode === 'dark' && c.bg !== '#064E3B' ? '#052E16' : '#FFFFFF',
            }}
          />
        </FlexWidget>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: uriFor(data, 'kumbara/tara') }}
          style={{
            flex: 1,
            backgroundColor: c.cardAlt,
            borderRadius: 11,
            paddingVertical: 6,
            marginLeft: 4,
            alignItems: 'center',
          }}
        >
          <TextWidget text="Kumbara QR Tara" style={{ fontSize: 11, fontWeight: 'bold', color: c.text }} />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
