'use no memo';
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetProps } from './data';

/** Android ana ekran widget'ı: bugün gelen para. Dokununca "Para girişleri" açılır. */
export function AndroidInflowWidget({ data, compact }: { data: WidgetProps; compact?: boolean }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: data.signedOut ? 'einfak://login' : 'einfak://para-girisleri' }}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: '#FFFFFF', borderRadius: 20, padding: 14, flexDirection: 'column', justifyContent: 'space-between' }}
      accessibilityLabel={`Bugün gelen para ${data.total}`}
    >
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
        <TextWidget text={data.org} maxLines={1} style={{ fontSize: 12, fontWeight: 'bold', color: '#059669' }} />
        <TextWidget text={data.updated} style={{ fontSize: 11, color: '#8A9792' }} />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'column' }}>
        <TextWidget text="Bugün gelen para" style={{ fontSize: 12, color: '#5B6B66' }} />
        <TextWidget text={data.total} maxLines={1} style={{ fontSize: compact ? 24 : 30, fontWeight: '800', color: '#0E1B17' }} />
        <FlexWidget style={{ flexDirection: 'row' }}>
          <TextWidget text={data.count} style={{ fontSize: 12, fontWeight: '600', color: '#0E1B17' }} />
          {data.change ? (
            <TextWidget text={`  ${data.change}`} style={{ fontSize: 12, fontWeight: '600', color: data.up ? '#059669' : '#DC2626' }} />
          ) : null}
        </FlexWidget>
      </FlexWidget>
      {!compact ? (
        <FlexWidget style={{ flexDirection: 'column' }}>
          {data.lines.map((line) => <TextWidget key={line} text={line} maxLines={1} style={{ fontSize: 12, color: '#5B6B66' }} />)}
          {data.waiting ? <TextWidget text={data.waiting} style={{ fontSize: 12, fontWeight: 'bold', color: '#B45309' }} /> : null}
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}
