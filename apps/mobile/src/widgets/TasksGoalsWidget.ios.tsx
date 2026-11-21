import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, lineLimit, padding, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';
import type { WidgetProps } from './data';

function TasksGoalsWidget(props: WidgetProps) {
  'widget';
  const dark = !!props.dark;
  const bg = dark ? '#0F172A' : '#FFFFFF';
  const green = dark ? '#34D399' : '#059669';
  const fg = dark ? '#F8FAFC' : '#0E1B17';
  const muted = dark ? '#94A3B8' : '#5B6B66';
  const danger = dark ? '#F87171' : '#DC2626';
  const tasks = (props.tasks || []).slice(0, 3);
  if (props.signedOut) {
    return (
      <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 4 }), containerBackground(bg, 'widget'), widgetURL('einfak://login')]}>
        <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(green)]}>Kampanya & Görevler</Text>
        <Spacer />
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(muted)]}>Oturum açın</Text>
      </VStack>
    );
  }
  return (
    <VStack alignment="leading" spacing={4} modifiers={[padding({ all: 4 }), containerBackground(bg, 'widget'), widgetURL('einfak://gorevler')]}>
      <HStack spacing={4}>
        <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(green)]}>Kampanya & Görevler</Text>
        <Spacer />
        <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>{`${props.tasksOpen || 0} görev`}</Text>
      </HStack>
      {props.campaign ? (
        <HStack spacing={4}>
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(fg), lineLimit(1)]}>{props.campaign.title}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(green)]}>{`%${props.campaign.percent}`}</Text>
        </HStack>
      ) : null}
      <Spacer />
      {tasks.length === 0 ? (
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>Açık görev bulunmuyor ✓</Text>
      ) : (
        tasks.map((t, idx) => (
          <Text key={`${t.title}-${idx}`} modifiers={[font({ size: 11 }), foregroundStyle(t.overdue ? danger : fg), lineLimit(1)]}>
            {`${t.overdue ? '!' : '•'} ${t.title}`}
          </Text>
        ))
      )}
    </VStack>
  );
}

export default createWidget<WidgetProps>('EinfakTasksGoals', TasksGoalsWidget);
