'use client'

/**
 * Editor preview of the donor app's blocks, in CSS pixels = app points. Mirrors
 * apps/mobile/src/design/blocks.tsx: keep sizes and fallbacks the same there.
 */
import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Heart, Phone, Play, ShoppingBag } from 'lucide-react'
import { iconOf } from './icons'
import type { AppAction, AppBlock, AppDesign, PreviewData } from './types'

export function onColor(hex: string): string {
  const n = parseInt(hex.slice(1, 7), 16)
  if (Number.isNaN(n)) return '#FFFFFF'
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.62 ? '#0F172A' : '#FFFFFF'
}

const RADIUS: Record<string, number> = { none: 0, small: 8, medium: 18, large: 26 }
const SCALE: Record<string, number> = { small: 0.92, normal: 1, large: 1.14 }

export function brandOf(design: AppDesign, data: PreviewData) {
  const t = design.theme
  const primary: string = t.primary || data.site?.primary_color || '#00533C'
  const accent: string = t.accent || data.site?.accent_color || '#C8922B'
  const text: string = t.text || '#0F172A'
  const radius = RADIUS[t.radius || 'medium'] ?? 18
  const scale = SCALE[t.text_size || 'normal'] ?? 1
  return {
    primary, accent, text, radius,
    onPrimary: onColor(primary), onAccent: onColor(accent),
    bg: (t.background || '#F6F8F7') as string, surface: (t.surface || '#FFFFFF') as string,
    muted: t.text ? `${text}A6` : '#64748B', line: t.text ? `${text}1F` : '#E2E8F0',
    buttonRadius: Math.min(radius, 12), fs: (n: number) => Math.round(n * scale),
    name: (data.site?.name || '') as string,
  }
}
type Brand = ReturnType<typeof brandOf>

const Ctx = createContext<{ b: Brand; data: PreviewData; open: (a?: AppAction) => void } | null>(null)
export function PreviewProvider({ brand, data, open, children }: { brand: Brand; data: PreviewData; open: (a?: AppAction) => void; children: ReactNode }) {
  return <Ctx.Provider value={{ b: brand, data, open }}>{children}</Ctx.Provider>
}
const useP = () => useContext(Ctx)!

type P = { props: Record<string, any>; ink: string }
const listOf = (v: any): any[] => (Array.isArray(v) ? v : [])
const usable = (a?: AppAction) => !!(a?.type && a.target)
/** Same labels as the app (apps/mobile/src/api/public.ts). */
const CATEGORY: Record<string, string> = {
  kurban: 'Kurban', su: 'Su Kuyusu', gida: 'Gıda / Gazze', egitim: 'Eğitim', zekat: 'Zekat', sadaka: 'Sadaka', insaat: 'İnşaat',
  yetim: 'Yetim', acil: 'Acil Yardım', ramazan: 'Ramazan', genel: 'Genel',
}
const lira = (cents: number) => `${(cents / 100).toLocaleString('tr-TR')} ₺`
const pad: CSSProperties = { padding: '0 16px' }
const row: CSSProperties = { display: 'flex', gap: 8, overflowX: 'auto', padding: '0 16px', scrollbarWidth: 'none' }
const wrap: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 }
const overlay: CSSProperties = { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, background: 'rgba(15,23,42,0.56)' }
const clamp = (n: number): CSSProperties => ({ display: '-webkit-box', WebkitLineClamp: n, WebkitBoxOrient: 'vertical', overflow: 'hidden' })

function Title({ text, ink, right }: { text?: string; ink: string; right?: string }) {
  const { b } = useP()
  if (!text) return null
  return (
    <div style={{ display: 'flex', marginBottom: 6, color: ink, fontSize: b.fs(12) }}>
      <span style={{ flex: 1, fontWeight: 800, letterSpacing: 0.8, opacity: 0.72 }}>{text}</span>
      {right && <span style={{ fontWeight: 600 }}>{right}</span>}
    </div>
  )
}

function Button({ label, action, kind = 'primary', ink, always }: { label?: string; action?: AppAction; kind?: string; ink?: string; always?: boolean }) {
  const { b, open } = useP()
  if (!label || (!always && !usable(action))) return null
  const color = kind === 'accent' ? b.onAccent : kind === 'primary' ? b.onPrimary : ink || b.primary
  return (
    <div role="button" onClick={() => open(action)} style={{
      minHeight: 44, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', cursor: 'pointer',
      background: kind === 'accent' ? b.accent : kind === 'primary' ? b.primary : 'transparent', color, fontSize: b.fs(14), fontWeight: 800,
      borderRadius: b.buttonRadius, border: kind === 'outline' ? `1.5px solid ${color}` : undefined,
    }}>{label}</div>
  )
}

function Cover({ src, height, style }: { src?: string | null; height: number; style?: CSSProperties }) {
  const { b } = useP()
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" style={{ display: 'block', width: '100%', height, objectFit: 'cover', background: b.line, ...style }} />
  ) : (
    <div style={{ height, background: `${b.primary}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}><Heart size={24} color={b.primary} /></div>
  )
}

function Bar({ value }: { value: number }) {
  const { b } = useP()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 7, borderRadius: 4, background: b.line, overflow: 'hidden' }}><div style={{ width: `${value}%`, height: '100%', background: b.primary }} /></div>
      <span style={{ fontSize: b.fs(12), fontWeight: 700, color: b.text }}>%{value}</span>
    </div>
  )
}

const percent = (c: any): number | null =>
  c.show_collected !== false && c.target_cents > 0 ? Math.min(100, Math.round(((c.collected_cents || 0) * 100) / c.target_cents)) : null

/** Shown in the editor only: in the app such a block stays invisible. */
function Empty({ text }: { text: string }) {
  return <div style={{ ...pad }}><div style={{ border: '1px dashed #94A3B8', borderRadius: 8, padding: 14, fontSize: 12, color: '#64748B', textAlign: 'center' }}>{text}</div></div>
}

function Hero({ props }: P) {
  const { b, data, open } = useP()
  const look = props.look || 'brand'
  const image = props.image_url || (look === 'image' ? data.site?.hero?.image_url : null)
  const onImage = look === 'image' && !!image
  const card = look === 'card'
  const ink = onImage ? '#FFFFFF' : card ? b.text : b.onPrimary
  const textAlign = props.align === 'center' ? 'center' : 'left'
  const btn: CSSProperties = { flex: 1, minHeight: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 8px', borderRadius: b.buttonRadius, fontSize: b.fs(14), cursor: 'pointer', textAlign: 'center' }
  const body = (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 8, textAlign, padding: card ? 16 : 0 }}>
      <div style={{ color: card ? b.primary : ink === '#FFFFFF' ? '#E8D8A0' : ink, fontSize: b.fs(11), fontWeight: 800, letterSpacing: 1.2 }}>{(props.badge || b.name).toLocaleUpperCase('tr-TR')}</div>
      <div style={{ color: ink, fontSize: b.fs(23), lineHeight: `${b.fs(29)}px`, fontWeight: 800 }}>{props.title || data.site?.hero?.title || data.site?.tagline || 'Bir iyilik de sizden'}</div>
      <div style={{ color: ink, opacity: 0.88, fontSize: b.fs(13), lineHeight: `${b.fs(19)}px` }}>{props.text || data.site?.hero?.subtitle || 'Bağışlarınızı güvenle uygulama içinden ulaştırabilirsiniz.'}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {props.primary_label && usable(props.primary_action) && <div role="button" onClick={() => open(props.primary_action)} style={{ ...btn, background: b.accent, color: b.onAccent, fontWeight: 800 }}>{props.primary_action.target === 'bagis-yap' && <Heart size={18} />}{props.primary_label}</div>}
        {props.secondary_label && usable(props.secondary_action) && <div role="button" onClick={() => open(props.secondary_action)} style={{ ...btn, color: ink, background: `${ink}1F`, border: `1px solid ${ink}59`, fontWeight: 700 }}>{props.secondary_label}</div>}
      </div>
    </div>
  )
  if (card) return <div style={{ margin: 16, background: b.surface, borderRadius: b.radius, overflow: 'hidden', border: `1px solid ${b.line}` }}>{image && <Cover src={image} height={150} />}{body}</div>
  return (
    <div style={{ position: 'relative', background: b.primary, padding: '4px 16px 24px', overflow: 'hidden', borderRadius: `0 0 ${b.radius + 10}px ${b.radius + 10}px` }}>
      {onImage && <><Cover src={image} height={0} style={{ position: 'absolute', inset: 0, height: '100%' }} /><div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.55)' }} /></>}
      {body}
    </div>
  )
}

function BannerSlider({ props }: P) {
  const { b } = useP()
  const slides = listOf(props.items).filter((i) => i?.image_url)
  const look = props.look || 'overlay'
  if (!slides.length) return <Empty text="Slayt ekleyin ve görsel seçin." />
  return (
    <div style={row}>
      {slides.map((x, i) => (
        <div key={i} style={{ position: 'relative', flex: '0 0 calc(100% - 0px)', borderRadius: b.radius, overflow: 'hidden', background: b.surface }}>
          <Cover src={x.image_url} height={props.height || 158} />
          {look !== 'plain' && (x.title || x.text) && (
            <div style={look === 'overlay' ? overlay : { padding: 12 }}>
              <div style={{ color: look === 'overlay' ? '#FFF' : b.text, fontSize: b.fs(15), fontWeight: 800 }}>{x.title}</div>
              <div style={{ color: look === 'overlay' ? 'rgba(255,255,255,.9)' : b.muted, fontSize: b.fs(12) }}>{x.text}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function QuickCategories({ props, ink }: P) {
  const { b, data } = useP()
  if (!data.categories.length) return <Empty text="Hızlı bağış kalemi yok." />
  const grid = props.look === 'grid'
  return (
    <div>
      <div style={pad}><Title text={props.title} ink={ink} /></div>
      <div style={grid ? { ...pad, ...wrap } : row}>
        {data.categories.map((c) => (
          <div key={c.id} style={{ flex: grid ? '0 0 31.5%' : '0 0 118px', background: b.surface, border: `1px solid ${b.line}`, borderRadius: Math.min(b.radius, 16), padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 52, height: 52, borderRadius: Math.min(b.radius, 14), overflow: 'hidden' }}><Cover src={c.image_url} height={52} /></div>
            <div style={{ fontSize: b.fs(12), fontWeight: 700, color: b.text, textAlign: 'center', ...clamp(2) }}>{c.title}</div>
            {c.suggested_amounts_cents?.[0] && <div style={{ fontSize: b.fs(12), fontWeight: 800, color: b.primary }}>{lira(c.suggested_amounts_cents[0])}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

function CampaignCard({ c, compact }: { c: any; compact?: boolean }) {
  const { b } = useP()
  const first = c.suggested_amounts_cents?.[0] || c.reference_amounts?.TRY
  const pct = percent(c)
  const price = first ? lira(first) : 'Serbest Tutar'
  if (compact) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8, background: b.surface, border: `1px solid ${b.line}`, borderRadius: b.radius }}>
      <div style={{ width: 72, height: 72, flex: 'none', borderRadius: Math.min(b.radius, 14), overflow: 'hidden' }}><Cover src={c.cover_image_url} height={72} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: b.fs(14), fontWeight: 800, color: b.text, ...clamp(2) }}>{c.title}</div>
        {pct !== null && <Bar value={pct} />}
        <div style={{ fontSize: b.fs(13), fontWeight: 800, color: b.primary }}>{price}</div>
      </div>
      <ChevronRight size={18} color={b.primary} />
    </div>
  )
  return (
    <div style={{ background: b.surface, border: `1px solid ${b.line}`, borderRadius: b.radius, overflow: 'hidden' }}>
      {c.cover_image_url && <Cover src={c.cover_image_url} height={175} />}
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {c.category && <span style={{ alignSelf: 'flex-start', padding: '3px 10px', borderRadius: 99, background: `${b.primary}14`, color: b.primary, fontSize: b.fs(11), fontWeight: 800 }}>{CATEGORY[c.category] || c.category}</span>}
        <div style={{ fontSize: b.fs(16), fontWeight: 800, color: b.text }}>{c.title}</div>
        {c.summary && <div style={{ fontSize: b.fs(13), color: b.muted, ...clamp(2) }}>{c.summary}</div>}
        {pct !== null && <Bar value={pct} />}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div><div style={{ fontSize: b.fs(10), color: b.muted, fontWeight: 600 }}>Önerilen Tutar</div><div style={{ fontSize: b.fs(16), fontWeight: 800, color: b.primary }}>{price}</div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ height: 38, padding: '0 10px', display: 'flex', alignItems: 'center', border: `1.5px solid ${b.primary}`, borderRadius: 99 }}><ShoppingBag size={15} color={b.primary} /></span>
            <span style={{ height: 38, padding: '0 15px', display: 'flex', alignItems: 'center', gap: 6, background: b.primary, color: b.onPrimary, borderRadius: 99, fontSize: b.fs(13), fontWeight: 800 }}><Heart size={15} />Bağış Yap</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function CampaignList({ props, ink }: P) {
  const { b, data } = useP()
  const keys: string[] = ['TÜMÜ', ...Array.from(new Set(data.campaigns.map((c) => c.category).filter(Boolean)))]
  const shown = data.campaigns.slice(0, props.limit || 100)
  return (
    <div>
      {props.show_filter !== false && keys.length > 1 && (
        <div style={{ ...row, paddingBottom: 12 }}>
          {keys.map((k, i) => <span key={k} style={{ flex: 'none', padding: '8px 14px', borderRadius: 99, fontSize: b.fs(13), fontWeight: 700, border: `1px solid ${i ? b.line : b.primary}`, background: i ? b.surface : b.primary, color: i ? b.text : b.onPrimary }}>{CATEGORY[k] || k.toLocaleUpperCase('tr-TR')}</span>)}
        </div>
      )}
      <div style={{ ...pad, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Title text={props.title} ink={ink} right={`${shown.length} kampanya`} />
        {shown.length ? shown.map((c) => <CampaignCard key={c.id} c={c} compact={props.look === 'compact'} />) : <span style={{ fontSize: 13, color: b.muted }}>Aktif kampanya yok.</span>}
      </div>
    </div>
  )
}

function CampaignCarousel({ props, ink }: P) {
  const { b, data } = useP()
  const picked = listOf(props.campaigns)
  const featured = data.campaigns.filter((c) => c.is_featured)
  const source = picked.length ? picked.map((id) => data.campaigns.find((c) => c.id === id)).filter(Boolean) : featured.length ? featured : data.campaigns
  if (!source.length) return <Empty text="Gösterilecek kampanya yok." />
  const poster = props.look === 'poster'
  return (
    <div>
      <div style={pad}><Title text={props.title} ink={ink} /></div>
      <div style={row}>
        {source.slice(0, props.limit || 8).map((c: any) => (
          <div key={c.id} style={{ position: 'relative', flex: `0 0 ${poster ? 168 : 220}px`, borderRadius: b.radius, overflow: 'hidden', background: b.surface, border: poster ? undefined : `1px solid ${b.line}` }}>
            <Cover src={c.cover_image_url} height={poster ? 232 : 124} />
            <div style={poster ? overlay : { padding: 12 }}>
              <div style={{ color: poster ? '#FFF' : b.text, fontSize: b.fs(14), fontWeight: 800, ...clamp(2) }}>{c.title}</div>
              {!poster && percent(c) !== null && <Bar value={percent(c)!} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function usePicked(id?: string) {
  const { data } = useP()
  return id ? data.campaigns.find((c) => c.id === id) : data.campaigns.find((c) => c.is_featured) || data.campaigns[0]
}

function FeaturedCampaign({ props }: P) {
  const { b } = useP()
  const c = usePicked(props.campaign)
  if (!c) return <Empty text="Kampanya bulunamadı." />
  if (props.look !== 'cover') return <div style={pad}><CampaignCard c={c} /></div>
  return (
    <div style={pad}>
      <div style={{ position: 'relative', borderRadius: b.radius, overflow: 'hidden' }}>
        <Cover src={c.cover_image_url} height={300} />
        <div style={{ ...overlay, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ color: '#FFF', fontSize: b.fs(20), fontWeight: 800 }}>{c.title}</div>
          {c.summary && <div style={{ color: 'rgba(255,255,255,.9)', fontSize: b.fs(13), ...clamp(2) }}>{c.summary}</div>}
          <Button label={props.button_label || 'Bağış Yap'} kind="accent" always />
        </div>
      </div>
    </div>
  )
}

function Progress({ props }: P) {
  const { b } = useP()
  const c = usePicked(props.campaign)
  const pct = c ? percent(c) : null
  if (!c || pct === null) return <Empty text="Hedefi olan bir kampanya seçin." />
  return (
    <div style={pad}>
      <div style={{ background: b.surface, border: `1px solid ${b.line}`, borderRadius: b.radius, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: b.fs(15), fontWeight: 800, color: b.text }}>{props.title || c.title}</div>
        <Bar value={pct} />
        <div style={{ fontSize: b.fs(12), color: b.muted }}>{lira(c.collected_cents || 0)} / {lira(c.target_cents)}</div>
      </div>
    </div>
  )
}

function QuickDonate({ props }: P) {
  const { b } = useP()
  const c = usePicked(props.campaign)
  const amounts = listOf(props.amounts).map((a) => Number(a?.amount)).filter((n) => n > 0)
  const choices = amounts.length ? amounts : [100, 250, 500]
  if (!c) return <Empty text="Kampanya bulunamadı." />
  return (
    <div style={pad}>
      <div style={{ background: b.surface, border: `1px solid ${b.line}`, borderRadius: b.radius, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {props.title && <div style={{ fontSize: b.fs(17), fontWeight: 800, color: b.text }}>{props.title}</div>}
        {props.text && <div style={{ fontSize: b.fs(13), color: b.muted }}>{props.text}</div>}
        <div style={{ fontSize: b.fs(12), fontWeight: 700, color: b.primary }}>{c.title}</div>
        <div style={wrap}>{choices.map((n, i) => <span key={i} style={{ padding: '8px 14px', borderRadius: 99, fontSize: b.fs(14), fontWeight: 800, border: `1px solid ${i ? b.line : b.primary}`, background: i ? b.surface : b.primary, color: i ? b.text : b.onPrimary }}>{n} ₺</span>)}</div>
        <div style={{ border: `1px solid ${b.line}`, borderRadius: b.buttonRadius, padding: 12, fontSize: b.fs(16), color: b.text }}>{choices[0]}</div>
        <Button label={props.button_label || 'Sepete Ekle'} always />
      </div>
    </div>
  )
}

function Shortcuts({ props, ink }: P) {
  const { b, open } = useP()
  const columns = Math.min(4, Math.max(2, props.columns || 4))
  const look = props.look || 'tile'
  const items = listOf(props.items).filter((i) => usable(i?.action))
  if (!items.length) return <Empty text="Kısayol ekleyin ve ne açacağını seçin." />
  return (
    <div style={pad}>
      <Title text={props.title} ink={ink} />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 8 }}>
        {items.map((item, i) => {
          const Icon = iconOf(item.icon)
          const circle = look === 'circle'
          return (
            <div key={i} role="button" onClick={() => open(item.action)} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 4px', ...(circle ? {} : { background: look === 'outline' ? 'transparent' : b.surface, borderRadius: Math.min(b.radius, 16), border: look === 'outline' ? `1.5px solid ${b.primary}` : `1px solid ${b.line}` }) }}>
              <span style={{ width: 46, height: 46, borderRadius: circle ? 23 : Math.min(b.radius, 12), background: circle ? b.primary : `${b.primary}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={21} color={circle ? b.onPrimary : b.primary} /></span>
              <span style={{ fontSize: b.fs(11), fontWeight: 700, textAlign: 'center', color: circle || look === 'outline' ? ink : b.text }}>{item.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ToolCards({ props }: P) {
  const { b, open } = useP()
  const items = listOf(props.items).filter((i) => usable(i?.action))
  if (!items.length) return <Empty text="Kart ekleyin ve ne açacağını seçin." />
  return (
    <div style={{ ...pad, ...wrap }}>
      {items.map((item, i) => {
        const Icon = iconOf(item.icon)
        const color = item.color === 'accent' ? b.accent : b.primary
        return (
          <div key={i} role="button" onClick={() => open(item.action)} style={{ cursor: 'pointer', flex: '1 1 45%', background: b.surface, border: `1px solid ${color}44`, borderRadius: Math.min(b.radius, 16), padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ width: 38, height: 38, borderRadius: Math.min(b.radius, 12), background: `${color}1C`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={20} color={color} /></span>
            <span style={{ fontSize: b.fs(14), fontWeight: 800, color: b.text }}>{item.title}</span>
            {item.text && <span style={{ fontSize: b.fs(12), color: b.muted }}>{item.text}</span>}
            <ChevronRight size={16} color={color} style={{ alignSelf: 'flex-end' }} />
          </div>
        )
      })}
    </div>
  )
}

function Buttons({ props, ink }: P) {
  const items = listOf(props.items).filter((i) => i?.label && usable(i.action))
  if (!items.length) return <Empty text="Düğme ekleyin ve ne açacağını seçin." />
  return <div style={{ ...pad, display: 'flex', flexDirection: 'column', gap: 8 }}>{items.map((i, n) => <Button key={n} label={i.label} action={i.action} kind={i.style || 'primary'} ink={ink} />)}</div>
}

function CtaBand({ props }: P) {
  const { b } = useP()
  if (!props.title && !props.text && !props.button_label) return <Empty text="Başlık, metin veya düğme yazın." />
  return (
    <div style={pad}>
      <div style={{ background: b.primary, color: b.onPrimary, borderRadius: b.radius, padding: 24, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center' }}>
        {props.title && <div style={{ fontSize: b.fs(20), fontWeight: 800 }}>{props.title}</div>}
        {props.text && <div style={{ fontSize: b.fs(14), opacity: 0.9 }}>{props.text}</div>}
        <Button label={props.button_label} action={props.action} kind="accent" />
      </div>
    </div>
  )
}

function Heading({ props, ink }: P) {
  const { b } = useP()
  if (!props.title && !props.text) return <Empty text="Başlık yazın." />
  return (
    <div style={{ ...pad, textAlign: props.align === 'center' ? 'center' : 'left', color: ink }}>
      {props.title && <div style={{ fontSize: b.fs(20), fontWeight: 800 }}>{props.title}</div>}
      {props.text && <div style={{ fontSize: b.fs(14), opacity: 0.75 }}>{props.text}</div>}
    </div>
  )
}

function inline(text: string, color: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g).filter(Boolean).map((part, i) => {
    const href = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
    if (href) return <span key={i} style={{ color, textDecoration: 'underline' }}>{href[1]}</span>
    if (/^\*\*.+\*\*$/.test(part)) return <b key={i}>{part.slice(2, -2)}</b>
    if (/^\*.+\*$/.test(part)) return <i key={i}>{part.slice(1, -1)}</i>
    return part
  })
}

function RichText({ props, ink }: P) {
  const { b } = useP()
  const lines = String(props.text || '').split('\n').filter((l) => l.trim())
  if (!lines.length) return <Empty text="Metin yazın." />
  return (
    <div style={{ ...pad, display: 'flex', flexDirection: 'column', gap: 8, color: ink, textAlign: props.align === 'center' ? 'center' : 'left' }}>
      {lines.map((line, i) => {
        const head = /^#{2,3}\s+(.*)/.exec(line)
        const item = /^[-*]\s+(.*)/.exec(line)
        return <div key={i} style={{ fontSize: b.fs(head ? 17 : 15), lineHeight: `${b.fs(head ? 24 : 22)}px`, fontWeight: head ? 800 : 400, paddingLeft: item ? 12 : 0 }}>{item ? '•  ' : ''}{inline(head ? head[1] : item ? item[1] : line, b.primary)}</div>
      })}
    </div>
  )
}

function Faq({ props, ink }: P) {
  const { b } = useP()
  const [open, setOpen] = useState<number | null>(null)
  if (!listOf(props.items).length) return <Empty text="Soru ekleyin." />
  return (
    <div style={{ ...pad, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Title text={props.title} ink={ink} />
      {listOf(props.items).map((item, i) => (
        <div key={i} onClick={() => setOpen(open === i ? null : i)} style={{ background: b.surface, border: `1px solid ${b.line}`, borderRadius: b.buttonRadius, padding: 12, cursor: 'pointer' }}>
          <div style={{ display: 'flex', gap: 8, fontSize: b.fs(14), fontWeight: 700, color: b.text }}><span style={{ flex: 1 }}>{item.question}</span><ChevronDown size={18} color={b.primary} style={{ transform: open === i ? 'rotate(180deg)' : undefined }} /></div>
          {open === i && <div style={{ marginTop: 8, fontSize: b.fs(14), color: b.muted, lineHeight: `${b.fs(21)}px` }}>{item.answer}</div>}
        </div>
      ))}
    </div>
  )
}

function Stats({ props, ink }: P) {
  const { b } = useP()
  const band = props.look === 'band'
  const items = listOf(props.items)
  if (!items.length) return <Empty text="Rakam ekleyin." />
  return (
    <div style={pad}>
      <Title text={props.title} ink={ink} />
      <div style={{ ...wrap, ...(band ? { background: b.primary, borderRadius: b.radius, padding: 12 } : {}) }}>
        {items.map((item, i) => (
          <div key={i} style={{ flex: '1 1 28%', textAlign: 'center', padding: 12, ...(band ? {} : { background: b.surface, border: `1px solid ${b.line}`, borderRadius: Math.min(b.radius, 16) }) }}>
            <div style={{ fontSize: b.fs(20), fontWeight: 900, color: band ? b.onPrimary : b.primary }}>{item.value}</div>
            <div style={{ fontSize: b.fs(11), color: band ? b.onPrimary : b.muted }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ContactCard({ props }: P) {
  const { b, data } = useP()
  const phone = data.site?.contact?.phone
  return (
    <div style={pad}>
      <div style={{ background: b.surface, border: `1px solid ${b.line}`, borderRadius: b.radius, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: b.fs(15), fontWeight: 800, color: b.text }}>{props.title || b.name}</div>
        {phone && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: b.primary, fontSize: b.fs(15), fontWeight: 700 }}><Phone size={16} />{phone}</div>}
        {props.show_buttons !== false && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
            <Button label="Makbuz Doğrula" kind="outline" always /><Button label="Hakkımızda & İletişim" kind="outline" ink={b.text} always />
          </div>
        )}
      </div>
    </div>
  )
}

function NewsList({ props, ink }: P) {
  const { b, data } = useP()
  const posts = data.news.filter((n) => !props.kind || n.kind === props.kind).slice(0, props.limit || 5)
  if (!posts.length) return <Empty text="Yayında haber yok." />
  const look = props.look || 'list'
  const list = look === 'list'
  return (
    <div>
      <div style={pad}><Title text={props.title} ink={ink} /></div>
      <div style={look === 'carousel' ? row : { ...pad, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {posts.map((p) => (
          <div key={p.id} style={{ background: b.surface, border: `1px solid ${b.line}`, borderRadius: b.radius, overflow: 'hidden', ...(list ? { display: 'flex', alignItems: 'center', gap: 12, padding: 8 } : {}), ...(look === 'carousel' ? { flex: '0 0 240px' } : {}) }}>
            {list ? <div style={{ width: 72, flex: 'none', borderRadius: Math.min(b.radius, 14), overflow: 'hidden' }}><Cover src={p.image_url} height={72} /></div> : <Cover src={p.image_url} height={140} />}
            <div style={{ flex: 1, minWidth: 0, padding: list ? 0 : 12 }}>
              <div style={{ fontSize: b.fs(14), fontWeight: 800, color: b.text, ...clamp(2) }}>{p.title}</div>
              {p.summary && <div style={{ fontSize: b.fs(12), color: b.muted, ...clamp(2) }}>{p.summary}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ImageBlock({ props }: P) {
  const { b, open } = useP()
  if (!props.image_url) return <Empty text="Görsel seçin." />
  return (
    <div style={pad} onClick={() => usable(props.action) && open(props.action)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={props.image_url} alt={props.alt || ''} style={{ width: '100%', aspectRatio: String(props.ratio || '16-9').replace('-', '/'), objectFit: 'cover', borderRadius: b.radius, background: b.line }} />
    </div>
  )
}

function Gallery({ props, ink }: P) {
  const { b } = useP()
  const items = listOf(props.items).filter((i) => i?.image_url)
  if (!items.length) return <Empty text="Görsel ekleyin." />
  const grid = (props.look || 'grid') === 'grid'
  return (
    <div>
      <div style={pad}><Title text={props.title} ink={ink} /></div>
      <div style={grid ? { ...pad, ...wrap } : row}>
        {items.map((item, i) => <div key={i} style={{ flex: grid ? '1 1 48%' : '0 0 220px', borderRadius: Math.min(b.radius, 16), overflow: 'hidden' }}><Cover src={item.image_url} height={140} /></div>)}
      </div>
    </div>
  )
}

function VideoBlock({ props, ink }: P) {
  const { b } = useP()
  const v = props.video
  if (!v) return <Empty text="Video adresi girin." />
  return (
    <div style={pad}>
      <Title text={props.title} ink={ink} />
      <div style={{ position: 'relative', borderRadius: b.radius, overflow: 'hidden' }}>
        <Cover src={props.image_url || (v.provider === 'youtube' ? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` : null)} height={196} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: 60, height: 60, borderRadius: 30, background: b.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={26} color={b.onAccent} /></span>
        </div>
      </div>
    </div>
  )
}

function Countdown({ props, ink }: P) {
  const { b } = useP()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const end = props.ends_at ? new Date(props.ends_at).getTime() : NaN
  if (Number.isNaN(end)) return <Empty text="Bitiş tarihi seçin." />
  const left = Math.max(0, Math.floor((end - now) / 1000))
  const parts: [string, number][] = [['Gün', Math.floor(left / 86400)], ['Saat', Math.floor(left / 3600) % 24], ['Dakika', Math.floor(left / 60) % 60], ['Saniye', left % 60]]
  return (
    <div style={{ ...pad, color: ink, textAlign: 'center' }}>
      {props.title && <div style={{ fontSize: b.fs(16), fontWeight: 800, marginBottom: 8 }}>{props.title}</div>}
      {!left ? <div style={{ fontSize: b.fs(18), fontWeight: 800 }}>{props.done_text}</div> : (
        <div style={{ display: 'flex', gap: 8 }}>{parts.map(([label, value]) => <div key={label} style={{ flex: 1, background: b.primary, color: b.onPrimary, borderRadius: b.buttonRadius, padding: '10px 0' }}><div style={{ fontSize: b.fs(20), fontWeight: 900 }}>{value}</div><div style={{ fontSize: b.fs(11) }}>{label}</div></div>)}</div>
      )}
    </div>
  )
}

const Spacer = ({ props }: P) => <div style={{ height: props.size || 24 }} />
const Divider = ({ ink }: P) => <div style={pad}><div style={{ height: 1, background: ink, opacity: 0.15 }} /></div>

const BLOCKS: Record<string, (p: P) => ReactNode> = {
  hero: Hero,
  banner_slider: BannerSlider,
  quick_categories: QuickCategories,
  campaign_list: CampaignList,
  campaign_carousel: CampaignCarousel,
  featured_campaign: FeaturedCampaign,
  progress: Progress,
  quick_donate: QuickDonate,
  shortcuts: Shortcuts,
  tool_cards: ToolCards,
  buttons: Buttons,
  cta_band: CtaBand,
  heading: Heading,
  richtext: RichText,
  faq: Faq,
  stats: Stats,
  contact_card: ContactCard,
  news_list: NewsList,
  image: ImageBlock,
  gallery: Gallery,
  video: VideoBlock,
  countdown: Countdown,
  spacer: Spacer,
  divider: Divider,
}

const SPACE: Record<string, number> = { none: 0, small: 6, normal: 12, large: 28 }

export function AppBlockView({ block }: { block: AppBlock }) {
  const { b } = useP()
  const View = BLOCKS[block.type]
  if (!View) return null
  const { props } = block
  const tones: Record<string, string> = { white: '#FFFFFF', soft: `${b.primary}12`, brand: b.primary, accent: b.accent, dark: '#0F172A' }
  const bg = tones[props.tone || '']
  const ink = props.tone === 'white' ? '#0F172A' : bg && props.tone !== 'soft' ? onColor(bg) : b.text
  const space = SPACE[props.space || 'normal'] ?? 12
  return <div style={{ background: bg, padding: bg ? `${space}px 0` : `${space / 2}px 0` }}><View props={props} ink={ink} /></div>
}
