'use client'

import { useEffect, useState } from 'react'
import { Card } from '@e-infak/ui'
import { MediaLibrary } from '../../../../components/admin/media/MediaLibrary'
import { MediaDetail } from '../../../../components/admin/media/MediaDetail'
import { mediaApi, type MediaAsset, type MediaFolder } from '../../../../lib/media'

export default function AdminMediaPage() {
  const [selected, setSelected] = useState<MediaAsset | null>(null)
  const [folders, setFolders] = useState<MediaFolder[]>([])
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    mediaApi.folders().then((r) => setFolders(r.data.folders)).catch(() => undefined)
  }, [reloadKey, selected?.id])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Medya Kütüphanesi</h1>
        <p className="mt-1 text-sm text-gray-500">
          Sitede kullandığınız bütün görseller. Yüklenen görseller WebP’ye çevrilir ve her ekran boyutu için küçültülür; alt metin ve odak noktası buradan düzenlenir.
        </p>
      </div>

      <div className="flex flex-col gap-6 xl:flex-row">
        <Card className="min-w-0 flex-1 border border-gray-100 p-4 shadow-sm">
          <MediaLibrary selectedId={selected?.id} onSelect={setSelected} reloadKey={reloadKey} />
        </Card>
        {selected && (
          <Card className="border border-gray-100 p-4 shadow-sm xl:sticky xl:top-4 xl:w-96 xl:self-start">
            <MediaDetail
              asset={selected}
              folders={folders}
              onChanged={(asset) => { setSelected(asset); setReloadKey((k) => k + 1) }}
              onDeleted={() => { setSelected(null); setReloadKey((k) => k + 1) }}
              onClose={() => setSelected(null)}
            />
          </Card>
        )}
      </div>
    </div>
  )
}
