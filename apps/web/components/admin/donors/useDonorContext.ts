'use client'

import { useEffect, useState } from 'react'
import { adminGet, can, useAdminAccess } from '../../../lib/admin-access'
import type { DonorOptions, DonorPerms, Staff } from './types'

/** Staff list, free-field suggestions and the viewer's donor permissions, shared by the donor pages. */
export function useDonorContext() {
  const { data: access } = useAdminAccess()
  const [staff, setStaff] = useState<Staff[]>([])
  const [options, setOptions] = useState<DonorOptions>()
  useEffect(() => {
    adminGet<Staff[]>('/users').then((res) => setStaff(res.data.filter((s) => s.is_active))).catch(() => {})
    adminGet<DonorOptions>('/donors-options').then((res) => setOptions(res.data)).catch(() => {})
  }, [])
  const perms: DonorPerms = {
    create: can(access, 'donors.create'), update: can(access, 'donors.update'), remove: can(access, 'donors.delete'),
    imports: can(access, 'donors.import'), sms: can(access, 'sms.send'), notes: can(access, 'donors.notes_write'),
    exports: can(access, 'donors.export'),
  }
  return { access, staff, options, perms, canIssue: can(access, 'receipts.create') }
}
