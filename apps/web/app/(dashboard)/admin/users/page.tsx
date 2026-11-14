'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
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

  const update = (user: StaffUser, data: Record<string, unknown>, success: string) =>
    run(() => adminSend('put', `/users/${user.id}`, data), success)

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex items-center justify-end gap-3">
          {seatsFull && (
            <span className="text-xs font-semibold text-amber-700">
              Kullanıcı sınırına ulaşıldı. Yeni hesap için paketi yükseltin veya bir hesabı pasifleştirin.
            </span>
          )}
          <button className={buttonClass} disabled={seatsFull} onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Vazgeç' : '+ Personel Ekle'}
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
              <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-gray-600">Geçici parola (en az 10 karakter)
              <input required minLength={10} type="password" autoComplete="new-password" className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-gray-600">Hazır rol
              <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {builtinRoles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-gray-600">Özel rol (hazır rolün yerine geçer)
              <select className={inputClass} value={form.staff_role_id} onChange={(e) => setForm({ ...form, staff_role_id: e.target.value })}>
                <option value="">—</option>
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

      <Card className="border border-gray-100 p-6 shadow-sm">
        {users.length === 0 ? (
          <p className="py-6 text-center text-xs text-gray-400">Kayıtlı personel bulunmuyor.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Ad Soyad</Th>
                  <Th>Hazır Rol</Th>
                  <Th>Özel Rol</Th>
                  <Th>Birim</Th>
                  <Th>Durum</Th>
                  {canManage && <Th>Şifre</Th>}
                </Tr>
              </THead>
              <TBody>
                {users.map((user) => {
                  const isSelf = user.id === currentUserId
                  const locked = !canManage || user.role === 'platform_admin'
                  return (
                    <Tr key={user.id} className={user.is_active ? '' : 'opacity-60'}>
                      <Td>
                        <div className="font-semibold text-gray-900">{user.first_name} {user.last_name}{isSelf && ' (siz)'}</div>
                        <div className="font-mono text-[11px] text-gray-500">{user.email}</div>
                      </Td>
                      <Td>
                        <select
                          disabled={locked || isSelf}
                          value={user.role}
                          onChange={(e) => update(user, { role: e.target.value }, 'Rol güncellendi')}
                          className="rounded-lg border border-gray-300 bg-white p-1.5 text-xs font-semibold disabled:bg-gray-50"
                        >
                          {user.role === 'platform_admin' && <option value="platform_admin">Sistem Yöneticisi</option>}
                          {builtinRoles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                        </select>
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
                              className="rounded border border-gray-300 px-2 py-0.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50">
                              Şifre belirle
                            </button>
                          )}
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
    </div>
  )
}

function DepartmentsTab({ departments, canManage, run }: { departments: Department[]; canManage: boolean; run: Run }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await run(() => adminSend('post', '/departments', { name, description: description || null }), 'Birim eklendi')) {
      setName('')
      setDescription('')
    }
  }

  const rename = (d: Department) => {
    const newName = window.prompt('Birim adı', d.name)
    if (newName && newName !== d.name) {
      run(() => adminSend('put', `/departments/${d.id}`, { name: newName, description: d.description }), 'Birim güncellendi')
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
              <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <button type="submit" className={buttonClass}>Birim Ekle</button>
          </form>
        </Card>
      )}
      <Card className="border border-gray-100 p-6 shadow-sm">
        {departments.length === 0 ? (
          <p className="py-6 text-center text-xs text-gray-400">Henüz birim tanımlanmadı. Personeli birimlere ayırmak için birim ekleyin.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {departments.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <div className="font-semibold text-gray-900">{d.name}</div>
                  <div className="text-xs text-gray-500">{d.description || '—'} · {d.user_count} personel</div>
                </div>
                {canManage && (
                  <div className="flex gap-2 text-xs font-semibold">
                    <button onClick={() => rename(d)} className="text-primary-700 hover:underline">Düzenle</button>
                    <button onClick={() => remove(d)} className="text-red-600 hover:underline">Sil</button>
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

  const startEdit = (role: StaffRole | null) => {
    setEditing(role)
    setName(role?.name || '')
    setDescription(role?.description || '')
    setPermissions(role?.permissions || ['admin_read'])
  }

  const toggle = (key: string) =>
    setPermissions((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]))

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
        <h2 className="mb-4 text-sm font-bold text-gray-900">Kuruma özel roller</h2>
        {roles.length === 0 ? (
          <p className="py-6 text-center text-xs text-gray-400">Henüz özel rol yok. Hazır roller yetmiyorsa sağdan yeni rol oluşturun.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {roles.map((role) => (
              <li key={role.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-gray-900">{role.name} <span className="text-xs font-normal text-gray-500">· {role.user_count} personel</span></div>
                  {canManage && (
                    <div className="flex gap-2 text-xs font-semibold">
                      <button onClick={() => startEdit(role)} className="text-primary-700 hover:underline">Düzenle</button>
                      <button onClick={() => remove(role)} className="text-red-600 hover:underline">Sil</button>
                    </div>
                  )}
                </div>
                {role.description && <div className="text-xs text-gray-500">{role.description}</div>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {role.permissions.map((p) => (
                    <span key={p} className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">{permissionLabel(p)}</span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canManage && (
        <Card className="border border-gray-100 p-6 shadow-sm lg:col-span-5">
          <form onSubmit={save} className="space-y-4">
            <h2 className="text-sm font-bold text-gray-900">{editing ? `"${editing.name}" rolünü düzenle` : 'Yeni rol'}</h2>
            <label className="block text-xs font-semibold text-gray-600">Rol adı
              <input required minLength={2} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Bölge Temsilcisi" />
            </label>
            <label className="block text-xs font-semibold text-gray-600">Açıklama
              <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs font-semibold text-gray-600">Yetkiler</legend>
              {permissionCatalog.map((p) => {
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
                    {p.label}
                    {!grantable && <span className="text-[10px]">(sizde yok)</span>}
                  </label>
                )
              })}
            </fieldset>
            <div className="flex justify-end gap-2">
              {editing && <button type="button" onClick={() => startEdit(null)} className="px-3 text-sm font-semibold text-gray-600">Vazgeç</button>}
              <button type="submit" className={buttonClass}>{editing ? 'Kaydet' : 'Rol Oluştur'}</button>
            </div>
          </form>
        </Card>
      )}
    </div>
  )
}
