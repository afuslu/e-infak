import type { BlockSpec, FieldSpec } from '../../lib/blocks'

export interface AppAction { type: string; target: string }
export interface AppBlock { id: string; type: string; props: Record<string, any> }
export interface AppPage { id: string; title: string; blocks: AppBlock[] }
export interface AppLink { id: string; label?: string; icon?: string; action?: AppAction; highlight?: boolean }
export interface AppDesign {
  schema: number
  theme: Record<string, any>
  header: Record<string, any>
  tabs: AppLink[]
  drawer: AppLink[]
  pages: AppPage[]
}
export interface AppCatalog {
  blocks: Record<string, BlockSpec>
  theme: Record<string, FieldSpec>
  header: Record<string, FieldSpec>
  tab: Record<string, FieldSpec>
  drawer: Record<string, FieldSpec>
  actions: Record<string, string>
  screens: Record<string, string>
  required_screens: string[]
  icons: Record<string, string>
  themes: { key: string; label: string; theme: Record<string, any> }[]
  templates: { key: string; label: string; blocks: AppBlock[] }[]
  default: AppDesign
  limits: { pages: number; blocks: number; drawer: number; tabs_min: number; tabs_max: number }
}
export interface DesignState {
  design: AppDesign
  version: number
  has_draft: boolean
  is_published: boolean
  published_at: string | null
  published_by: string | null
}
/** Live data the preview draws with. */
export interface PreviewData {
  site: any
  campaigns: any[]
  news: any[]
  categories: any[]
}

export const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`
