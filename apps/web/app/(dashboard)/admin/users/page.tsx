'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react'
import { Button, Card, Input } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, useAdminAccess, whatsappUrl, type CapabilityGroup, can } from '../../../../lib/admin-access'
import { Label, inputClass } from '../../../../components/admin/FormKit'
import { AppPageHeader, GlobalStatCard } from '../../../../components/admin/muhasebe/OnMuhasebeUI'
import { EmptyState, ExportButtons, Modal, TBody, THead, Table, Tabs, Td, Th, Tr, WhatsAppIcon, confirmDialog, toast } from '../../../../components/admin/ui'

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
  capabilities?: string[]
  user_count: number
}

type Tab = 'users' | 'departments' | 'roles'
type Run = (action: () => Promise<unknown>, success: string) => Promise<boolean>

function formatLastLogin(value: string | null) {
  if (!value) return 'Henüz giriş yok'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient()
  const { data: access } = useAdminAccess()
  const canManage = can(access, 'users.manage')
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<StaffUser[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [roles, setRoles] = useState<StaffRole[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
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
      toast.error(apiErrorMessage(err, 'Personel bilgileri yüklenemedi'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const run: Run = async (action, success) => {
    try {
      await action()
      toast.ok(success)
      await load()
      queryClient.invalidateQueries({ queryKey: ['admin-access'] })
      return true
    } catch (err) {
      toast.error(apiErrorMessage(err))
      return false
    }
  }

  const seatsFull = access ? access.usage.users >= access.limits.users : false
  const activeUsersCount = users.filter((u) => u.is_active).length

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Ekip & Erişim Yönetimi"
        title="Personel & Yetkiler"
        meta={
          access
            ? `${access.plan_label} paket · aktif kullanıcı ${access.usage.users} / ${access.limits.users}`
            : 'Kurum personeli, birimler ve modül bazlı özel yetki rolleri'
        }
        icon={<Users className="h-5 w-5" />}
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <GlobalStatCard
          title="Aktif Personel"
          value={activeUsersCount}
          subtitle={`${users.length} toplam hesap`}
          gradient="from-emerald-500 to-teal-600"
          icon={<UserCheck className="h-4 w-4" />}
        />
        <GlobalStatCard
          title="Kullanıcı Kotası"
          value={access ? `${access.usage.users} / ${access.limits.users}` : `${users.length}`}
          subtitle={seatsFull ? 'Kota doldu' : access?.plan_label || 'Aktif paket'}
          gradient={seatsFull ? 'from-amber-500 to-orange-600' : 'from-blue-500 to-indigo-600'}
          icon={<Users className="h-4 w-4" />}
        />
        <GlobalStatCard
          title="Birimler"
          value={departments.length}
          subtitle="Operasyonel departman"
          gradient="from-violet-500 to-purple-600"
          icon={<Building2 className="h-4 w-4" />}
        />
        <GlobalStatCard
          title="Özel Roller"
          value={roles.length}
          subtitle="Kuruma özel yetki şablonu"
          gradient="from-slate-600 to-slate-800"
          icon={<Shield className="h-4 w-4" />}
        />
      </div>

      <Tabs
        tabs={[
          { key: 'users' as const, label: 'Personel', icon: Users, count: users.length },
          { key: 'departments' as const, label: 'Birimler', icon: Building2, count: departments.length },
          { key: 'roles' as const, label: 'Roller & Yetkiler', icon: Shield, count: roles.length },
        ]}
        value={tab}
        onChange={setTab}
      />

      {loading && users.length === 0 ? (
        <Card className="space-y-3 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </Card>
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
          catalog={access?.capability_catalog || []}
          mine={access?.me.capabilities || []}
          run={run}
        />
      )}
    </div>
  )
}

function UsersTab({
  users,
  departments,
  roles,
  canManage,
  seatsFull,
  builtinRoles,
  currentUserId,
  run,
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
  const empty = {
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    password: '',
    role: 'readonly',
    department_id: '',
    staff_role_id: '',
  }
  const [form, setForm] = useState(empty)
  const [showForm, setShowForm] = useState(false)
  const [showCreatePwd, setShowCreatePwd] = useState(false)
  const [passwordFor, setPasswordFor] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [showResetPwd, setShowResetPwd] = useState(false)

  const [query, setQuery] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

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
    if (
      await run(
        () => adminSend('post', `/users/${user.id}/password`, { password: newPassword }),
        `${user.email} için şifre belirlendi; açık oturumları kapatıldı`,
      )
    ) {
      setPasswordFor(null)
      setNewPassword('')
      setShowResetPwd(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await run(
      () =>
        adminSend('post', '/users', {
          ...form,
          phone: form.phone || null,
          department_id: form.department_id || null,
          staff_role_id: form.staff_role_id || null,
        }),
      'Personel hesabı oluşturuldu',
    )
    if (ok) {
      setForm(empty)
      setShowForm(false)
      setShowCreatePwd(false)
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
          <ExportButtons
            filename="personeller"
            title="Personel Listesi"
            subtitle={`${users.length} personel`}
            getData={() => ({
              headers: ['Ad', 'Soyad', 'E-posta', 'Telefon', 'Rol', 'Birim', 'Durum'],
              rows: users.map((u) => [
                u.first_name,
                u.last_name,
                u.email,
                u.phone || '',
                u.staff_role_name || u.role_label,
                u.department_name || '',
                u.is_active ? 'Aktif' : 'Pasif',
              ]),
            })}
          />
          <Button
            type="button"
            variant={showForm ? 'secondary' : 'primary'}
            size="sm"
            disabled={seatsFull}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? (
              <>
                <X className="h-4 w-4" /> Vazgeç
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> Personel Ekle
              </>
            )}
          </Button>
        </div>
      )}

      {showForm && (
        <Card className="rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Label label="Ad *">
              <Input required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </Label>
            <Label label="Soyad *">
              <Input required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </Label>
            <Label label="E-posta *">
              <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Label>
            <Label label="Telefon">
              <Input placeholder="05xx xxx xx xx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Label>
            <Label label="Geçici Parola (en az 10 karakter) *">
              <div className="relative">
                <Input
                  required
                  minLength={10}
                  type={showCreatePwd ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="pr-9"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowCreatePwd((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label={showCreatePwd ? 'Parolayı gizle' : 'Parolayı göster'}
                >
                  {showCreatePwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Label>
            <Label label="Hazır Rol" hint={form.staff_role_id ? 'Özel rol öncelikli' : undefined}>
              <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {builtinRoles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Label>
            <Label label="Özel Rol (hazır rolün yerine geçer)">
              <select className={inputClass} value={form.staff_role_id} onChange={(e) => setForm({ ...form, staff_role_id: e.target.value })}>
                <option value="">— (hazır rol geçerli)</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Label>
            <Label label="Birim">
              <select className={inputClass} value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Label>
            <div className="flex justify-end sm:col-span-2 lg:col-span-4">
              <Button type="submit">Hesabı Oluştur</Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ad, e-posta veya telefon ara..."
              className="pl-9"
            />
          </div>
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="all">Tüm birimler</option>
            <option value="none">Birimsiz</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="all">Tüm roller</option>
            <optgroup label="Hazır Roller">
              {builtinRoles.map((r) => (
                <option key={r.key} value={`builtin:${r.key}`}>
                  {r.label}
                </option>
              ))}
            </optgroup>
            {roles.length > 0 && (
              <optgroup label="Özel Roller">
                {roles.map((r) => (
                  <option key={r.id} value={`custom:${r.id}`}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
            className={`${inputClass} w-auto`}
          >
            <option value="all">Tüm durumlar</option>
            <option value="active">Yalnızca aktif</option>
            <option value="inactive">Yalnızca pasif</option>
          </select>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery('')
                setDeptFilter('all')
                setRoleFilter('all')
                setStatusFilter('all')
              }}
            >
              Filtreyi Temizle ({filteredUsers.length}/{users.length})
            </Button>
          )}
        </div>

        {filteredUsers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={users.length === 0 ? 'Kayıtlı personel yok' : 'Filtreye uygun personel bulunamadı'}
            text={users.length === 0 ? 'Sağ üstteki “Personel Ekle” butonuyla yeni ekip üyesi tanımlayabilirsiniz.' : 'Arama veya filtre kriterlerini temizleyip tekrar deneyin.'}
          />
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
                    <Tr key={user.id} className={user.is_active ? 'hover:bg-slate-50/70' : 'opacity-60'}>
                      <Td>
                        <div className="font-semibold text-slate-900">
                          {user.first_name} {user.last_name}
                          {isSelf && (
                            <span className="ml-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              siz
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">{user.email}</div>
                        {user.phone && (
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                            <span>{user.phone}</span>
                            {(() => {
                              const wa = whatsappUrl(user.phone, `Merhaba ${user.first_name},`)
                              return wa ? (
                                <a
                                  href={wa}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="WhatsApp ile mesaj gönder"
                                  className="inline-flex items-center hover:opacity-80"
                                >
                                  <WhatsAppIcon className="h-3.5 w-3.5" />
                                </a>
                              ) : null
                            })()}
                          </div>
                        )}
                      </Td>
                      <Td>
                        <select
                          disabled={locked || isSelf}
                          value={user.role}
                          onChange={(e) => update(user, { role: e.target.value }, 'Rol güncellendi')}
                          title={hasCustomRole ? 'Özel rol atandığı için yetkiler özel rolden alınır' : undefined}
                          className={`rounded-lg border bg-white p-1.5 text-xs font-semibold disabled:bg-slate-50 ${
                            hasCustomRole ? 'border-slate-200 text-slate-400' : 'border-slate-300 text-slate-800'
                          }`}
                        >
                          {user.role === 'platform_admin' && <option value="platform_admin">Sistem Yöneticisi</option>}
                          {builtinRoles.map((r) => (
                            <option key={r.key} value={r.key}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                        {hasCustomRole && <div className="mt-0.5 text-[10px] font-semibold text-amber-700">Özel rol aktif</div>}
                      </Td>
                      <Td>
                        <select
                          disabled={locked || isSelf}
                          value={user.staff_role_id || ''}
                          onChange={(e) =>
                            update(
                              user,
                              e.target.value ? { staff_role_id: e.target.value } : { clear_staff_role: true },
                              'Özel rol güncellendi',
                            )
                          }
                          className="rounded-lg border border-slate-300 bg-white p-1.5 text-xs font-semibold disabled:bg-slate-50"
                        >
                          <option value="">— (hazır rol geçerli)</option>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </Td>
                      <Td>
                        <select
                          disabled={locked}
                          value={user.department_id || ''}
                          onChange={(e) =>
                            update(
                              user,
                              e.target.value ? { department_id: e.target.value } : { clear_department: true },
                              'Birim güncellendi',
                            )
                          }
                          className="rounded-lg border border-slate-300 bg-white p-1.5 text-xs font-semibold disabled:bg-slate-50"
                        >
                          <option value="">—</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </Td>
                      <Td>
                        <span className="text-xs text-slate-500">{formatLastLogin(user.last_login_at)}</span>
                      </Td>
                      <Td>
                        <button
                          type="button"
                          disabled={locked || isSelf}
                          onClick={() =>
                            update(
                              user,
                              { is_active: !user.is_active },
                              user.is_active ? 'Hesap pasifleştirildi' : 'Hesap aktifleştirildi',
                            )
                          }
                          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold disabled:cursor-not-allowed ${
                            user.is_active
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-slate-100 text-slate-600'
                          }`}
                        >
                          {user.is_active ? 'Aktif' : 'Pasif'}
                        </button>
                      </Td>
                      {canManage && (
                        <Td>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {!locked && (
                              <Button type="button" variant="secondary" size="sm" onClick={() => openEdit(user)}>
                                <Pencil className="h-3 w-3" /> Düzenle
                              </Button>
                            )}
                            {isSelf ? (
                              <Link href="/admin/sifre" className="text-[11px] font-semibold text-emerald-700 hover:underline">
                                Şifremi değiştir
                              </Link>
                            ) : locked ? null : passwordFor === user.id ? (
                              <form onSubmit={(e) => setPassword(e, user)} className="flex items-center gap-1">
                                <div className="relative">
                                  <Input
                                    required
                                    minLength={10}
                                    type={showResetPwd ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    autoFocus
                                    placeholder="en az 10 karakter"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-40 pr-8 text-xs"
                                  />
                                  <button
                                    type="button"
                                    tabIndex={-1}
                                    onClick={() => setShowResetPwd((v) => !v)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                                    aria-label={showResetPwd ? 'Gizle' : 'Göster'}
                                  >
                                    {showResetPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                  </button>
                                </div>
                                <Button type="submit" size="sm">
                                  Kaydet
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setPasswordFor(null)
                                    setNewPassword('')
                                    setShowResetPwd(false)
                                  }}
                                >
                                  Vazgeç
                                </Button>
                              </form>
                            ) : (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setPasswordFor(user.id)
                                  setNewPassword('')
                                  setShowResetPwd(false)
                                }}
                              >
                                <KeyRound className="h-3 w-3" /> Şifre
                              </Button>
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
        <Modal
          title="Personel Bilgilerini Düzenle"
          description={editingUser.email}
          size="md"
          onClose={() => setEditingUser(null)}
        >
          <form onSubmit={submitEdit} className="grid gap-4 sm:grid-cols-2">
            <Label label="Ad *">
              <Input
                required
                value={editForm.first_name}
                onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
              />
            </Label>
            <Label label="Soyad *">
              <Input
                required
                value={editForm.last_name}
                onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
              />
            </Label>
            <div className="sm:col-span-2">
              <Label label="Telefon">
                <Input
                  placeholder="05xx xxx xx xx"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </Label>
            </div>
            {editingUser.id !== currentUserId && (
              <>
                <Label label="Hazır Rol">
                  <select
                    className={inputClass}
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  >
                    {builtinRoles.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </Label>
                <Label label="Özel Rol">
                  <select
                    className={inputClass}
                    value={editForm.staff_role_id}
                    onChange={(e) => setEditForm({ ...editForm, staff_role_id: e.target.value })}
                  >
                    <option value="">— (hazır rol geçerli)</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </Label>
              </>
            )}
            <div className="sm:col-span-2">
              <Label label="Birim">
                <select
                  className={inputClass}
                  value={editForm.department_id}
                  onChange={(e) => setEditForm({ ...editForm, department_id: e.target.value })}
                >
                  <option value="">—</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Label>
            </div>
            <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
              <Button type="button" variant="secondary" onClick={() => setEditingUser(null)}>
                Vazgeç
              </Button>
              <Button type="submit">Kaydet</Button>
            </div>
          </form>
        </Modal>
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
    if (
      await run(
        () => adminSend('put', `/departments/${d.id}`, { name: editName, description: editDesc.trim() || null }),
        'Birim güncellendi',
      )
    ) {
      setEditingId(null)
    }
  }

  const remove = async (d: Department) => {
    const ok = await confirmDialog({
      title: `"${d.name}" birimi silinsin mi?`,
      text: `${d.user_count} personelin birimi boşaltılacak.`,
      confirmLabel: 'Sil',
      danger: true,
    })
    if (ok) {
      run(() => adminSend('delete', `/departments/${d.id}`), 'Birim silindi')
    }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <Card className="rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          <form onSubmit={create} className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <Label label="Birim Adı *">
                <Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Kurban Birimi" />
              </Label>
            </div>
            <div className="min-w-64 flex-[2]">
              <Label label="Açıklama">
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="ör. Kurban kesim ve dağıtım ekibi"
                />
              </Label>
            </div>
            <Button type="submit">
              <Plus className="h-4 w-4" /> Birim Ekle
            </Button>
          </form>
        </Card>
      )}
      <Card className="rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        {departments.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Henüz birim tanımlanmadı"
            text="Personeli operasyonel departmanlara ayırmak için yukarıdan yeni birim ekleyin."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {departments.map((d) => (
              <li key={d.id} className="py-3.5 text-sm">
                {editingId === d.id ? (
                  <form onSubmit={(e) => saveEdit(e, d)} className="flex flex-wrap items-end gap-3">
                    <div className="min-w-44 flex-1">
                      <Label label="Birim Adı *">
                        <Input required minLength={2} value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                      </Label>
                    </div>
                    <div className="min-w-56 flex-[2]">
                      <Label label="Açıklama">
                        <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                      </Label>
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm">
                        Kaydet
                      </Button>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setEditingId(null)}>
                        Vazgeç
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {d.name}
                        <span className="ml-2 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                          {d.user_count} personel
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">{d.description || 'Açıklama yok'}</div>
                    </div>
                    {canManage && (
                      <div className="flex gap-2">
                        <Button type="button" variant="secondary" size="sm" onClick={() => startEdit(d)}>
                          <Pencil className="h-3 w-3" /> Düzenle
                        </Button>
                        <Button type="button" variant="danger" size="sm" onClick={() => remove(d)}>
                          <Trash2 className="h-3 w-3" /> Sil
                        </Button>
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

/**
 * e-Infak style role editor: role tabs, then one card per module. The card switch turns the whole
 * module on or off; ticks are single rules. Red ticks widen what the person sees beyond their own records.
 */
function RolesTab({
  roles,
  canManage,
  catalog,
  mine,
  run,
}: {
  roles: StaffRole[]
  canManage: boolean
  catalog: CapabilityGroup[]
  mine: string[]
  run: Run
}) {
  const [selectedId, setSelectedId] = useState<string | null>(roles[0]?.id || null)
  const [ticks, setTicks] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [newName, setNewName] = useState<string | null>(null)
  const [capQuery, setCapQuery] = useState('')
  const selected = roles.find((r) => r.id === selectedId) || null

  useEffect(() => {
    if (!selectedId && roles[0]) setSelectedId(roles[0].id)
  }, [roles, selectedId])

  useEffect(() => {
    setTicks(selected?.capabilities || [])
    setDirty(false)
  }, [selected])

  const selectRole = async (nextId: string) => {
    if (nextId === selectedId) return
    if (dirty) {
      const ok = await confirmDialog({
        title: 'Kaydedilmemiş yetki değişiklikleri var',
        text: 'Değişiklikleri kaydetmeden başka role geçerseniz düzenlemeleriniz kaybolacak.',
        confirmLabel: 'Yine de Geç',
        danger: true,
      })
      if (!ok) return
    }
    setSelectedId(nextId)
  }

  const grantable = (key: string) => mine.includes(key)
  const setGroup = (group: CapabilityGroup, on: boolean) => {
    const keys = group.capabilities.map((c) => c.key).filter(grantable)
    setTicks((t) => (on ? Array.from(new Set([...t, ...keys])) : t.filter((k) => !keys.includes(k))))
    setDirty(true)
  }
  const toggle = (key: string) => {
    setTicks((t) => (t.includes(key) ? t.filter((k) => k !== key) : [...t, key]))
    setDirty(true)
  }

  const save = async () => {
    if (!selected) return
    const ok = await run(
      () =>
        adminSend('put', `/staff-roles/${selected.id}`, {
          name: selected.name,
          description: selected.description,
          permissions: [],
          capabilities: ticks,
        }),
      `"${selected.name}" rolü kaydedildi`,
    )
    if (ok) setDirty(false)
  }

  const create = async () => {
    const name = (newName || '').trim()
    if (name.length < 2) {
      toast.error('Rol adı en az 2 karakter olmalıdır.')
      return
    }
    const ok = await run(() => adminSend('post', '/staff-roles', { name, permissions: [], capabilities: [] }), 'Rol eklendi')
    if (ok) setNewName(null)
  }

  const remove = async () => {
    if (!selected) return
    const okConfirm = await confirmDialog({
      title: `"${selected.name}" rolü kaldırılsın mı?`,
      text: selected.user_count ? `${selected.user_count} personelin rolü boşalır; hazır rollerinden yetki alırlar.` : undefined,
      confirmLabel: 'Kaldır',
      danger: true,
    })
    if (!okConfirm) return
    const ok = await run(() => adminSend('delete', `/staff-roles/${selected.id}`), 'Rol kaldırıldı')
    if (ok) setSelectedId(null)
  }

  const filteredCatalog = useMemo(() => {
    const q = capQuery.trim().toLowerCase()
    if (!q) return catalog
    return catalog.filter(
      (g) => g.label.toLowerCase().includes(q) || g.capabilities.some((c) => c.label.toLowerCase().includes(q)),
    )
  }, [catalog, capQuery])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {roles.map((role) => (
          <button
            key={role.id}
            type="button"
            onClick={() => selectRole(role.id)}
            className={`cursor-pointer rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              role.id === selectedId
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'border border-slate-200 bg-white text-slate-700 hover:border-emerald-500'
            }`}
          >
            {role.name}
            <span className="ml-1.5 text-[11px] opacity-75">{role.user_count}</span>
          </button>
        ))}
        {canManage &&
          (newName === null ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setNewName('')}>
              <Plus className="h-3.5 w-3.5" /> Yeni Rol Ekle
            </Button>
          ) : (
            <span className="flex items-center gap-2">
              <Input
                autoFocus
                className="w-48"
                placeholder="Rol adı"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') create()
                }}
              />
              <Button type="button" size="sm" onClick={create}>
                Ekle
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setNewName(null)}>
                İptal
              </Button>
            </span>
          ))}
      </div>

      {!selected ? (
        <Card className="rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          <EmptyState
            icon={Shield}
            title="Henüz kuruma özel rol yok"
            text="“Yeni Rol Ekle” ile başlayın; hazır roller (Muhasebe, Çağrı Merkezi…) kullanıcı düzenlemede seçilebilir."
          />
        </Card>
      ) : (
        <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
                <Shield className="h-4 w-4 text-emerald-600" /> “{selected.name}” rolü için yetki ve görev tanımlama
              </h2>
              {dirty && (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                  Kaydedilmemiş değişiklik
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-52">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  type="search"
                  value={capQuery}
                  onChange={(e) => setCapQuery(e.target.value)}
                  placeholder="Modül veya yetki ara…"
                  className="pl-8 text-xs"
                />
              </div>
              {canManage && (
                <>
                  <Button type="button" variant="danger" size="sm" onClick={remove}>
                    <Trash2 className="h-3.5 w-3.5" /> Bu Rolü Kaldır
                  </Button>
                  <Button type="button" size="sm" disabled={!dirty} onClick={save}>
                    Bu Rolü Kaydet
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {filteredCatalog.map((group) => {
              const on = group.capabilities.some((c) => ticks.includes(c.key))
              return (
                <div key={group.key} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">{group.label}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`${group.label} modülü`}
                      disabled={!canManage}
                      onClick={() => setGroup(group, !on)}
                      className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                        on ? 'bg-emerald-600' : 'bg-slate-300'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                          on ? 'left-[18px]' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {group.capabilities.map((cap) => (
                      <label
                        key={cap.key}
                        className={`flex items-start gap-2 text-[13px] leading-snug ${
                          !grantable(cap.key) ? 'text-slate-400' : cap.rule ? 'text-rose-600' : 'text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={ticks.includes(cap.key)}
                          disabled={!canManage || !grantable(cap.key)}
                          onChange={() => toggle(cap.key)}
                        />
                        <span>
                          {cap.label}
                          {!grantable(cap.key) && <span className="text-[10px]"> (sizde yok)</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-slate-500">
            Kırmızı yetkiler kapalıyken personel yalnızca temsilcisi olduğu bağışçıları ve kendi kestiği makbuzları görür. Telefon yetkisi kapalıysa numaralar{' '}
            <span className="font-mono">0532 *** ** 12</span> biçiminde görünür.
          </p>
        </Card>
      )}
    </div>
  )
}
