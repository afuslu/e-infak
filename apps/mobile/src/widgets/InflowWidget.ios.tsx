import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, lineLimit, minimumScaleFactor, padding, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { WidgetProps } from './data';

/** iOS ana ekran ve kilit ekranı widget'ı: bugün gelen para. Veriyi uygulama gönderir (updateSnapshot). */
function InflowWidget(props: WidgetProps, environment: WidgetEnvironment) {
  'widget';
  const green = '#059669';
  const muted = '#5B6B66';
  const total = props.total || '—';
  if (environment.widgetFamily === 'accessoryRectangular' || environment.widgetFamily === 'accessoryInline') {
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL('einfak://para-girisleri')]}>
        <Text modifiers={[font({ size: 12, weight: 'semibold' })]}>Bugün gelen para</Text>
        <Text modifiers={[font({ size: 18, weight: 'bold' }), minimumScaleFactor(0.6)]}>{total}</Text>
        <Text modifiers={[font({ size: 11 })]}>{props.count || ''}</Text>
      </VStack>
    );
  }
  const small = environment.widgetFamily === 'systemSmall';
  const lines = (props.lines || []).slice(0, small ? 2 : 3);
  return (
    <VStack alignment="leading" spacing={4} modifiers={[
      padding({ all: small ? 2 : 4 }),
      containerBackground('#FFFFFF', 'widget'),
      widgetURL('einfak://para-girisleri'),
    ]}>
      <HStack spacing={4}>
        <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(green), lineLimit(1)]}>{props.org || 'e-İnfak'}</Text>
        <Spacer />
        <Text modifiers={[font({ size: 10 }), foregroundStyle(muted)]}>{props.updated || ''}</Text>
      </HStack>
      <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>Bugün gelen para</Text>
      <Text modifiers={[font({ size: small ? 24 : 28, weight: 'heavy' }), foregroundStyle('#0E1B17'), minimumScaleFactor(0.5), lineLimit(1)]}>{total}</Text>
      <HStack spacing={6}>
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle('#0E1B17')]}>{props.count || ''}</Text>
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(props.up ? green : '#DC2626')]}>{props.change || ''}</Text>
      </HStack>
      <Spacer />
      {lines.map((line) => (
        <Text key={line} modifiers={[font({ size: 11 }), foregroundStyle(muted), lineLimit(1)]}>{line}</Text>
      ))}
      {props.waiting ? <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle('#B45309'), lineLimit(1)]}>{props.waiting}</Text> : null}
    </VStack>
  );
}

export default createWidget<WidgetProps>('EinfakInflow', InflowWidget);
