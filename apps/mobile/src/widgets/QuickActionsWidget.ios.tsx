import { HStack, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, lineLimit, padding, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';
import type { WidgetProps } from './data';

function QuickActionsWidget(props: WidgetProps) {
  'widget';
  const dark = !!props.dark;
  const bg = dark ? '#0F172A' : '#FFFFFF';
  const green = dark ? '#34D399' : '#059669';
  const fg = dark ? '#F8FAFC' : '#0E1B17';
  const muted = dark ? '#94A3B8' : '#5B6B66';
  if (props.signedOut) {
    return (
      <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 4 }), containerBackground(bg, 'widget'), widgetURL('einfak://login')]}>
        <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(green)]}>e-İnfak Hızlı İşlemler</Text>
        <Spacer />
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(muted)]}>Oturum açın</Text>
      </VStack>
    );
  }
  return (
    <VStack alignment="leading" spacing={8} modifiers={[padding({ all: 4 }), containerBackground(bg, 'widget'), widgetURL('einfak://makbuz-kes')]}>
      <HStack spacing={4}>
        <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(green)]}>e-İnfak Hızlı İşlemler</Text>
        <Spacer />
        <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>{props.org || ''}</Text>
      </HStack>
      <HStack spacing={10}>
        <Link label="+ Makbuz Kes" destination="einfak://makbuz-kes" modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(green), lineLimit(1)]} />
        <Spacer />
        <Link label="Kumbara QR" destination="einfak://kumbara" modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(fg), lineLimit(1)]} />
        <Spacer />
        <Link label="Havaleler" destination="einfak://havaleler" modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(fg), lineLimit(1)]} />
      </HStack>
      <Text modifiers={[font({ size: 11 }), foregroundStyle(muted), lineLimit(1)]}>
        {props.waiting || `Bugün: ${props.total || '—'}`}
      </Text>
    </VStack>
  );
}

export default createWidget<WidgetProps>('EinfakQuickActions', QuickActionsWidget);
