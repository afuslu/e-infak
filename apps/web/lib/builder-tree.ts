import { type Block, type BuilderCatalog, FIXED_CHILD, FIXED_PARENT, cloneBlock } from './blocks'

/** Immutable helpers for the editor's block tree. */

export function findBlock(blocks: Block[], id: string): Block | null {
  for (const b of blocks) {
    if (b.id === id) return b
    const inner = b.children ? findBlock(b.children, id) : null
    if (inner) return inner
  }
  return null
}

/** [parent id or null, index] of a block. */
export function locate(blocks: Block[], id: string, parent: string | null = null): [string | null, number] | null {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].id === id) return [parent, i]
    const inner = blocks[i].children ? locate(blocks[i].children!, id, blocks[i].id) : null
    if (inner) return inner
  }
  return null
}

export function updateBlock(blocks: Block[], id: string, fn: (b: Block) => Block): Block[] {
  return blocks.map((b) => (b.id === id ? fn(b) : b.children ? { ...b, children: updateBlock(b.children, id, fn) } : b))
}

export function removeBlock(blocks: Block[], id: string): Block[] {
  return blocks.filter((b) => b.id !== id).map((b) => (b.children ? { ...b, children: removeBlock(b.children, id) } : b))
}

export function insertBlock(blocks: Block[], parentId: string | null, index: number, block: Block): Block[] {
  if (parentId === null) {
    const next = [...blocks]
    next.splice(Math.max(0, Math.min(index, next.length)), 0, block)
    return next
  }
  return blocks.map((b) => {
    if (b.id === parentId) {
      const children = [...(b.children || [])]
      children.splice(Math.max(0, Math.min(index, children.length)), 0, block)
      return { ...b, children }
    }
    return b.children ? { ...b, children: insertBlock(b.children, parentId, index, block) } : b
  })
}

function contains(block: Block, id: string): boolean {
  return block.id === id || !!block.children?.some((c) => contains(c, id))
}

/** Whether `block` (with its children) may sit directly inside a parent of `parentType` (null = top level). */
export type PlaceRule = (parentType: string | null, block: Block) => boolean

/** The backend's placement rules (services/backend/app/services/blocks.py `_block`), so the editor never builds a tree the server would reject or prune. */
export function placementRule(catalog: BuilderCatalog, kind: string): PlaceRule {
  const fits: PlaceRule = (parentType, block) => {
    const spec = catalog.blocks[block.type]
    if (!spec) return false
    if (spec.parent && parentType !== spec.parent) return false
    const parentSpec = parentType ? catalog.blocks[parentType] : null
    if (parentSpec?.child_type && block.type !== parentSpec.child_type) return false
    if (kind === 'header') {
      if (parentType === null && !(catalog.header_top_level || ['header_row']).includes(block.type)) return false
      if (parentType === 'header_slot' && !catalog.header_slot_children.includes(block.type)) return false
    } else if (!(spec.zones || catalog.content_zones).includes(kind)) {
      return false
    }
    return (block.children || []).every((child) => fits(block.type, child))
  }
  return fits
}

/** Whether the block `id` is allowed where it now sits in `blocks`. */
export function placedOk(blocks: Block[], id: string, fits: PlaceRule): boolean {
  const place = locate(blocks, id)
  const block = findBlock(blocks, id)
  if (!place || !block) return false
  return fits(place[0] ? findBlock(blocks, place[0])?.type ?? null : null, block)
}

/**
 * Move a block before/after another, or inside a container (at its end).
 * Dropping next to a fixed slot (a column, a header area) puts the block into that slot.
 * Returns `blocks` unchanged when the move is not allowed.
 */
export function moveBlock(blocks: Block[], id: string, targetId: string, position: 'before' | 'after' | 'inside', fits?: PlaceRule): Block[] {
  const moving = findBlock(blocks, id)
  const target = findBlock(blocks, targetId)
  if (!moving || !target || contains(moving, targetId)) return blocks
  if (FIXED_CHILD.has(moving.type) || (position === 'inside' && FIXED_PARENT.has(target.type))) return blocks
  const without = removeBlock(blocks, id)
  let next: Block[]
  if (position === 'inside' || FIXED_CHILD.has(target.type)) {
    const slot = findBlock(without, targetId)
    next = insertBlock(without, targetId, position === 'before' ? 0 : slot?.children?.length ?? 0, moving)
  } else {
    const place = locate(without, targetId)
    if (!place) return blocks
    next = insertBlock(without, place[0], place[1] + (position === 'after' ? 1 : 0), moving)
  }
  return fits && !placedOk(next, id, fits) ? blocks : next
}

export function shiftBlock(blocks: Block[], id: string, delta: -1 | 1): Block[] {
  const place = locate(blocks, id)
  if (!place) return blocks
  const [parentId, index] = place
  const siblings = parentId ? findBlock(blocks, parentId)?.children || [] : blocks
  const to = index + delta
  if (to < 0 || to >= siblings.length || FIXED_CHILD.has(siblings[index].type)) return blocks
  const moving = siblings[index]
  return insertBlock(removeBlock(blocks, id), parentId, to, moving)
}

export function duplicateBlock(blocks: Block[], id: string): [Block[], string | null] {
  const place = locate(blocks, id)
  const original = findBlock(blocks, id)
  if (!place || !original || FIXED_CHILD.has(original.type)) return [blocks, null]
  const copy = cloneBlock(original)
  return [insertBlock(blocks, place[0], place[1] + 1, copy), copy.id]
}

export function countBlocks(blocks: Block[]): number {
  return blocks.reduce((n, b) => n + 1 + (b.children ? countBlocks(b.children) : 0), 0)
}

/** Pre-publish checklist. */
export function checklist(blocks: Block[]): string[] {
  const issues: string[] = []
  let h1 = 0
  const walk = (list: Block[]) => list.forEach((b) => {
    if (b.type === 'heading' && b.props.level === 'h1') h1++
    if (b.type === 'hero') h1++
    if ((b.type === 'image' || b.type === 'image_text') && b.props.image_url && !b.props.alt) issues.push('Bir görselde “alternatif metin” eksik (görme engelliler ve arama motorları için).')
    if (b.type === 'slider' && !(b.props.slides || []).length) issues.push('Slider’da hiç slayt yok.')
    if (b.type === 'slider' && (b.props.slides || []).some((s: any) => !s.image_url)) issues.push('Slider’da görseli olmayan slayt var.')
    if (b.type === 'carousel' && !(b.props.items || []).length) issues.push('Carousel’de hiç kart yok.')
    if (b.type === 'image_gallery' && !(b.props.items || []).some((i: any) => i.image_url)) issues.push('Görsel galerisinde hiç görsel yok.')
    if (b.type === 'countdown' && !b.props.target) issues.push('Geri sayım bloğunda hedef tarih seçilmemiş.')
    if (b.type === 'video' && !b.props.url) issues.push('Video bloğunda video bağlantısı eksik.')
    if (b.type === 'campaign_card' && !b.props.campaign_id) issues.push('“Tek kampanya” bloğunda kampanya seçilmemiş.')
    if (b.type === 'buttons' && (b.props.items || []).some((i: any) => i.label && !i.url)) issues.push('Bağlantısı olmayan buton var.')
    const st = b.style?.desktop
    if (st?.text_color && st?.bg_color && st.text_color === st.bg_color) issues.push('Bir blokta yazı rengi arka planla aynı; yazı okunmaz.')
    if (b.children) walk(b.children)
  })
  walk(blocks)
  if (h1 > 1) issues.push('Sayfada birden fazla ana başlık (H1) var; arama motorları için bir tane önerilir.')
  return Array.from(new Set(issues))
}
