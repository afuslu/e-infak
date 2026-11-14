'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, formatMoney, hasPermission, useAdminAccess } from '../../../../../lib/admin-access'
import { Notice, ghostButton, primaryButton } from '../../../../../components/admin/FormKit'
import { PageHeader, TBody, THead, Table, Td, Th, Tr, confirmDialog } from '../../../../../components/admin/ui'

interface DonorBrief {
  id: string; full_name: string; phone: string | null; email: string | null; tc_masked: string | null; city: string | null
  total_donations: number; total_donated_cents: number; last_donation_at: string | null; created_at: string; tags: string[]
}
interface Group { reasons: string[]; donors: DonorBrief[] }

export default function DuplicateDonorsPage() {
  const { data: access } = useAdminAccess()
  const canEdit = hasPermission(access, 'donor_manage')
  const [includeNames, setIncludeNames] = useState(false)
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [targets, setTargets] = useState<Record<number, string>>({})
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const load = async () => {
    try {
      const res = await adminGet<{ groups: Group[] }>('/donors/duplicates', { include_names: includeNames })
      setGroups(res.data.groups)
      setTargets({})
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Mükerrer kayıtlar yüklenemedi') })
    }
  }
  useEffect(() => { load() }, [includeNames]) // eslint-disable-line react-hooks/exhaustive-deps

  const merge = async (index: number, group: Group) => {
    const target = targets[index] || group.donors[0].id
    const sources = group.donors.filter((d) => d.id !== target)
    const targetName = group.donors.find((d) => d.id === target)?.full_name
    if (!(await confirmDialog(`${sources.length} kart "${targetName}" kartına birleştirilsin mi? Bağışlar, notlar ve sponsorluklar taşınır, diğer kartlar silinir.`))) return
    setMessage(null)
    try {
      const res = await adminSend<{ merged: number; moved: Record<string, number> }>('post', '/donors/merge', { target_id: target, source_ids: sources.map((d) => d.id) })
      const moved = Object.values(res.data.moved).reduce((a, b) => a + b, 0)
      setMessage({ type: 'ok', text: `${res.data.merged} kart birleştirildi, ${moved} kayıt taşındı` })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Mükerrer Bağışçılar" description={<>Aynı telefon, e-posta veya TC ile açılmış kartlar. Asıl kartı seçip birleştirin; boş alanlar diğer kartlardan doldurulur.</>} actions={<Link href="/admin/bagiscilar" className={ghostButton}>← Bağışçılar</Link>} />
      <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
        <input type="checkbox" checked={includeNames} onChange={(e) => setIncludeNames(e.target.checked)} />
        Aynı ad soyadı da mükerrer say (yanlış eşleşme olabilir, dikkatle kontrol edin)
      </label>
      <Notice message={message} />

      {groups === null && <p className="text-sm text-gray-400">Yükleniyor…</p>}
      {groups?.length === 0 && <Card className="border border-gray-100 p-6 text-center text-sm text-gray-500 shadow-sm">Mükerrer kart bulunamadı.</Card>}
      {groups?.map((g, index) => {
        const target = targets[index] || g.donors[0].id
        return (
          <Card key={g.donors.map((d) => d.id).join()} className="space-y-3 border border-gray-100 p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-gray-500">Eşleşen: {g.reasons.join(', ')}</p>
              {canEdit && <button className={primaryButton} onClick={() => merge(index, g)}>Birleştir</button>}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <THead><Tr><Th>Asıl kart</Th><Th>Ad</Th><Th>Telefon</Th><Th>E-posta</Th><Th>TC</Th><Th>Şehir</Th><Th>Bağış</Th><Th>Son bağış</Th><Th>Kayıt</Th></Tr></THead>
                <TBody>
                  {g.donors.map((d) => (
                    <Tr key={d.id} className={`border-t ${d.id === target ? 'bg-primary-50/40' : ''}`}>
                      <Td><input type="radio" name={`target-${index}`} checked={d.id === target} onChange={() => setTargets({ ...targets, [index]: d.id })} /></Td>
                      <Td className="font-semibold text-gray-900">{d.full_name}</Td>
                      <Td>{d.phone || '—'}</Td>
                      <Td>{d.email || '—'}</Td>
                      <Td>{d.tc_masked || '—'}</Td>
                      <Td>{d.city || '—'}</Td>
                      <Td>{d.total_donations} · {formatMoney(d.total_donated_cents)}</Td>
                      <Td>{d.last_donation_at ? new Date(d.last_donation_at).toLocaleDateString('tr-TR') : '—'}</Td>
                      <Td>{new Date(d.created_at).toLocaleDateString('tr-TR')}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
