'use client'

import axios from 'axios'
import { adminApiBase, adminAuthHeaders, adminGet, adminSend } from './admin-access'

export interface MediaVariant { width: number; height: number; url: string; size: number }

export interface MediaAsset {
  id: string
  url: string
  thumbnail_url: string
  source_url: string
  srcset: string
  folder_id: string | null
  original_name: string
  mime: string
  size_bytes: number
  width: number
  height: number
  alt_text: string
  caption: string
  credit: string
  focal_x: number
  focal_y: number
  tags: string[]
  variants: MediaVariant[]
  cropped: boolean
  created_at: string | null
}

export interface MediaFolder { id: string; name: string; count: number }
export interface MediaFolders { folders: MediaFolder[]; root_count: number; total: number }
export interface MediaUsage { used_bytes: number; quota_bytes: number; count: number }
export interface MediaReference { type: string; label: string; id: string; title: string; field: string; link: string }

export interface MediaQuery { folder?: string; q?: string; tag?: string; unused?: boolean; page?: number; page_size?: number }

export const mediaApi = {
  list: (params: MediaQuery) =>
    adminGet<{ items: MediaAsset[]; total: number; page: number; page_size: number }>('/media', { ...params }),
  folders: () => adminGet<MediaFolders>('/media/folders'),
  tags: () => adminGet<string[]>('/media/tags'),
  usage: () => adminGet<MediaUsage>('/media/usage'),
  references: (id: string) => adminGet<MediaReference[]>(`/media/${id}/usage`),
  update: (id: string, data: Partial<Pick<MediaAsset, 'original_name' | 'alt_text' | 'caption' | 'credit' | 'focal_x' | 'focal_y' | 'tags' | 'folder_id'>>) =>
    axios.patch<MediaAsset>(`${adminApiBase()}/api/v1/admin-features/media/${id}`, data, { headers: adminAuthHeaders() }),
  crop: (id: string, box: { x: number; y: number; width: number; height: number }) =>
    adminSend<MediaAsset>('post', `/media/${id}/crop`, box),
  remove: (id: string, force = false) =>
    axios.delete<{ deleted: boolean; was_used: boolean }>(`${adminApiBase()}/api/v1/admin-features/media/${id}`, {
      headers: adminAuthHeaders(), params: force ? { force: true } : undefined,
    }),
  move: (ids: string[], folderId: string | null) => adminSend<{ moved: number }>('post', '/media/move', { ids, folder_id: folderId }),
  createFolder: (name: string) => adminSend<{ id: string; name: string }>('post', '/media/folders', { name }),
  renameFolder: (id: string, name: string) => adminSend<{ id: string; name: string }>('put', `/media/folders/${id}`, { name }),
  deleteFolder: (id: string) => adminSend('delete', `/media/folders/${id}`),
  upload: (file: File, folderId: string | null, onProgress?: (percent: number) => void) => {
    const body = new FormData()
    body.append('file', file)
    if (folderId) body.append('folder_id', folderId)
    return axios.post<MediaAsset>(`${adminApiBase()}/api/v1/admin-features/media`, body, {
      headers: adminAuthHeaders(),
      onUploadProgress: (e) => onProgress?.(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
    })
  },
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export const ACCEPTED_IMAGES = 'image/png,image/jpeg,image/webp,image/gif,image/x-icon'
