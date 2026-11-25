import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  padding,
  shapes,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { WidgetProps } from './data';

function TransfersWidget(props: WidgetProps, environment: WidgetEnvironment) {
  'widget';
  const style = props.themeStyle || 'system';
  const sysDark = environment.colorScheme ? environment.colorScheme === 'dark' : !!props.dark;
  const modeKey = style === 'system' ? (sysDark ? 'dark' : 'light') : style;

  const themes = {
    light: {
      bg: '#FFFFFF',
      bgEnd: '#F2F8F5',
      card: '#EEF5F2',
      primary: props.brandPrimary || '#059669',
      primarySoft: '#DCFCE7',
      fg: '#0B1915',
      sub: '#334842',
      muted: '#647A73',
      warn: '#B45309',
      warnSoft: '#FEF3C7',
    },
    warm: {
      bg: '#FCF9F2',
      bgEnd: '#F4EFE3',
      card: '#EFE9DC',
      primary: props.brandPrimary || '#047857',
      primarySoft: '#D8F3E5',
      fg: '#1C1917',
      sub: '#44403C',
      muted: '#78716C',
      warn: '#9A3412',
      warnSoft: '#FFEDD5',
    },
    dark: {
      bg: '#0F172A',
      bgEnd: '#090F1D',
      card: '#182438',
      primary: '#34D399',
      primarySoft: '#0D332B',
      fg: '#F8FAFC',
      sub: '#CBD5E1',
      muted: '#8DA0B8',
      warn: '#FBBF24',
      warnSoft: '#3B2A0E',
    },
    emerald: {
      bg: '#064E3B',
      bgEnd: '#032B22',
      card: '#0A5E48',
      primary: '#6EE7B7',
      primarySoft: '#053F31',
      fg: '#F0FDF4',
      sub: '#CCFBF1',
      muted: '#99E6D4',
      warn: '#FDE68A',
      warnSoft: '#3D3511',
    },
    amoled: {
      bg: '#000000',
      bgEnd: '#050807',
      card: '#121817',
      primary: '#10B981',
      primarySoft: '#07291E',
      fg: '#FFFFFF',
      sub: '#D1FAE5',
      muted: '#869690',
      warn: '#F59E0B',
      warnSoft: '#291B05',
    },
  };

  const c = themes[modeKey] || themes.light;
  const scheme = props.scheme || 'einfak';
  const bgGradient = {
    type: 'linearGradient' as const,
    colors: [c.bg, c.bgEnd],
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 1, y: 1 },
  };

  if (environment.widgetFamily === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={2} modifiers={[widgetURL(`${scheme}://havaleler`)]}>
        <Text modifiers={[font({ size: 11, weight: 'bold' })]}>Bekleyen Havaleler</Text>
        <Text modifiers={[font({ size: 17, weight: 'heavy' }), minimumScaleFactor(0.6)]}>
          {`${props.waitingCount || 0} adet · ${props.waitingTotal || '₺0'}`}
        </Text>
        <Text modifiers={[font({ size: 11 }), lineLimit(1)]}>
          {props.transfers && props.transfers[0]
            ? `${props.transfers[0].sender} (${props.transfers[0].amount})`
            : 'Tüm hareketler eşleşti ✓'}
        </Text>
      </VStack>
    );
  }

  if (props.signedOut) {
    return (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[padding({ all: 4 }), containerBackground(bgGradient, 'widget'), widgetURL(`${scheme}://login`)]}
      >
        <HStack spacing={4}>
          <Image systemName="arrow.left.arrow.right.circle.fill" size={13} color={c.warn} />
          <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(c.warn)]}>Bekleyen Havaleler</Text>
        </HStack>
        <Spacer />
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(c.muted)]}>Oturum açın</Text>
      </VStack>
    );
  }

  const small = environment.widgetFamily === 'systemSmall';
  const items = (props.transfers || []).slice(0, small ? 2 : 3);

  if (small) {
    return (
      <VStack
        alignment="leading"
        spacing={4}
        modifiers={[
          padding({ all: 2 }),
          containerBackground(bgGradient, 'widget'),
          widgetURL(`${scheme}://havaleler`),
        ]}
      >
        <HStack spacing={4}>
          <Image systemName="arrow.left.arrow.right.circle.fill" size={11} color={c.warn} />
          <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(c.warn), lineLimit(1)]}>Havaleler</Text>
          <Spacer />
          <Text modifiers={[font({ size: 10, weight: 'bold' }), foregroundStyle(c.muted)]}>
            {`${props.waitingCount || 0}`}
          </Text>
        </HStack>
        <Text
          modifiers={[
            font({ size: 20, weight: 'heavy' }),
            foregroundStyle(c.fg),
            minimumScaleFactor(0.6),
            lineLimit(1),
          ]}
        >
          {props.waitingTotal || '₺0'}
        </Text>
        <Spacer />
        {items.length === 0 ? (
          <Text modifiers={[font({ size: 11 }), foregroundStyle(c.muted)]}>Bekleyen yok ✓</Text>
        ) : (
          items.map((t, idx) => (
            <HStack key={`${t.id}-${idx}`} spacing={3}>
              <Text modifiers={[font({ size: 10 }), foregroundStyle(c.sub), lineLimit(1)]}>
                {t.sender.split(' ')[0]}
              </Text>
              <Spacer />
              <Text modifiers={[font({ size: 10, weight: 'bold' }), foregroundStyle(c.primary), lineLimit(1)]}>
                {t.amount}
              </Text>
            </HStack>
          ))
        )}
      </VStack>
    );
  }

  return (
    <VStack
      alignment="leading"
      spacing={5}
      modifiers={[
        padding({ all: 4 }),
        containerBackground(bgGradient, 'widget'),
        widgetURL(`${scheme}://havaleler`),
      ]}
    >
      <HStack spacing={5}>
        <Image systemName="arrow.left.arrow.right.circle.fill" size={13} color={c.warn} />
        <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(c.fg)]}>Bekleyen Havaleler</Text>
        <Spacer />
        <Text
          modifiers={[
            font({ size: 10, weight: 'bold' }),
            foregroundStyle(c.warn),
            padding({ horizontal: 7, vertical: 2 }),
            background(c.warnSoft, shapes.capsule()),
          ]}
        >
          {`${props.waitingCount || 0} adet · ${props.waitingTotal || '₺0'}`}
        </Text>
      </HStack>

      <Spacer />

      {items.length === 0 ? (
        <HStack
          spacing={6}
          modifiers={[
            padding({ all: 10 }),
            frame({ maxWidth: 999 }),
            background(c.card, shapes.roundedRectangle({ cornerRadius: 11 })),
          ]}
        >
          <Image systemName="checkmark.seal.fill" size={14} color={c.primary} />
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(c.sub)]}>
            Tüm banka hareketleri eşleştirildi
          </Text>
        </HStack>
      ) : (
        items.map((t, idx) => (
          <HStack
            key={`${t.id}-${idx}`}
            spacing={7}
            modifiers={[
              padding({ horizontal: 8, vertical: 5 }),
              background(c.card, shapes.roundedRectangle({ cornerRadius: 9 })),
            ]}
          >
            <Text
              modifiers={[
                font({ size: 9, weight: 'bold' }),
                foregroundStyle(t.ambiguous ? c.warn : c.primary),
                padding({ horizontal: 5, vertical: 3 }),
                background(t.ambiguous ? c.warnSoft : c.primarySoft, shapes.circle()),
              ]}
            >
              {t.initials}
            </Text>
            <VStack alignment="leading" spacing={1}>
              <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(c.fg), lineLimit(1)]}>
                {t.sender}
              </Text>
              <Text modifiers={[font({ size: 9 }), foregroundStyle(t.ambiguous ? c.warn : c.muted), lineLimit(1)]}>
                {`${t.time ? t.time + ' · ' : ''}${t.ambiguous ? 'Şüpheli' : 'Bekliyor'}`}
              </Text>
            </VStack>
            <Spacer />
            <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundStyle(c.primary), lineLimit(1)]}>
              {t.amount}
            </Text>
          </HStack>
        ))
      )}
    </VStack>
  );
}

export default createWidget<WidgetProps>('EinfakTransfers', TransfersWidget);
