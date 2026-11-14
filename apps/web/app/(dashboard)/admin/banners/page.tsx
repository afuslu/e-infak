'use client'

import Link from 'next/link'
import { Card } from '@e-infak/ui'

export default function AdminBannersPage() {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <Card className="space-y-4 border border-gray-100 p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Slider ve Banner’lar Site Yapıcı’ya Taşındı</h1>
        <p className="text-sm text-gray-600">
          Ana sayfa slider’ları, tam genişlik banner’lar ve üst duyuru çubukları artık görsel olarak doğrudan <strong>Site Yapıcı</strong> üzerinden yönetilmektedir.
        </p>
        <div>
          <Link
            href="/admin/site-yapici"
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
          >
            Site Yapıcı’yı Aç ↗
          </Link>
        </div>
      </Card>
    </div>
  )
}
