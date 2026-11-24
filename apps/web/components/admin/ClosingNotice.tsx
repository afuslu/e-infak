'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adminGet, can, useAdminAccess } from '../../lib/admin-access'

/** Countdown strip while the organisation has a closing date. */
export function ClosingNotice() {
  const { data: access } = useAdminAccess()
  const [notice, setNotice] = useState<{ closes_on: string; days_left: number } | null>(null)
  useEffect(() => {
    adminGet<{ closes_on: string; days_left: number } | null>('/data-export/notice').then((r) => setNotice(r.data)).catch(() => {})
  }, [])
  if (!notice) return null
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
      <span className="flex-1">
        Hizmetiniz {new Date(`${notice.closes_on}T00:00:00`).toLocaleDateString('tr-TR')} tarihinde kapanıyor
        {notice.days_left > 0 ? ` · ${notice.days_left} gün kaldı` : ' · kapanış tarihi geldi'}
      </span>
      {can(access, 'settings.manage') && <Link href="/admin/verilerim" className="underline">Verilerimi yedekle</Link>}
    </div>
  )
}
