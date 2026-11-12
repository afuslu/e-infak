/**
 * Site builder blocks: types, per-language text and scoped CSS.
 *
 * The backend (services/backend/app/services/blocks.py) validates every value
 * (numbers in range, #RRGGBB colours, allow-listed URLs, enums), so the CSS built
 * here only ever contains values from that closed set. Used by both the public
 * renderer and the editor preview, so what the editor shows is what visitors get.
 */

export type Device = 'desktop' | 'tablet' | 'mobile'
export type StyleValues = Record<string, string | number | boolean>

export interface Block {
  id: string
  type: string
  props: Record<string, any>
  style?: Partial<Record<Device, StyleValues>>
  advanced?: Record<string, any>
  translations?: Record<string, Record<string, any>>
  children?: Block[]
}

export interface FieldSpec {
  kind: 'text' | 'textarea' | 'richtext' | 'url' | 'image' | 'color' | 'select' | 'number' | 'bool' | 'campaign' | 'campaigns' | 'datetime' | 'video' | 'list'
  label: string
  choices?: Record<string, string>
  default?: any
  min?: number
  max?: number
  step?: number
  unit?: string
  required?: boolean
  translatable?: boolean
  placeholder?: string
  help?: string
  show_if?: Record<string, string>
  fields?: Record<string, FieldSpec>
  max_items?: number
  min_items?: number
  item_label?: string
}

export interface BlockSpec {
  label: string
  group: string
  icon: string
  container?: boolean
  child_type?: string
  child_count?: number
  parent?: string
  zones?: string[]
  hidden?: boolean
  fields: Record<string, FieldSpec>
}

export interface BuilderCatalog {
  blocks: Record<string, BlockSpec>
  style_groups: Record<string, Record<string, FieldSpec>>
  advanced: Record<string, FieldSpec>
  devices: Device[]
  langs: string[]
  content_zones: string[]
  header_slot_children: string[]
  /** Header page: block types allowed at the top level (rows, announcement bar). */
  header_top_level?: string[]
}

/** Slots of a fixed layout (a column of Sütunlar, an area of a header row): never moved, deleted or copied alone. */
export const FIXED_CHILD = new Set(['column', 'header_slot'])
/** Containers made of such slots: blocks go into a slot, not straight into them. */
export const FIXED_PARENT = new Set(['columns', 'header_row'])

export const BREAKPOINTS: Record<Device, string | null> = {
  desktop: null,
  tablet: '(max-width: 1023px)',
  mobile: '(max-width: 639px)',
}

/** Props with the visitor's language applied (top-level texts and list items). */
export function localizedProps(block: Block, lang: string): Record<string, any> {
  const overrides = block.translations?.[lang]
  if (!overrides) return block.props
  const props: Record<string, any> = { ...block.props }
  for (const [key, value] of Object.entries(overrides)) {
    if (Array.isArray(value) && Array.isArray(props[key])) {
      props[key] = props[key].map((item: Record<string, any>, i: number) => ({ ...item, ...(value[i] || {}) }))
    } else if (value) {
      props[key] = value
    }
  }
  return props
}

const SHADOWS: Record<string, string> = {
  sm: '0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.06)',
  md: '0 6px 16px rgba(0,0,0,.10)',
  lg: '0 14px 32px rgba(0,0,0,.14)',
  xl: '0 24px 56px rgba(0,0,0,.20)',
}
const WIDTHS: Record<string, string> = { narrow: '820px', wide: '1440px', full: 'none' }

const hexToRgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}
const safeHex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const safeUrl = (v: unknown) =>
  typeof v === 'string' && /^(https:\/\/|\/(?!\/))[^\s"'()\\]+$/.test(v) ? v : null

/** Declarations for one device; `inner` styles go to the content box. */
function declarations(s: StyleValues): { outer: string[]; inner: string[]; hover: string[]; overlay: string[] } {
  const outer: string[] = []
  const inner: string[] = []
  const hover: string[] = []
  const overlay: string[] = []
  const px = (key: string, prop: string, into = outer) => { const v = num(s[key]); if (v !== null) into.push(`${prop}:${v}px`) }

  if (s.font_family === 'heading') outer.push('font-family:var(--font-heading)')
  if (s.font_family === 'sans') outer.push('font-family:var(--font-sans)')
  px('font_size', 'font-size')
  if (typeof s.font_weight === 'string' && /^[1-9]00$/.test(s.font_weight)) outer.push(`font-weight:${s.font_weight}`)
  if (num(s.line_height) !== null) outer.push(`line-height:${s.line_height}`)
  px('letter_spacing', 'letter-spacing')
  if (['uppercase', 'lowercase', 'capitalize'].includes(String(s.text_transform))) outer.push(`text-transform:${s.text_transform}`)
  if (safeHex(s.text_color)) outer.push(`color:${s.text_color}`, `--block-text:${s.text_color}`)
  if (['left', 'center', 'right', 'justify'].includes(String(s.text_align))) outer.push(`text-align:${s.text_align}`)

  const layers: string[] = []
  const from = safeHex(s.bg_gradient_from)
  const to = safeHex(s.bg_gradient_to)
  if (from && to) layers.push(`linear-gradient(${num(s.bg_gradient_angle) ?? 180}deg,${from},${to})`)
  const image = safeUrl(s.bg_image)
  if (image) layers.push(`url("${image}")`)
  if (layers.length) {
    outer.push(`background-image:${layers.join(',')}`)
    outer.push(`background-size:${s.bg_size === 'contain' ? 'contain' : s.bg_size === 'auto' ? 'auto' : 'cover'}`)
    outer.push(`background-position:${['top', 'bottom', 'left', 'right'].includes(String(s.bg_position)) ? s.bg_position : 'center'}`)
    outer.push('background-repeat:no-repeat')
    if (s.bg_fixed) outer.push('background-attachment:fixed')
  }
  if (safeHex(s.bg_color)) outer.push(`background-color:${s.bg_color}`)
  const overlayColor = safeHex(s.overlay_color)
  if (overlayColor) overlay.push(`background:${hexToRgba(overlayColor, (num(s.overlay_opacity) ?? 50) / 100)}`)

  px('padding_top', 'padding-top'); px('padding_bottom', 'padding-bottom')
  px('padding_left', 'padding-left'); px('padding_right', 'padding-right')
  px('margin_top', 'margin-top'); px('margin_bottom', 'margin-bottom')
  px('min_height', 'min-height')
  const width = typeof s.width === 'string' ? WIDTHS[s.width] : undefined
  if (width) inner.push(`max-width:${width}`)
  px('max_width', 'max-width', inner)
  if (s.content_valign === 'center' || s.content_valign === 'end') {
    outer.push('display:flex', 'flex-direction:column', `justify-content:${s.content_valign === 'end' ? 'flex-end' : 'center'}`)
  }
  if (num(s.border_width) !== null && (s.border_width as number) > 0) {
    outer.push(`border:${s.border_width}px ${['dashed', 'dotted'].includes(String(s.border_style)) ? s.border_style : 'solid'} ${safeHex(s.border_color) || 'currentColor'}`)
  }
  if (num(s.radius) !== null) outer.push(`border-radius:${s.radius}px`, 'overflow:hidden')
  if (typeof s.shadow === 'string' && SHADOWS[s.shadow]) outer.push(`box-shadow:${SHADOWS[s.shadow]}`)
  if (typeof s.hover_shadow === 'string' && SHADOWS[s.hover_shadow]) hover.push(`box-shadow:${SHADOWS[s.hover_shadow]}`)
  if (num(s.hover_scale) !== null && s.hover_scale !== 100) hover.push(`transform:scale(${(s.hover_scale as number) / 100})`)
  return { outer, inner, hover, overlay }
}

function blockCss(block: Block, out: string[], editing = false) {
  const sel = `.b-${block.id}`
  for (const device of ['desktop', 'tablet', 'mobile'] as Device[]) {
    const values = block.style?.[device]
    const rules: string[] = []
    if (values) {
      const d = declarations(values)
      if (d.outer.length) rules.push(`${sel}{${d.outer.join(';')}}`)
      if (d.inner.length) rules.push(`${sel}>.b-inner{${d.inner.join(';')};margin-inline:auto}`)
      if (d.hover.length) rules.push(`${sel}{transition:box-shadow .25s,transform .25s}${sel}:hover{${d.hover.join(';')}}`)
      if (d.overlay.length) rules.push(`${sel}>.b-overlay{${d.overlay.join(';')}}`)
    }
    if (block.advanced?.[`hide_${device}`]) {
      rules.push(editing ? `${sel}{opacity:.35;filter:grayscale(.4)}` : `${sel}{display:none!important}`)
    }
    if (rules.length) out.push(BREAKPOINTS[device] ? `@media ${BREAKPOINTS[device]}{${rules.join('')}}` : rules.join(''))
  }
  block.children?.forEach((child) => blockCss(child, out, editing))
}

/** Scoped CSS for a whole block tree. Desktop first, then tablet and phone overrides. */
export function compileCss(blocks: Block[], editing = false): string {
  const out: string[] = []
  blocks.forEach((b) => blockCss(b, out, editing))
  return out.join('\n')
}

export const newBlockId = (type: string) =>
  `${type.replace(/_/g, '-').slice(0, 12)}-${Math.random().toString(36).slice(2, 10)}`

/** Defaults for a new block of this type, from the catalogue. */
export function newBlock(type: string, spec: BlockSpec): Block {
  const props: Record<string, any> = {}
  for (const [key, field] of Object.entries(spec.fields)) {
    if (field.default !== undefined) props[key] = field.default
    if (field.kind === 'list' && field.min_items) {
      const item: Record<string, any> = {}
      for (const [k, f] of Object.entries(field.fields || {})) if (f.default !== undefined) item[k] = f.default
      props[key] = Array.from({ length: field.min_items }, () => ({ ...item }))
    }
  }
  if (type === 'heading') props.text = 'Yeni başlık'
  if (type === 'richtext') props.text = 'Metninizi buraya yazın.'
  if (type === 'slider' && Array.isArray(props.slides) && props.slides.length === 1 && !props.slides[0].image_url) {
    props.slides[0] = {
      ...props.slides[0],
      image_url: '/demo/water.webp',
      badge: 'KAMPANYA',
      title: 'Yeni Kampanya Başlığı',
      text: 'Kampanya açıklamanızı ve bağış çağrınızı buraya yazabilirsiniz.',
      button_label: 'Bağış Yap',
      button_url: '/kampanyalar',
    }
  }
  const block: Block = { id: newBlockId(type), type, props, style: {}, advanced: {} }
  if (spec.container) {
    block.children = []
    if (spec.child_type) {
      const childType = spec.child_type
      const count = spec.child_count || String(props.ratio || '1-1').split('-').length
      block.children = Array.from({ length: count }, () => ({ id: newBlockId(childType), type: childType, props: {}, style: {}, advanced: {}, children: [] }))
    }
  }
  return block
}

/** Copy with fresh ids (paste / duplicate). */
export function cloneBlock(block: Block): Block {
  return { ...JSON.parse(JSON.stringify(block)), id: newBlockId(block.type), children: block.children?.map(cloneBlock) }
}
