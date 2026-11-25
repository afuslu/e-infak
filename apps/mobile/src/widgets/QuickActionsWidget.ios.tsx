import { HStack, Image, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  shapes,
  widgetAccentedRenderingMode,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { WidgetProps } from './data';

function QuickActionsWidget(props: WidgetProps, environment: WidgetEnvironment) {
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
  const org = props.org || 'e-İnfak';
  const bgGradient = {
    type: 'linearGradient' as const,
    colors: [c.bg, c.bgEnd],
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 1, y: 1 },
  };

  if (props.signedOut) {
    return (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[padding({ all: 4 }), containerBackground(bgGradient, 'widget'), widgetURL(`${scheme}://login`)]}
      >
        <HStack spacing={5}>
          <Image systemName="bolt.circle.fill" size={13} color={c.primary} />
          <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(c.primary)]}>{`${org} · Hızlı İşlemler`}</Text>
        </HStack>
        <Spacer />
        <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundStyle(c.fg)]}>Kısayollar İçin Giriş Yapın</Text>
      </VStack>
    );
  }

  return (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[
        padding({ all: 4 }),
        containerBackground(bgGradient, 'widget'),
        widgetURL(`${scheme}://makbuz-kes`),
      ]}
    >
      <HStack spacing={5}>
        <Image
          systemName="moon.stars.fill"
          size={12}
          color={c.primary}
          modifiers={[widgetAccentedRenderingMode('accented')]}
        />
        <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(c.primary), lineLimit(1)]}>
          {`${org} · Hızlı İşlemler`}
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(c.sub), lineLimit(1)]}>
          {`Bugün: ${props.total || '—'}`}
        </Text>
      </HStack>

      <HStack spacing={8}>
        <Link destination={`${scheme}://makbuz-kes`}>
          <VStack
            spacing={5}
            modifiers={[
              padding({ vertical: 10, horizontal: 6 }),
              frame({ maxWidth: 999 }),
              background(c.primarySoft, shapes.roundedRectangle({ cornerRadius: 13 })),
            ]}
          >
            <Image systemName="doc.badge.plus" size={18} color={c.primary} />
            <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(c.primary), lineLimit(1)]}>
              Makbuz Kes
            </Text>
          </VStack>
        </Link>

        <Link destination={`${scheme}://kumbara/tara`}>
          <VStack
            spacing={5}
            modifiers={[
              padding({ vertical: 10, horizontal: 6 }),
              frame({ maxWidth: 999 }),
              background(c.card, shapes.roundedRectangle({ cornerRadius: 13 })),
            ]}
          >
            <Image systemName="qrcode.viewfinder" size={18} color={c.fg} />
            <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(c.fg), lineLimit(1)]}>
              Kumbara QR
            </Text>
          </VStack>
        </Link>

        <Link destination={`${scheme}://havaleler`}>
          <VStack
            spacing={5}
            modifiers={[
              padding({ vertical: 10, horizontal: 6 }),
              frame({ maxWidth: 999 }),
              background(props.waitingCount ? c.warnSoft : c.card, shapes.roundedRectangle({ cornerRadius: 13 })),
            ]}
          >
            <Image
              systemName="arrow.left.arrow.right.circle.fill"
              size={18}
              color={props.waitingCount ? c.warn : c.fg}
            />
            <Text
              modifiers={[
                font({ size: 11, weight: 'semibold' }),
                foregroundStyle(props.waitingCount ? c.warn : c.fg),
                lineLimit(1),
              ]}
            >
              {props.waitingCount ? `Havale (${props.waitingCount})` : 'Havaleler'}
            </Text>
          </VStack>
        </Link>

        <Link destination={`${scheme}://arama`}>
          <VStack
            spacing={5}
            modifiers={[
              padding({ vertical: 10, horizontal: 6 }),
              frame({ maxWidth: 999 }),
              background(c.card, shapes.roundedRectangle({ cornerRadius: 13 })),
            ]}
          >
            <Image systemName="magnifyingglass" size={18} color={c.fg} />
            <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(c.fg), lineLimit(1)]}>
              Bağışçı Ara
            </Text>
          </VStack>
        </Link>
      </HStack>

      <HStack spacing={4}>
        <Text modifiers={[font({ size: 10 }), foregroundStyle(c.muted), lineLimit(1)]}>
          {props.waiting || `${props.count || ''} · ${props.monthTotal ? 'Bu ay ' + props.monthTotal : ''}`}
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 10 }), foregroundStyle(c.muted)]}>{props.updated || ''}</Text>
      </HStack>
    </VStack>
  );
}

export default createWidget<WidgetProps>('EinfakQuickActions', QuickActionsWidget);
