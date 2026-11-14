'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { Copy, KeyRound, Pencil, Plus, Search, Shield, X } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, hasPermission, useAdminAccess } from '../../../../lib/admin-access'
import { PageHeader, TBody, THead, Table, Td, Th, Tr, confirmDialog } from '../../../../components/admin/ui'

interface StaffUser {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  role: string
  role_label: string
  department_id: string | null
  department_name: string | null
  staff_role_id: string | null
  staff_role_name: string | null
  permissions: string[]
  is_active: boolean
  last_login_at: string | null
}

interface Department {
  id: string
  name: string
  description: string | null
  user_count: number
}

interface StaffRole {
  id: string
  name: string
  description: string | null
  permissions: string[]
  user_count: number
}

type Tab = 'users' | 'departments' | 'roles'

const inputClass = 'w-full rounded-lg border border-gray-300 p-2 text-sm outline-none focus:border-primary-600 bg-white'
const buttonClass = 'rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50'

export default function AdminUsersPage() {
  const queryClient = useQueryClient()
  const { data: access } = useAdminAccess()
  const canManage = hasPermission(access, 'user_manage')
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<StaffUser[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [roles, setRoles] = useState<StaffRole[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [u, d, r] = await Promise.all([
        adminGet<StaffUser[]>('/users'),
        adminGet<Department[]>('/departments'),
        adminGet<StaffRole[]>('/staff-roles'),
      ])
      setUsers(u.data)
      setDepartments(d.data)
      setRoles(r.data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Personel bilgileri yüklenemedi') })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const run = async (action: () => Promise<unknown>, success: string) => {
    setMessage(null)
    try {
      await action()
      setMessage({ type: 'ok', text: success })
      await load()
      queryClient.invalidateQueries({ queryKey: ['admin-access'] })
      return true
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
      return false
    }
  }

  const permissionLabel = (key: string) => access?.permission_catalog.find((p) => p.key === key)?.label || key
  const seatsFull = access ? access.usage.users >= access.limits.users : false

  return (
    <div className="space-y-6">
      <PageHeader
        title="Personel & Yetkiler"
        description={access && <>{access.plan_label} paket · aktif kullanıcı <strong>{access.usage.users}</strong> / {access.limits.users}</>}
        actions={
          <div className="flex rounded-lg border bg-white p-1 text-sm font-semibold">
            {([
              ['users', 'Personel'],
              ['departments', 'Birimler'],
              ['roles', 'Roller'],
            ] as [Tab, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-md px-4 py-1.5 ${tab === key ? 'bg-primary-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {message && (
        <div className={`rounded-lg border p-3 text-sm font-semibold ${message.type === 'ok' ? 'border-green-100 bg-green-50 text-green-700' : 'border-red-100 bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {loading && users.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-500 animate-pulse">Yükleniyor...</p>
      ) : tab === 'users' ? (
        <UsersTab
          users={users}
          departments={departments}
          roles={roles}
          canManage={canManage}
          seatsFull={seatsFull}
          builtinRoles={access?.builtin_roles || []}
          currentUserId={access?.me.id}
          run={run}
        />
      ) : tab === 'departments' ? (
        <DepartmentsTab departments={departments} canManage={canManage} run={run} />
      ) : (
        <RolesTab
          roles={roles}
          canManage={canManage}
          permissionCatalog={access?.permission_catalog || []}
          myPermissions={access?.me.permissions || []}
          permissionLabel={permissionLabel}
          run={run}
        />
      )}
    </div>
  )
}

type Run = (action: () => Promise<unknown>, success: string) => Promise<boolean>

function formatLastLogin(value: string | null) {
  if (!value) return 'Henüz giriş yok'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
}

function UsersTab({
  users, departments, roles, canManage, seatsFull, builtinRoles, currentUserId, run,
}: {
  users: StaffUser[]
  departments: Department[]
  roles: StaffRole[]
  canManage: boolean
  seatsFull: boolean
  builtinRoles: { key: string; label: string }[]
  currentUserId?: string
  run: Run
}) {
  const empty = { first_name: '', last_name: '', email: '', phone: '', password: '', role: 'readonly', department_id: '', staff_role_id: '' }
  const [form, setForm] = useState(empty)
  const [showForm, setShowForm] = useState(false)
  const [passwordFor, setPasswordFor] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')

  // Search & filter state
  const [query, setQuery] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Edit profile modal state
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null)
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    role: 'readonly',
    staff_role_id: '',
    department_id: '',
  })

  const openEdit = (user: StaffUser) => {
    setEditingUser(user)
    setEditForm({
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone || '',
      role: user.role,
      staff_role_id: user.staff_role_id || '',
      department_id: user.department_id || '',
    })
  }

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (statusFilter === 'active' && !u.is_active) return false
      if (statusFilter === 'inactive' && u.is_active) return false
      if (deptFilter === 'none' && u.department_id) return false
      if (deptFilter !== 'all' && deptFilter !== 'none' && u.department_id !== deptFilter) return false
      if (roleFilter.startsWith('builtin:') && u.role !== roleFilter.slice(8)) return false
      if (roleFilter.startsWith('custom:') && u.staff_role_id !== roleFilter.slice(7)) return false
      if (q) {
        const hay = `${u.first_name} ${u.last_name} ${u.email} ${u.phone || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [users, query, deptFilter, roleFilter, statusFilter])

  const setPassword = async (e: React.FormEvent, user: StaffUser) => {
    e.preventDefault()
    if (await run(() => adminSend('post', `/users/${user.id}/password`, { password: newPassword }),
      `${user.email} için şifre belirlendi; açık oturumları kapatıldı`)) {
      setPasswordFor(null)
      setNewPassword('')
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await run(() => adminSend('post', '/users', {
      ...form,
      phone: form.phone || null,
      department_id: form.department_id || null,
      staff_role_id: form.staff_role_id || null,
    }), 'Personel hesabı oluşturuldu')
    if (ok) {
      setForm(empty)
      setShowForm(false)
    }
  }

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    const isSelf = editingUser.id === currentUserId
    const payload: Record<string, unknown> = {
      first_name: editForm.first_name.trim(),
      last_name: editForm.last_name.trim(),
      phone: editForm.phone.trim() || null,
      ...(editForm.department_id ? { department_id: editForm.department_id } : { clear_department: true }),
    }
    if (!isSelf) {
      payload.role = editForm.role
      if (editForm.staff_role_id) {
        payload.staff_role_id = editForm.staff_role_id
      } else {
        payload.clear_staff_role = true
      }
    }
    const ok = await run(() => adminSend('put', `/users/${editingUser.id}`, payload), 'Personel bilgileri güncellendi')
    if (ok) setEditingUser(null)
  }

  const update = (user: StaffUser, data: Record<string, unknown>, success: string) =>
    run(() => adminSend('put', `/users/${user.id}`, data), success)

  const hasFilters = Boolean(query.trim()) || deptFilter !== 'all' || roleFilter !== 'all' || statusFilter !== 'all'

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {seatsFull && (
            <span className="text-xs font-semibold text-amber-700">
              Kullanıcı sınırına ulaşıldı. Yeni hesap için paketi yükseltin veya bir hesabı pasifleştirin.
            </span>
          )}
          <button className={`inline-flex items-center gap-1.5 ${buttonClass}`} disabled={seatsFull} onClick={() => setShowForm((v) => !v)}>
            {showForm ? <><X className="h-4 w-4" /> Vazgeç</> : <><Plus className="h-4 w-4" /> Personel Ekle</>}
          </button>
        </div>
      )}

      {showForm && (
        <Card className="border border-gray-100 p-6 shadow-sm">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-semibold text-gray-600">Ad
              <input required className={inputClass} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-gray-600">Soyad
              <input required className={inputClass} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-gray-600">E-posta
              <input required type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-gray-600">Telefon
              <input className={inputClass} placeholder="05xx xxx xx xx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-gray-600">Geçici parola (en az 10 karakter)
              <input required minLength={10} type="password" autoComplete="new-password" className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-gray-600">
              Hazır rol {form.staff_role_id && <span className="font-normal text-amber-700">(özel rol öncelikli)</span>}
              <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {builtinRoles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-gray-600">Özel rol (hazır rolün yerine geçer)
              <select className={inputClass} value={form.staff_role_id} onChange={(e) => setForm({ ...form, staff_role_id: e.target.value })}>
                <option value="">— (hazır rol geçerli)</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-gray-600">Birim
              <select className={inputClass} value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                <option value="">—</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
              <button type="submit" className={buttonClass}>Hesabı Oluştur</button>
            </div>
          </form>
        </Card>
      )}

      <Card className="border border-gray-100 p-6 shadow-sm space-y-4">
        {/* Search & filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ad, e-posta veya telefon ara..."
              className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-9 pr-3 text-sm outline-none focus:border-primary-600"
            />
          </div>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700"
          >
            <option value="all">Tüm birimler</option>
            <option value="none">Birimsiz</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700"
          >
            <option value="all">Tüm roller</option>
            <optgroup label="Hazır Roller">
              {builtinRoles.map((r) => <option key={r.key} value={`builtin:${r.key}`}>{r.label}</option>)}
            </optgroup>
            {roles.length > 0 && (
              <optgroup label="Özel Roller">
                {roles.map((r) => <option key={r.id} value={`custom:${r.id}`}>{r.name}</option>)}
              </optgroup>
            )}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700"
          >
            <option value="all">Tüm durumlar</option>
            <option value="active">Yalnızca aktif</option>
            <option value="inactive">Yalnızca pasif</option>
          </select>
          {hasFilters && (
            <button
              type="button"
              onClick={() => { setQuery(''); setDeptFilter('all'); setRoleFilter('all'); setStatusFilter('all') }}
              className="text-xs font-semibold text-primary-700 hover:underline"
            >
              Filtreyi temizle ({filteredUsers.length}/{users.length})
            </button>
          )}
        </div>

        {filteredUsers.length === 0 ? (
          <p className="py-8 text-center text-xs text-gray-400">
            {users.length === 0 ? 'Kayıtlı personel bulunmuyor.' : 'Filtreye uygun personel bulunamadı.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Ad Soyad / İletişim</Th>
                  <Th>Hazır Rol</Th>
                  <Th>Özel Rol</Th>
                  <Th>Birim</Th>
                  <Th>Son Giriş</Th>
                  <Th>Durum</Th>
                  {canManage && <Th>İşlemler</Th>}
                </Tr>
              </THead>
              <TBody>
                {filteredUsers.map((user) => {
                  const isSelf = user.id === currentUserId
                  const locked = !canManage || user.role === 'platform_admin'
                  const hasCustomRole = Boolean(user.staff_role_id)
                  return (
                    <Tr key={user.id} className={user.is_active ? '' : 'opacity-60'}>
                      <Td>
                        <div className="font-semibold text-gray-900">
                          {user.first_name} {user.last_name}
                          {isSelf && <span className="ml-1.5 rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-bold text-primary-700">siz</span>}
                        </div>
                        <div className="font-mono text-[11px] text-gray-500">{user.email}</div>
                        {user.phone && <div className="text-[11px] text-gray-500">{user.phone}</div>}
                      </Td>
                      <Td>
                        <select
                          disabled={locked || isSelf}
                          value={user.role}
                          onChange={(e) => update(user, { role: e.target.value }, 'Rol güncellendi')}
                          title={hasCustomRole ? 'Özel rol atandığı için yetkiler özel rolden alınır' : undefined}
                          className={`rounded-lg border bg-white p-1.5 text-xs font-semibold disabled:bg-gray-50 ${hasCustomRole ? 'border-gray-200 text-gray-400' : 'border-gray-300 text-gray-800'}`}
                        >
                          {user.role === 'platform_admin' && <option value="platform_admin">Sistem Yöneticisi</option>}
                          {builtinRoles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                        </select>
                        {hasCustomRole && <div className="mt-0.5 text-[10px] text-amber-700">Özel rol aktif</div>}
                      </Td>
                      <Td>
                        <select
                          disabled={locked || isSelf}
                          value={user.staff_role_id || ''}
                          onChange={(e) => update(
                            user,
                            e.target.value ? { staff_role_id: e.target.value } : { clear_staff_role: true },
                            'Özel rol güncellendi',
                          )}
                          className="rounded-lg border border-gray-300 bg-white p-1.5 text-xs font-semibold disabled:bg-gray-50"
                        >
                          <option value="">— (hazır rol geçerli)</option>
                          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </Td>
                      <Td>
                        <select
                          disabled={locked}
                          value={user.department_id || ''}
                          onChange={(e) => update(
                            user,
                            e.target.value ? { department_id: e.target.value } : { clear_department: true },
                            'Birim güncellendi',
                          )}
                          className="rounded-lg border border-gray-300 bg-white p-1.5 text-xs font-semibold disabled:bg-gray-50"
                        >
                          <option value="">—</option>
                          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </Td>
                      <Td>
                        <span className="text-xs text-gray-500">{formatLastLogin(user.last_login_at)}</span>
                      </Td>
                      <Td>
                        <button
                          disabled={locked || isSelf}
                          onClick={() => update(user, { is_active: !user.is_active }, user.is_active ? 'Hesap pasifleştirildi' : 'Hesap aktifleştirildi')}
                          className={`rounded border px-2 py-0.5 text-[10px] font-bold disabled:cursor-not-allowed ${user.is_active ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-100 text-gray-600'}`}
                        >
                          {user.is_active ? 'Aktif' : 'Pasif'}
                        </button>
                      </Td>
                      {canManage && (
                        <Td>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {!locked && (
                              <button
                                type="button"
                                onClick={() => openEdit(user)}
                                className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-0.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                              >
                                <Pencil className="h-3 w-3" /> Düzenle
                              </button>
                            )}
                            {isSelf ? (
                              <Link href="/admin/sifre" className="text-[11px] font-semibold text-primary-700 hover:underline">Şifremi değiştir</Link>
                            ) : locked ? null : passwordFor === user.id ? (
                              <form onSubmit={(e) => setPassword(e, user)} className="flex items-center gap-1">
                                <input required minLength={10} type="password" autoComplete="new-password" autoFocus
                                  placeholder="en az 10 karakter" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                                  className="w-36 rounded border border-gray-300 p-1 text-xs" />
                                <button type="submit" className="rounded bg-primary-600 px-2 py-1 text-[11px] font-semibold text-white">Kaydet</button>
                                <button type="button" onClick={() => { setPasswordFor(null); setNewPassword('') }} className="px-1 text-[11px] text-gray-500">Vazgeç</button>
                              </form>
                            ) : (
                              <button onClick={() => { setPasswordFor(user.id); setNewPassword('') }}
                                className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-0.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50">
                                <KeyRound className="h-3 w-3" /> Şifre
                              </button>
                            )}
                          </div>
                        </Td>
                      )}
                    </Tr>
                  )
                })}
              </TBody>
            </Table>
          </div>
        )}
      </Card>

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditingUser(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900">Personel Bilgilerini Düzenle</h3>
                <p className="font-mono text-xs text-gray-500">{editingUser.email}</p>
              </div>
              <button type="button" onClick={() => setEditingUser(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitEdit} className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-gray-600">Ad
                <input required className={inputClass} value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} />
              </label>
              <label className="text-xs font-semibold text-gray-600">Soyad
                <input required className={inputClass} value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} />
              </label>
              <label className="sm:col-span-2 text-xs font-semibold text-gray-600">Telefon
                <input className={inputClass} placeholder="05xx xxx xx xx" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </label>
              {editingUser.id !== currentUserId && (
                <>
                  <label className="text-xs font-semibold text-gray-600">
                    Hazır rol
                    <select className={inputClass} value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                      {builtinRoles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-gray-600">
                    Özel rol
                    <select className={inputClass} value={editForm.staff_role_id} onChange={(e) => setEditForm({ ...editForm, staff_role_id: e.target.value })}>
                      <option value="">— (hazır rol geçerli)</option>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </label>
                </>
              )}
              <label className="sm:col-span-2 text-xs font-semibold text-gray-600">Birim
                <select className={inputClass} value={editForm.department_id} onChange={(e) => setEditForm({ ...editForm, department_id: e.target.value })}>
                  <option value="">—</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingUser(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                  Vazgeç
                </button>
                <button type="submit" className={buttonClass}>Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function DepartmentsTab({ departments, canManage, run }: { departments: Department[]; canManage: boolean; run: Run }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await run(() => adminSend('post', '/departments', { name, description: description || null }), 'Birim eklendi')) {
      setName('')
      setDescription('')
    }
  }

  const startEdit = (d: Department) => {
    setEditingId(d.id)
    setEditName(d.name)
    setEditDesc(d.description || '')
  }

  const saveEdit = async (e: React.FormEvent, d: Department) => {
    e.preventDefault()
    if (await run(() => adminSend('put', `/departments/${d.id}`, { name: editName, description: editDesc.trim() || null }), 'Birim güncellendi')) {
      setEditingId(null)
    }
  }

  const remove = async (d: Department) => {
    if ((await confirmDialog(`"${d.name}" birimi silinsin mi? ${d.user_count} personelin birimi boşaltılacak.`))) {
      run(() => adminSend('delete', `/departments/${d.id}`), 'Birim silindi')
    }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <Card className="border border-gray-100 p-6 shadow-sm">
          <form onSubmit={create} className="flex flex-wrap items-end gap-3">
            <label className="min-w-48 flex-1 text-xs font-semibold text-gray-600">Birim adı
              <input required minLength={2} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Kurban Birimi" />
            </label>
            <label className="min-w-64 flex-[2] text-xs font-semibold text-gray-600">Açıklama
              <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ör. Kurban kesim ve dağıtım ekibi" />
            </label>
            <button type="submit" className={`inline-flex items-center gap-1.5 ${buttonClass}`}>
              <Plus className="h-4 w-4" /> Birim Ekle
            </button>
          </form>
        </Card>
      )}
      <Card className="border border-gray-100 p-6 shadow-sm">
        {departments.length === 0 ? (
          <p className="py-6 text-center text-xs text-gray-400">Henüz birim tanımlanmadı. Personeli birimlere ayırmak için birim ekleyin.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {departments.map((d) => (
              <li key={d.id} className="py-3 text-sm">
                {editingId === d.id ? (
                  <form onSubmit={(e) => saveEdit(e, d)} className="flex flex-wrap items-end gap-3">
                    <label className="min-w-44 flex-1 text-xs font-semibold text-gray-600">Birim adı
                      <input required minLength={2} className={inputClass} value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                    </label>
                    <label className="min-w-56 flex-[2] text-xs font-semibold text-gray-600">Açıklama
                      <input className={inputClass} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                    </label>
                    <div className="flex gap-2">
                      <button type="submit" className={buttonClass}>Kaydet</button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                        Vazgeç
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-gray-900">
                        {d.name}
                        <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{d.user_count} personel</span>
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">{d.description || 'Açıklama yok'}</div>
                    </div>
                    {canManage && (
                      <div className="flex gap-2 text-xs font-semibold">
                        <button type="button" onClick={() => startEdit(d)} className="inline-flex items-center gap-1 rounded border border-gray-200 px-2.5 py-1 text-gray-700 hover:bg-gray-50">
                          <Pencil className="h-3 w-3" /> Düzenle
                        </button>
                        <button type="button" onClick={() => remove(d)} className="rounded border border-red-200 px-2.5 py-1 text-red-600 hover:bg-red-50">
                          Sil
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

const PERMISSION_GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Genel & Raporlama', keys: ['admin_read', 'report_read'] },
  { title: 'Operasyon & İçerik', keys: ['donor_manage', 'content_manage', 'operations_manage'] },
  { title: 'Finans & Yönetim', keys: ['finance_manage', 'settings_manage', 'user_manage'] },
]

function RolesTab({
  roles, canManage, permissionCatalog, myPermissions, permissionLabel, run,
}: {
  roles: StaffRole[]
  canManage: boolean
  permissionCatalog: { key: string; label: string }[]
  myPermissions: string[]
  permissionLabel: (key: string) => string
  run: Run
}) {
  const [editing, setEditing] = useState<StaffRole | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [permissions, setPermissions] = useState<string[]>(['admin_read'])

  const groupedCatalog = useMemo(() => {
    const byKey = new Map(permissionCatalog.map((p) => [p.key, p]))
    const used = new Set<string>()
    const groups = PERMISSION_GROUPS.map((g) => {
      const items = g.keys
        .map((k) => byKey.get(k))
        .filter((item): item is { key: string; label: string } => Boolean(item))
      items.forEach((i) => used.add(i.key))
      return { title: g.title, items }
    }).filter((g) => g.items.length > 0)

    const rest = permissionCatalog.filter((p) => !used.has(p.key))
    if (rest.length > 0) {
      groups.push({ title: 'Diğer Yetkiler', items: rest })
    }
    return groups
  }, [permissionCatalog])

  const grantableKeys = useMemo(
    () => permissionCatalog.map((p) => p.key).filter((k) => myPermissions.includes(k)),
    [permissionCatalog, myPermissions],
  )

  const startEdit = (role: StaffRole | null) => {
    setEditing(role)
    setName(role?.name || '')
    setDescription(role?.description || '')
    setPermissions(role?.permissions || ['admin_read'])
  }

  const copyFromRole = (role: StaffRole) => {
    setEditing(null)
    setName(`${role.name} (Kopya)`)
    setDescription(role.description || '')
    const allowed = role.permissions.filter((p) => p === 'admin_read' || myPermissions.includes(p))
    setPermissions(Array.from(new Set(['admin_read', ...allowed])))
  }

  const toggle = (key: string) =>
    setPermissions((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]))

  const selectAllGrantable = () => {
    setPermissions(Array.from(new Set(['admin_read', ...grantableKeys])))
  }

  const clearGrantable = () => {
    setPermissions(['admin_read'])
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = { name, description: description || null, permissions }
    const ok = editing
      ? await run(() => adminSend('put', `/staff-roles/${editing.id}`, body), 'Rol güncellendi')
      : await run(() => adminSend('post', '/staff-roles', body), 'Rol oluşturuldu')
    if (ok) startEdit(null)
  }

  const remove = async (role: StaffRole) => {
    if ((await confirmDialog(`"${role.name}" rolü silinsin mi?`))) {
      run(() => adminSend('delete', `/staff-roles/${role.id}`), 'Rol silindi')
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-12">
      <Card className="border border-gray-100 p-6 shadow-sm lg:col-span-7">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <Shield className="h-4 w-4 text-primary-600" /> Kuruma özel roller
          </h2>
          <span className="text-xs text-gray-500">{roles.length} rol</span>
        </div>
        {roles.length === 0 ? (
          <p className="py-6 text-center text-xs text-gray-400">Henüz özel rol yok. Hazır roller yetmiyorsa sağdan yeni rol oluşturun.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {roles.map((role) => {
              const isEditing = editing?.id === role.id
              return (
                <li key={role.id} className={`py-3 transition ${isEditing ? '-mx-3 rounded-lg bg-primary-50/50 px-3' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-gray-900">
                      {role.name}
                      <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{role.user_count} personel</span>
                    </div>
                    {canManage && (
                      <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                        <button type="button" onClick={() => copyFromRole(role)} className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-0.5 text-gray-600 hover:bg-gray-50" title="Bu rolün yetkilerini kopyalayarak yeni rol oluştur">
                          <Copy className="h-3 w-3" /> Kopyala
                        </button>
                        <button type="button" onClick={() => startEdit(role)} className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-0.5 text-primary-700 hover:bg-primary-50">
                          <Pencil className="h-3 w-3" /> Düzenle
                        </button>
                        <button type="button" onClick={() => remove(role)} className="rounded border border-red-200 px-2 py-0.5 text-red-600 hover:bg-red-50">
                          Sil
                        </button>
                      </div>
                    )}
                  </div>
                  {role.description && <div className="mt-0.5 text-xs text-gray-500">{role.description}</div>}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {role.permissions.map((p) => (
                      <span key={p} className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">{permissionLabel(p)}</span>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {canManage && (
        <Card className="border border-gray-100 p-6 shadow-sm lg:col-span-5">
          <form onSubmit={save} className="space-y-4">
            <h2 className="text-sm font-bold text-gray-900">{editing ? `"${editing.name}" rolünü düzenle` : 'Yeni özel rol'}</h2>
            <label className="block text-xs font-semibold text-gray-600">Rol adı
              <input required minLength={2} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Bölge Temsilcisi" />
            </label>
            <label className="block text-xs font-semibold text-gray-600">Açıklama
              <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ör. Yalnızca kendi bölgesinin raporlarını görür" />
            </label>
            <fieldset className="space-y-3">
              <div className="flex items-center justify-between">
                <legend className="text-xs font-semibold text-gray-600">Yetkiler</legend>
                <div className="flex gap-2 text-[11px] font-semibold">
                  <button type="button" onClick={selectAllGrantable} className="text-primary-700 hover:underline">Tümünü seç</button>
                  <span className="text-gray-300">·</span>
                  <button type="button" onClick={clearGrantable} className="text-gray-500 hover:underline">Temizle</button>
                </div>
              </div>
              {groupedCatalog.map((group) => (
                <div key={group.title} className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">{group.title}</div>
                  <div className="space-y-1.5">
                    {group.items.map((p) => {
                      const grantable = myPermissions.includes(p.key)
                      const required = p.key === 'admin_read'
                      return (
                        <label key={p.key} className={`flex items-center gap-2 text-sm ${grantable ? 'text-gray-800' : 'text-gray-400'}`}>
                          <input
                            type="checkbox"
                            checked={required || permissions.includes(p.key)}
                            disabled={required || !grantable}
                            onChange={() => toggle(p.key)}
                          />
                          <span>{p.label}</span>
                          {required && <span className="text-[10px] text-gray-400">(zorunlu)</span>}
                          {!grantable && <span className="text-[10px]">(sizde yok)</span>}
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </fieldset>
            <div className="flex justify-end gap-2">
              {editing && <button type="button" onClick={() => startEdit(null)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Vazgeç</button>}
              <button type="submit" className={buttonClass}>{editing ? 'Kaydet' : 'Rol Oluştur'}</button>
            </div>
          </form>
        </Card>
      )}
    </div>
  )
}
