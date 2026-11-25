import {
  Capsule,
  Circle,
  Gauge,
  HStack,
  Image,
  Link,
  ProgressView,
  RoundedRectangle,
  Spacer,
  Text,
  VStack,
} from '@expo/ui/swift-ui';
import {
  background,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  gaugeStyle,
  lineLimit,
  minimumScaleFactor,
  padding,
  progressViewStyle,
  shapes,
  tint,
  widgetAccentedRenderingMode,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { WidgetProps } from './data';

/**
 * iOS Ana Ekran (Küçük 2x2, Orta 4x2, Büyük 4x4 Yönetici Kokpiti)
 * ve Kilit Ekranı (Yuvarlak, Dikdörtgen, Üst Satır) widget'ı.
 */
function InflowWidget(props: WidgetProps, environment: WidgetEnvironment) {
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
      accent: '#0D9488',
      fg: '#0B1915',
      sub: '#334842',
      muted: '#647A73',
      warn: '#B45309',
      warnSoft: '#FEF3C7',
      danger: '#DC2626',
      dangerSoft: '#FEE2E2',
      info: '#2563EB',
      violet: '#7C3AED',
      barIdle: '#CBD5E1',
    },
    warm: {
      bg: '#FCF9F2',
      bgEnd: '#F4EFE3',
      card: '#EFE9DC',
      primary: props.brandPrimary || '#047857',
      primarySoft: '#D8F3E5',
      accent: '#0F766E',
      fg: '#1C1917',
      sub: '#44403C',
      muted: '#78716C',
      warn: '#9A3412',
      warnSoft: '#FFEDD5',
      danger: '#B91C1C',
      dangerSoft: '#FEE2E2',
      info: '#1D4ED8',
      violet: '#6D28D9',
      barIdle: '#D6CFC2',
    },
    dark: {
      bg: '#0F172A',
      bgEnd: '#090F1D',
      card: '#182438',
      primary: '#34D399',
      primarySoft: '#0D332B',
      accent: '#2DD4BF',
      fg: '#F8FAFC',
      sub: '#CBD5E1',
      muted: '#8DA0B8',
      warn: '#FBBF24',
      warnSoft: '#3B2A0E',
      danger: '#F87171',
      dangerSoft: '#3B181E',
      info: '#60A5FA',
      violet: '#A78BFA',
      barIdle: '#334155',
    },
    emerald: {
      bg: '#064E3B',
      bgEnd: '#032B22',
      card: '#0A5E48',
      primary: '#6EE7B7',
      primarySoft: '#053F31',
      accent: '#5EEAD4',
      fg: '#F0FDF4',
      sub: '#CCFBF1',
      muted: '#99E6D4',
      warn: '#FDE68A',
      warnSoft: '#3D3511',
      danger: '#FCA5A5',
      dangerSoft: '#4C1D24',
      info: '#93C5FD',
      violet: '#C4B5FD',
      barIdle: '#117A5E',
    },
    amoled: {
      bg: '#000000',
      bgEnd: '#050807',
      card: '#121817',
      primary: '#10B981',
      primarySoft: '#07291E',
      accent: '#14B8A6',
      fg: '#FFFFFF',
      sub: '#D1FAE5',
      muted: '#869690',
      warn: '#F59E0B',
      warnSoft: '#291B05',
      danger: '#EF4444',
      dangerSoft: '#2B0B0E',
      info: '#3B82F6',
      violet: '#8B5CF6',
      barIdle: '#24302D',
    },
  };

  const c = themes[modeKey] || themes.light;
  const scheme = props.scheme || 'einfak';
  const total = props.total || '—';
  const org = props.org || 'e-İnfak';
  const bgGradient = {
    type: 'linearGradient' as const,
    colors: [c.bg, c.bgEnd],
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 1, y: 1 },
  };

  // Kilit Ekranı: Üst satır (Saat üstü tek satır)
  if (environment.widgetFamily === 'accessoryInline') {
    return (
      <HStack spacing={4} modifiers={[widgetURL(`${scheme}://${props.signedOut ? 'login' : 'para-girisleri'}`)]}>
        <Image systemName="moon.stars.fill" size={12} />
        <Text>{props.signedOut ? `${org} · Giriş yapın` : `${total} · ${props.count || ''}`}</Text>
      </HStack>
    );
  }

  // Kilit Ekranı: Yuvarlak halka sayaç
  if (environment.widgetFamily === 'accessoryCircular') {
    const pct = props.campaign ? Math.max(0, Math.min(100, props.campaign.percent)) : 100;
    return (
      <Gauge
        value={pct / 100}
        min={0}
        max={1}
        currentValueLabel={
          <Text modifiers={[font({ size: 11, weight: 'bold' }), minimumScaleFactor(0.6)]}>
            {props.campaign ? `%${pct}` : props.count ? props.count.split(' ')[0] : '0'}
          </Text>
        }
        modifiers={[
          gaugeStyle('circularCapacity'),
          widgetURL(`${scheme}://${props.signedOut ? 'login' : props.campaign ? 'kampanyalar' : 'para-girisleri'}`),
        ]}
      >
        <Text modifiers={[font({ size: 8, weight: 'semibold' })]}>e-İnfak</Text>
      </Gauge>
    );
  }

  // Kilit Ekranı: Dikdörtgen özet kartı
  if (environment.widgetFamily === 'accessoryRectangular') {
    return (
      <VStack
        alignment="leading"
        spacing={2}
        modifiers={[widgetURL(`${scheme}://${props.signedOut ? 'login' : 'para-girisleri'}`)]}
      >
        <HStack spacing={4}>
          <Image systemName="moon.stars.fill" size={11} />
          <Text modifiers={[font({ size: 11, weight: 'bold' }), lineLimit(1)]}>{`${org} · Bugün`}</Text>
        </HStack>
        <Text modifiers={[font({ size: 18, weight: 'heavy' }), minimumScaleFactor(0.6), lineLimit(1)]}>
          {props.signedOut ? 'Oturum açın' : total}
        </Text>
        <Text modifiers={[font({ size: 11 }), lineLimit(1)]}>
          {props.waiting || `${props.count || ''} ${props.change || ''}`.trim()}
        </Text>
      </VStack>
    );
  }

  // Oturum kapalı görünümü
  if (props.signedOut) {
    return (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[padding({ all: 4 }), containerBackground(bgGradient, 'widget'), widgetURL(`${scheme}://login`)]}
      >
        <HStack spacing={5}>
          <Image
            systemName="moon.stars.fill"
            size={13}
            color={c.primary}
            modifiers={[widgetAccentedRenderingMode('accented')]}
          />
          <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(c.primary)]}>{org}</Text>
        </HStack>
        <Spacer />
        <Text modifiers={[font({ size: 15, weight: 'bold' }), foregroundStyle(c.fg)]}>Canlı Özet İçin Giriş Yapın</Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(c.muted), lineLimit(2)]}>
          Günlük bağışları, havaleleri ve kampanya hedeflerini ana ekrandan izleyin.
        </Text>
      </VStack>
    );
  }

  const spark =
    props.sparkline && props.sparkline.length > 0
      ? props.sparkline.slice(-7)
      : [
          { label: '1', amount: '', ratio: 25, isToday: false },
          { label: '2', amount: '', ratio: 45, isToday: false },
          { label: '3', amount: '', ratio: 35, isToday: false },
          { label: '4', amount: '', ratio: 60, isToday: false },
          { label: '5', amount: '', ratio: 50, isToday: false },
          { label: '6', amount: '', ratio: 75, isToday: false },
          { label: '7', amount: '', ratio: 100, isToday: true },
        ];
  const channels = (props.channels || []).slice(0, 3);

  // 1) Küçük Boy (2x2 systemSmall)
  if (environment.widgetFamily === 'systemSmall') {
    return (
      <VStack
        alignment="leading"
        spacing={4}
        modifiers={[
          padding({ all: 2 }),
          containerBackground(bgGradient, 'widget'),
          widgetURL(`${scheme}://para-girisleri`),
        ]}
      >
        <HStack spacing={4}>
          <Image
            systemName="moon.stars.fill"
            size={11}
            color={c.primary}
            modifiers={[widgetAccentedRenderingMode('accented')]}
          />
          <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(c.primary), lineLimit(1)]}>{org}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 9 }), foregroundStyle(c.muted)]}>{props.updated || ''}</Text>
        </HStack>

        <Spacer />

        <Text modifiers={[font({ size: 10 }), foregroundStyle(c.muted)]}>Bugün gelen</Text>
        <Text
          modifiers={[
            font({ size: 22, weight: 'heavy' }),
            foregroundStyle(c.fg),
            minimumScaleFactor(0.55),
            lineLimit(1),
          ]}
        >
          {total}
        </Text>
        <HStack spacing={4}>
          <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(c.sub), lineLimit(1)]}>
            {props.count || ''}
          </Text>
          {props.change ? (
            <Text
              modifiers={[
                font({ size: 10, weight: 'bold' }),
                foregroundStyle(props.up ? c.primary : c.danger),
                lineLimit(1),
              ]}
            >
              {props.change}
            </Text>
          ) : null}
        </HStack>

        <Spacer />

        {props.waitingCount && props.waitingCount > 0 ? (
          <HStack
            spacing={4}
            modifiers={[
              padding({ horizontal: 7, vertical: 3 }),
              background(c.warnSoft, shapes.capsule()),
            ]}
          >
            <Image systemName="clock.fill" size={9} color={c.warn} />
            <Text modifiers={[font({ size: 10, weight: 'bold' }), foregroundStyle(c.warn), lineLimit(1)]}>
              {`${props.waitingCount} bekleyen`}
            </Text>
          </HStack>
        ) : (
          <HStack alignment="bottom" spacing={3}>
            {spark.map((pt, i) => (
              <RoundedRectangle
                key={`${pt.label}-${i}`}
                cornerRadius={2}
                modifiers={[
                  frame({ width: 6, height: Math.max(4, Math.round((pt.ratio / 100) * 18)) }),
                  foregroundStyle(pt.isToday ? c.primary : c.barIdle),
                ]}
              />
            ))}
            <Spacer />
            {props.monthTotal ? (
              <Text modifiers={[font({ size: 9 }), foregroundStyle(c.muted), lineLimit(1)]}>
                {`Ay: ${props.monthTotal}`}
              </Text>
            ) : null}
          </HStack>
        )}
      </VStack>
    );
  }

  // 2) Büyük Boy (4x4 systemLarge — YÖNETİCİ KOKPİTİ)
  if (environment.widgetFamily === 'systemLarge' || environment.widgetFamily === 'systemExtraLarge') {
    const transfers = (props.transfers || []).slice(0, 2);
    const tasks = (props.tasks || []).slice(0, 2);
    return (
      <VStack
        alignment="leading"
        spacing={8}
        modifiers={[
          padding({ all: 4 }),
          containerBackground(bgGradient, 'widget'),
          widgetURL(`${scheme}://para-girisleri`),
        ]}
      >
        <HStack spacing={5}>
          <Image
            systemName="moon.stars.fill"
            size={13}
            color={c.primary}
            modifiers={[widgetAccentedRenderingMode('accented')]}
          />
          <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(c.primary), lineLimit(1)]}>
            {`${org} · Yönetici Kokpiti`}
          </Text>
          <Spacer />
          {props.unreadCount && props.unreadCount > 0 ? (
            <Text
              modifiers={[
                font({ size: 10, weight: 'bold' }),
                foregroundStyle(c.primary),
                padding({ horizontal: 6, vertical: 2 }),
                background(c.primarySoft, shapes.capsule()),
              ]}
            >
              {`${props.unreadCount} bildirim`}
            </Text>
          ) : null}
          <Text modifiers={[font({ size: 10 }), foregroundStyle(c.muted)]}>{props.updated || ''}</Text>
        </HStack>

        {/* Üst KPI + 7 Günlük Çubuk Grafik */}
        <HStack
          spacing={10}
          modifiers={[
            padding({ all: 10 }),
            background(c.card, shapes.roundedRectangle({ cornerRadius: 14 })),
          ]}
        >
          <VStack alignment="leading" spacing={3}>
            <Text modifiers={[font({ size: 11 }), foregroundStyle(c.muted)]}>Bugün Tahsilat</Text>
            <Text
              modifiers={[
                font({ size: 26, weight: 'heavy' }),
                foregroundStyle(c.fg),
                minimumScaleFactor(0.55),
                lineLimit(1),
              ]}
            >
              {total}
            </Text>
            <HStack spacing={5}>
              <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(c.sub)]}>
                {props.count || ''}
              </Text>
              {props.change ? (
                <Text
                  modifiers={[
                    font({ size: 10, weight: 'bold' }),
                    foregroundStyle(props.up ? c.primary : c.danger),
                  ]}
                >
                  {props.change}
                </Text>
              ) : null}
            </HStack>
            {props.monthTotal ? (
              <Text modifiers={[font({ size: 10 }), foregroundStyle(c.muted), lineLimit(1)]}>
                {`Bu ay: ${props.monthTotal}`}
              </Text>
            ) : null}
          </VStack>

          <Spacer />

          <VStack alignment="trailing" spacing={4}>
            <HStack alignment="bottom" spacing={4}>
              {spark.map((pt, i) => (
                <VStack key={`${pt.label}-${i}`} spacing={2}>
                  <RoundedRectangle
                    cornerRadius={3}
                    modifiers={[
                      frame({ width: 8, height: Math.max(5, Math.round((pt.ratio / 100) * 38)) }),
                      foregroundStyle(pt.isToday ? c.primary : c.barIdle),
                    ]}
                  />
                  <Text modifiers={[font({ size: 8 }), foregroundStyle(pt.isToday ? c.primary : c.muted)]}>
                    {pt.label.slice(0, 2)}
                  </Text>
                </VStack>
              ))}
            </HStack>
            {props.weekTotal ? (
              <Text modifiers={[font({ size: 9 }), foregroundStyle(c.muted)]}>{`7g: ${props.weekTotal}`}</Text>
            ) : null}
          </VStack>
        </HStack>

        {/* Kanal Kırılım Satırı */}
        {channels.length > 0 ? (
          <HStack spacing={8}>
            {channels.map((ch) => {
              const dotCol =
                ch.colorKey === 'blue'
                  ? c.info
                  : ch.colorKey === 'amber'
                    ? c.warn
                    : ch.colorKey === 'violet'
                      ? c.violet
                      : ch.colorKey === 'teal'
                        ? c.accent
                        : c.primary;
              return (
                <HStack key={ch.key} spacing={4}>
                  <Circle modifiers={[frame({ width: 7, height: 7 }), foregroundStyle(dotCol)]} />
                  <Text modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle(c.sub), lineLimit(1)]}>
                    {`${ch.label} %${ch.percent}`}
                  </Text>
                </HStack>
              );
            })}
            <Spacer />
          </HStack>
        ) : null}

        {/* Kampanya İlerleme Kartı */}
        {props.campaign ? (
          <VStack
            alignment="leading"
            spacing={4}
            modifiers={[
              padding({ horizontal: 10, vertical: 8 }),
              background(c.card, shapes.roundedRectangle({ cornerRadius: 12 })),
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
              <Text modifiers={[font({ size: 10 }), foregroundStyle(c.sub), lineLimit(1)]}>
                {props.campaign.summary}
              </Text>
              <Spacer />
              <Text modifiers={[font({ size: 10 }), foregroundStyle(c.muted), lineLimit(1)]}>
                {`Kalan: ${props.campaign.remaining}`}
              </Text>
            </HStack>
          </VStack>
        ) : null}

        <Spacer />

        {/* Alt Özet: Bekleyen Havaleler & Görevler */}
        <HStack spacing={8}>
          <VStack
            alignment="leading"
            spacing={3}
            modifiers={[
              padding({ all: 8 }),
              frame({ maxWidth: 999, alignment: 'leading' }),
              background(c.card, shapes.roundedRectangle({ cornerRadius: 12 })),
            ]}
          >
            <HStack spacing={4}>
              <Image systemName="arrow.left.arrow.right.circle.fill" size={11} color={c.warn} />
              <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(c.warn)]}>Havaleler</Text>
              <Spacer />
              <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundStyle(c.warn)]}>
                {`${props.waitingCount || 0}`}
              </Text>
            </HStack>
            {transfers.length === 0 ? (
              <Text modifiers={[font({ size: 10 }), foregroundStyle(c.muted)]}>Bekleyen yok ✓</Text>
            ) : (
              transfers.map((t, i) => (
                <Text
                  key={`${t.id}-${i}`}
                  modifiers={[font({ size: 10 }), foregroundStyle(c.sub), lineLimit(1)]}
                >
                  {`${t.sender.split(' ')[0]} · ${t.amount}`}
                </Text>
              ))
            )}
          </VStack>

          <VStack
            alignment="leading"
            spacing={3}
            modifiers={[
              padding({ all: 8 }),
              frame({ maxWidth: 999, alignment: 'leading' }),
              background(c.card, shapes.roundedRectangle({ cornerRadius: 12 })),
            ]}
          >
            <HStack spacing={4}>
              <Image systemName="checklist" size={11} color={c.primary} />
              <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(c.primary)]}>Görevler</Text>
              <Spacer />
              <Text
                modifiers={[
                  font({ size: 10, weight: 'bold' }),
                  foregroundStyle(props.tasksOverdue ? c.danger : c.muted),
                ]}
              >
                {props.tasksOverdue ? `${props.tasksOverdue} geciken` : `${props.tasksOpen || 0}`}
              </Text>
            </HStack>
            {tasks.length === 0 ? (
              <Text modifiers={[font({ size: 10 }), foregroundStyle(c.muted)]}>Açık görev yok ✓</Text>
            ) : (
              tasks.map((t, i) => (
                <Text
                  key={`${t.id}-${i}`}
                  modifiers={[
                    font({ size: 10 }),
                    foregroundStyle(t.overdue ? c.danger : c.sub),
                    lineLimit(1),
                  ]}
                >
                  {`${t.overdue ? '! ' : '• '}${t.title}`}
                </Text>
              ))
            )}
          </VStack>
        </HStack>

        {/* Hızlı Eylem Linkleri */}
        <HStack spacing={8}>
          <Link destination={`${scheme}://makbuz-kes`}>
            <HStack
              spacing={5}
              modifiers={[
                padding({ horizontal: 10, vertical: 5 }),
                background(c.primarySoft, shapes.capsule()),
              ]}
            >
              <Image systemName="plus.circle.fill" size={12} color={c.primary} />
              <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(c.primary)]}>Makbuz Kes</Text>
            </HStack>
          </Link>
          <Link destination={`${scheme}://kumbara/tara`}>
            <HStack
              spacing={5}
              modifiers={[
                padding({ horizontal: 10, vertical: 5 }),
                background(c.card, shapes.capsule()),
              ]}
            >
              <Image systemName="qrcode.viewfinder" size={12} color={c.fg} />
              <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(c.fg)]}>Kumbara QR</Text>
            </HStack>
          </Link>
          <Spacer />
        </HStack>
      </VStack>
    );
  }

  // 3) Orta Boy (4x2 systemMedium)
  return (
    <VStack
      alignment="leading"
      spacing={5}
      modifiers={[
        padding({ all: 4 }),
        containerBackground(bgGradient, 'widget'),
        widgetURL(`${scheme}://para-girisleri`),
      ]}
    >
      <HStack spacing={5}>
        <Image
          systemName="moon.stars.fill"
          size={12}
          color={c.primary}
          modifiers={[widgetAccentedRenderingMode('accented')]}
        />
        <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(c.primary), lineLimit(1)]}>{org}</Text>
        <Spacer />
        {props.unreadCount && props.unreadCount > 0 ? (
          <Text
            modifiers={[
              font({ size: 10, weight: 'bold' }),
              foregroundStyle(c.primary),
              padding({ horizontal: 6, vertical: 1 }),
              background(c.primarySoft, shapes.capsule()),
            ]}
          >
            {`${props.unreadCount} bildirim`}
          </Text>
        ) : null}
        <Text modifiers={[font({ size: 10 }), foregroundStyle(c.muted)]}>{props.updated || ''}</Text>
      </HStack>

      <HStack alignment="center" spacing={10}>
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 11 }), foregroundStyle(c.muted)]}>Bugün gelen para</Text>
          <Text
            modifiers={[
              font({ size: 27, weight: 'heavy' }),
              foregroundStyle(c.fg),
              minimumScaleFactor(0.55),
              lineLimit(1),
            ]}
          >
            {total}
          </Text>
          <HStack spacing={6}>
            <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(c.sub)]}>
              {props.count || ''}
            </Text>
            {props.change ? (
              <Text
                modifiers={[
                  font({ size: 10, weight: 'bold' }),
                  foregroundStyle(props.up ? c.primary : c.danger),
                  padding({ horizontal: 6, vertical: 1 }),
                  background(props.up ? c.primarySoft : c.dangerSoft, shapes.capsule()),
                ]}
              >
                {props.change}
              </Text>
            ) : null}
          </HStack>
        </VStack>

        <Spacer />

        <VStack alignment="trailing" spacing={3}>
          <HStack alignment="bottom" spacing={4}>
            {spark.map((pt, i) => (
              <RoundedRectangle
                key={`${pt.label}-${i}`}
                cornerRadius={2.5}
                modifiers={[
                  frame({ width: 7, height: Math.max(5, Math.round((pt.ratio / 100) * 32)) }),
                  foregroundStyle(pt.isToday ? c.primary : c.barIdle),
                ]}
              />
            ))}
          </HStack>
          <Text modifiers={[font({ size: 9 }), foregroundStyle(c.muted)]}>Son 7 gün</Text>
        </VStack>
      </HStack>

      <Spacer />

      <HStack spacing={8}>
        {channels.slice(0, 2).map((ch) => {
          const dotCol =
            ch.colorKey === 'blue'
              ? c.info
              : ch.colorKey === 'amber'
                ? c.warn
                : ch.colorKey === 'violet'
                  ? c.violet
                  : ch.colorKey === 'teal'
                    ? c.accent
                    : c.primary;
          return (
            <HStack key={ch.key} spacing={4}>
              <Circle modifiers={[frame({ width: 6, height: 6 }), foregroundStyle(dotCol)]} />
              <Text modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle(c.sub), lineLimit(1)]}>
                {`${ch.label} ${ch.amount}`}
              </Text>
            </HStack>
          );
        })}
        <Spacer />
        {props.waitingCount && props.waitingCount > 0 ? (
          <Capsule
            modifiers={[frame({ width: 0, height: 0 })]}
          />
        ) : null}
        {props.waitingCount && props.waitingCount > 0 ? (
          <Text
            modifiers={[
              font({ size: 10, weight: 'bold' }),
              foregroundStyle(c.warn),
              padding({ horizontal: 7, vertical: 2 }),
              background(c.warnSoft, shapes.capsule()),
              lineLimit(1),
            ]}
          >
            {`${props.waitingCount} havale`}
          </Text>
        ) : props.monthTotal ? (
          <Text modifiers={[font({ size: 10 }), foregroundStyle(c.muted), lineLimit(1)]}>
            {`Ay: ${props.monthTotal}`}
          </Text>
        ) : null}
      </HStack>
    </VStack>
  );
}

export default createWidget<WidgetProps>('EinfakInflow', InflowWidget);
