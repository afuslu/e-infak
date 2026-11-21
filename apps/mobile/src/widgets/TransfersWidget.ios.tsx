import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, lineLimit, padding, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';
import type { WidgetProps } from './data';

function TransfersWidget(props: WidgetProps) {
  'widget';
  const dark = !!props.dark;
  const bg = dark ? '#0F172A' : '#FFFFFF';
  const green = dark ? '#34D399' : '#059669';
  const fg = dark ? '#F8FAFC' : '#0E1B17';
  const muted = dark ? '#94A3B8' : '#5B6B66';
  const warn = dark ? '#FCD34D' : '#B45309';
  const items = (props.transfers || []).slice(0, 3);
  if (props.signedOut) {
    return (
      <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 4 }), containerBackground(bg, 'widget'), widgetURL('einfak://login')]}>
        <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(warn)]}>Bekleyen Havaleler</Text>
        <Spacer />
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(muted)]}>Oturum açın</Text>
      </VStack>
    );
  }
  return (
    <VStack alignment="leading" spacing={4} modifiers={[padding({ all: 4 }), containerBackground(bg, 'widget'), widgetURL('einfak://havaleler')]}>
      <HStack spacing={4}>
        <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(warn)]}>Bekleyen Havaleler</Text>
        <Spacer />
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(muted)]}>{`${props.waitingCount || 0} adet`}</Text>
      </HStack>
      <Text modifiers={[font({ size: 18, weight: 'heavy' }), foregroundStyle(fg)]}>{props.waitingTotal || '₺0'}</Text>
      <Spacer />
      {items.length === 0 ? (
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>Bekleyen havale yok ✓</Text>
      ) : (
        items.map((t, idx) => (
          <HStack key={`${t.sender}-${idx}`} spacing={4}>
            <Text modifiers={[font({ size: 11 }), foregroundStyle(fg), lineLimit(1)]}>{t.sender}</Text>
            <Spacer />
            <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(green)]}>{t.amount}</Text>
          </HStack>
        ))
      )}
    </VStack>
  );
}

export default createWidget<WidgetProps>('EinfakTransfers', TransfersWidget);
