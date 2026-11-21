'use client'

import { useParams } from 'next/navigation'
import { DonorCardView } from '../../../../../components/admin/donors/DonorCardView'
import { useDonorContext } from '../../../../../components/admin/donors/useDonorContext'

export default function DonorCardPage() {
  const { id } = useParams<{ id: string }>()
  const ctx = useDonorContext()
  return <DonorCardView donorId={id} staff={ctx.staff} options={ctx.options} perms={ctx.perms} canIssue={ctx.canIssue} />
}
