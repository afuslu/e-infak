'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Card } from '@e-infak/ui'
import { adminSend, apiErrorMessage, useAdminAccess } from '../../../../lib/admin-access'
import { PageHeader, TBody, THead, Table, Td, Th, Tr } from '../../../../components/admin/ui'

export default function PackagePage() {
  const queryClient = useQueryClient()
  const { data: access, isLoading } = useAdminAccess()
  const [plan, setPlan] = useState('')
  const [addons, setAddons] = useState<string[]>([])
  const [extraSeats, setExtraSeats] = useState(0)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (access) {
      setPlan(access.plan)
      setAddons(access.addons)
      setExtraSeats(access.limits.extra_user_seats)
    }
  }, [access])

  if (isLoading || !access) {
    return <p className="py-12 text-center text-sm text-gray-500 animate-pulse">Yükleniyor...</p>
  }

  const selectedPlan = access.plans.find((p) => p.key === plan) || access.plans[0]
  const labelOf = (key: string) => access.catalog.find((f) => f.key === key)?.label || key

  const save = async () => {
    setMessage(null)
    try {
      await adminSend('put', '/plan', {
        plan,
        enabled_addons: addons.filter((a) => selectedPlan.addons.includes(a)),
        extra_user_seats: extraSeats,
      })
      await queryClient.invalidateQueries({ queryKey: ['admin-access'] })
      setMessage({ type: 'ok', text: 'Paket güncellendi' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Paket & Kullanım" description={<>Kurumunuzun paketi, açık modüller ve kullanım sınırları.</>} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border border-gray-100 p-5 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Mevcut paket</div>
          <div className="mt-1 text-2xl font-black text-primary-700">{access.plan_label}</div>
        </Card>
        <Card className="border border-gray-100 p-5 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Aktif kullanıcı</div>
          <div className="mt-1 text-2xl font-black text-gray-950">{access.usage.users} / {access.limits.users}</div>
          {access.limits.extra_user_seats > 0 && <div className="text-xs text-gray-500">{access.limits.extra_user_seats} ek kullanıcı dahil</div>}
        </Card>
        <Card className="border border-gray-100 p-5 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Ek modüller</div>
          <div className="mt-1 text-sm font-semibold text-gray-900">
            {access.addons.length ? access.addons.map(labelOf).join(', ') : 'Yok'}
          </div>
        </Card>
      </div>

      {message && (
        <div className={`rounded-lg border p-3 text-sm font-semibold ${message.type === 'ok' ? 'border-green-100 bg-green-50 text-green-700' : 'border-red-100 bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <Card className="overflow-x-auto border border-gray-100 p-6 shadow-sm">
        <Table>
          <THead>
            <Tr className="border-b">
              <Th className="text-xs uppercase tracking-wider text-gray-500">Modül</Th>
              {access.plans.map((p) => (
                <Th key={p.key} className={`pb-3 text-center ${p.key === access.plan ? 'text-primary-700' : 'text-gray-700'}`}>
                  {p.label}
                  {p.key === access.plan && <div className="text-[10px] font-semibold">(mevcut)</div>}
                </Th>
              ))}
            </Tr>
          </THead>
          <TBody>
            {access.catalog.map((feature) => (
              <Tr key={feature.key}>
                <Td className="text-gray-800">{feature.label}</Td>
                {access.plans.map((p) => (
                  <Td key={p.key} className="text-center">
                    {p.features.includes(feature.key) ? (
                      <span className="font-bold text-emerald-600">✓</span>
                    ) : p.addons.includes(feature.key) ? (
                      <span className="text-xs font-semibold text-amber-600">Ek modül</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </Td>
                ))}
              </Tr>
            ))}
            <Tr>
              <Td className="text-gray-800">Kullanıcı sayısı</Td>
              {access.plans.map((p) => <Td key={p.key} className="text-center font-semibold">{p.users}</Td>)}
            </Tr>
          </TBody>
        </Table>
        {!access.me.is_platform_admin && (
          <p className="mt-4 text-xs text-gray-500">Paket değişikliği ve ek modül talepleri için E-İnfak destek ekibiyle iletişime geçin.</p>
        )}
      </Card>

      {access.me.is_platform_admin && (
        <Card className="space-y-4 border border-amber-200 bg-amber-50/40 p-6 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">Platform yöneticisi: paketi değiştir</h2>
          <div className="flex flex-wrap gap-4">
            <label className="text-xs font-semibold text-gray-600">Paket
              <select value={plan} onChange={(e) => setPlan(e.target.value)} className="block rounded-lg border bg-white p-2 text-sm">
                {access.plans.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-gray-600">Ek kullanıcı
              <input type="number" min={0} max={100} value={extraSeats} onChange={(e) => setExtraSeats(Number(e.target.value))} className="block w-24 rounded-lg border bg-white p-2 text-sm" />
            </label>
          </div>
          <fieldset className="flex flex-wrap gap-4">
            <legend className="mb-2 text-xs font-semibold text-gray-600">Ek modüller ({selectedPlan.label} için açılabilenler)</legend>
            {selectedPlan.addons.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={addons.includes(key)}
                  onChange={() => setAddons((prev) => (prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key]))}
                />
                {labelOf(key)}
              </label>
            ))}
          </fieldset>
          <button onClick={save} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">Kaydet</button>
        </Card>
      )}
    </div>
  )
}
