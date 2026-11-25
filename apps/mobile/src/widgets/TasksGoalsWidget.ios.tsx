import { Gauge, HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  containerBackground,
  font,
  foregroundStyle,
  gaugeStyle,
  lineLimit,
  padding,
  progressViewStyle,
  shapes,
  tint,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { WidgetProps } from './data';

function TasksGoalsWidget(props: WidgetProps, environment: WidgetEnvironment) {
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
      danger: '#DC2626',
      dangerSoft: '#FEE2E2',
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
      danger: '#B91C1C',
      dangerSoft: '#FEE2E2',
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
      danger: '#F87171',
      dangerSoft: '#3B181E',
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
      danger: '#FCA5A5',
      dangerSoft: '#4C1D24',
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
      danger: '#EF4444',
      dangerSoft: '#2B0B0E',
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

  if (environment.widgetFamily === 'accessoryCircular') {
    const pct = props.campaign ? Math.max(0, Math.min(100, props.campaign.percent)) : 0;
    return (
      <Gauge
        value={pct / 100}
        min={0}
        max={1}
        currentValueLabel={<Text modifiers={[font({ size: 11, weight: 'bold' })]}>{`%${pct}`}</Text>}
        modifiers={[gaugeStyle('circularCapacity'), widgetURL(`${scheme}://kampanyalar`)]}
      >
        <Text modifiers={[font({ size: 8 })]}>Hedef</Text>
      </Gauge>
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
          <Image systemName="target" size={13} color={c.primary} />
          <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(c.primary)]}>Kampanya & Görevler</Text>
        </HStack>
        <Spacer />
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(c.muted)]}>Oturum açın</Text>
      </VStack>
    );
  }

  if (environment.widgetFamily === 'systemSmall') {
    const pct = props.campaign ? props.campaign.percent : 0;
    return (
      <VStack
        alignment="leading"
        spacing={5}
        modifiers={[
          padding({ all: 2 }),
          containerBackground(bgGradient, 'widget'),
          widgetURL(`${scheme}://${props.campaign ? 'kampanyalar' : 'gorevler'}`),
        ]}
      >
        <HStack spacing={4}>
          <Image systemName="target" size={11} color={c.primary} />
          <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(c.primary)]}>Hedef</Text>
          <Spacer />
          <Text modifiers={[font({ size: 10, weight: 'bold' }), foregroundStyle(c.fg)]}>{`%${pct}`}</Text>
        </HStack>
        <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(c.fg), lineLimit(2)]}>
          {props.campaign ? props.campaign.title : 'Aktif kampanya yok'}
        </Text>
        {props.campaign ? (
          <ProgressView
            value={Math.max(0, Math.min(1, pct / 100))}
            modifiers={[progressViewStyle('linear'), tint(c.primary)]}
          />
        ) : null}
        <Spacer />
        <Text
          modifiers={[
            font({ size: 10, weight: 'semibold' }),
            foregroundStyle(props.tasksOverdue ? c.danger : c.muted),
            lineLimit(1),
          ]}
        >
          {props.tasksOverdue
            ? `${props.tasksOverdue} geciken görev!`
            : `${props.tasksOpen || 0} açık görev`}
        </Text>
      </VStack>
    );
  }

  const tasks = (props.tasks || []).slice(0, 2);

  return (
    <VStack
      alignment="leading"
      spacing={5}
      modifiers={[
        padding({ all: 4 }),
        containerBackground(bgGradient, 'widget'),
        widgetURL(`${scheme}://gorevler`),
      ]}
    >
      <HStack spacing={5}>
        <Image systemName="target" size={13} color={c.primary} />
        <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(c.primary)]}>Kampanya & Görevler</Text>
        <Spacer />
        {props.tasksOverdue && props.tasksOverdue > 0 ? (
          <Text
            modifiers={[
              font({ size: 10, weight: 'bold' }),
              foregroundStyle(c.danger),
              padding({ horizontal: 6, vertical: 1 }),
              background(c.dangerSoft, shapes.capsule()),
            ]}
          >
            {`${props.tasksOverdue} geciken`}
          </Text>
        ) : null}
        <Text modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle(c.muted)]}>
          {`${props.tasksOpen || 0} görev`}
        </Text>
      </HStack>

      {props.campaign ? (
        <VStack
          alignment="leading"
          spacing={3}
          modifiers={[
            padding({ horizontal: 9, vertical: 6 }),
            background(c.card, shapes.roundedRectangle({ cornerRadius: 10 })),
          ]}
        >
          <HStack spacing={4}>
            <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(c.fg), lineLimit(1)]}>
              {props.campaign.title}
            </Text>
            <Spacer />
            <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundStyle(c.primary)]}>
              {`%${props.campaign.percent}`}
            </Text>
          </HStack>
          <ProgressView
            value={Math.max(0, Math.min(1, props.campaign.percent / 100))}
            modifiers={[progressViewStyle('linear'), tint(c.primary)]}
          />
          <HStack spacing={4}>
            <Text modifiers={[font({ size: 9 }), foregroundStyle(c.sub), lineLimit(1)]}>
              {props.campaign.summary}
            </Text>
            <Spacer />
            <Text modifiers={[font({ size: 9 }), foregroundStyle(c.muted), lineLimit(1)]}>
              {`Kalan: ${props.campaign.remaining}`}
            </Text>
          </HStack>
        </VStack>
      ) : null}

      <Spacer />

      {tasks.length === 0 ? (
        <Text modifiers={[font({ size: 11 }), foregroundStyle(c.muted)]}>Açık görev bulunmuyor ✓</Text>
      ) : (
        tasks.map((t, idx) => (
          <HStack key={`${t.id}-${idx}`} spacing={5}>
            <Image
              systemName={t.overdue ? 'exclamationmark.circle.fill' : 'circle.inset.filled'}
              size={10}
              color={t.overdue ? c.danger : c.primary}
            />
            <Text
              modifiers={[
                font({ size: 11, weight: 'medium' }),
                foregroundStyle(t.overdue ? c.danger : c.fg),
                lineLimit(1),
              ]}
            >
              {t.title}
            </Text>
            <Spacer />
            <Text
              modifiers={[
                font({ size: 9, weight: 'bold' }),
                foregroundStyle(t.overdue ? c.danger : c.muted),
                lineLimit(1),
              ]}
            >
              {t.dueLabel}
            </Text>
          </HStack>
        ))
      )}
    </VStack>
  );
}

export default createWidget<WidgetProps>('EinfakTasksGoals', TasksGoalsWidget);
