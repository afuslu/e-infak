import { type Block, FIXED_CHILD, FIXED_PARENT, cloneBlock } from './blocks'

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

/** Move a block before/after another, or inside a container (at its end). */
export function moveBlock(blocks: Block[], id: string, targetId: string, position: 'before' | 'after' | 'inside'): Block[] {
  const moving = findBlock(blocks, id)
  const target = findBlock(blocks, targetId)
  if (!moving || !target || contains(moving, targetId)) return blocks
  if (FIXED_CHILD.has(moving.type) || (position === 'inside' && FIXED_PARENT.has(target.type))) return blocks
  const without = removeBlock(blocks, id)
  if (position === 'inside') return insertBlock(without, targetId, target.children?.length ?? 0, moving)
  const place = locate(without, targetId)
  if (!place) return blocks
  return insertBlock(without, place[0], place[1] + (position === 'after' ? 1 : 0), moving)
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
