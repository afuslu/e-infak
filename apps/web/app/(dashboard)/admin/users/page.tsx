'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, Button } from '@e-infak/ui'

interface StaffUser {
  id: string
  first_name: string
  last_name: string
  email: string
  role: string
  is_active: boolean
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<StaffUser[]>([])
  const [loading, setLoading] = useState(false)
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState('')

  const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    return {
      Authorization: `Bearer ${token}`,
    }
  }

  const loadUsers = async () => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      const res = await axios.get(`${API_BASE}/api/v1/admin-features/users`, { headers })
      setUsers(res.data)
    } catch (err) {
      console.error('Failed to load users:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingUserId(userId)
    setSuccessMsg('')
    try {
      const headers = getAuthHeaders()
      await axios.put(`${API_BASE}/api/v1/admin-features/users/${userId}/role`, {
        role: newRole
      }, { headers })
      
      setSuccessMsg('Kullanıcı yetki rolü başarıyla güncellendi!')
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
    } catch (err: any) {
      console.error(err)
      alert(err.response?.data?.detail || 'Rol güncelleme yetkiniz bulunmamaktadır.')
    } finally {
      setUpdatingUserId(null)
    }
  }

  const getRoleBadgeColor = (role: string) => {
    const map: Record<string, string> = {
      platform_admin: 'bg-red-100 text-red-800 border-red-200',
      stk_admin: 'bg-purple-100 text-purple-800 border-purple-200',
      muhasebe: 'bg-blue-100 text-blue-800 border-blue-200',
      crm: 'bg-green-100 text-green-800 border-green-200',
      operasyon: 'bg-orange-100 text-orange-800 border-orange-200',
      readonly: 'bg-gray-100 text-gray-800 border-gray-200'
    }
    return map[role] || 'bg-gray-100 text-gray-800 border-gray-200'
  }

  const getRoleLabel = (role: string) => {
    const map: Record<string, string> = {
      platform_admin: 'Sistem Yöneticisi',
      stk_admin: 'Dernek Admin',
      muhasebe: 'Muhasebe/Sayman',
      crm: 'CRM Temsilcisi',
      operasyon: 'Saha Görevlisi',
      readonly: 'Salt Okunur'
    }
    return map[role] || role
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Personel & Rol Yönetimi</h1>
        <button
          onClick={loadUsers}
          className="text-xs font-bold text-primary-600 hover:text-primary-700 bg-white border px-3 py-1.5 rounded-lg shadow-sm"
        >
          🔄 Yenile
        </button>
      </div>

      {successMsg && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 font-semibold border border-green-100 animate-fade-in">
          ✨ {successMsg}
        </div>
      )}

      <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
        {loading ? (
          <p className="text-sm text-gray-500 animate-pulse py-6 text-center">Kullanıcılar yükleniyor...</p>
        ) : users.length === 0 ? (
          <p className="text-xs text-gray-400 py-6 text-center">Dernekte kayıtlı personel bulunmamaktadır.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600">
              <thead>
                <tr className="border-b text-gray-500 uppercase tracking-wider text-[10px] font-bold">
                  <th className="pb-3">Ad Soyad</th>
                  <th className="pb-3">E-Posta</th>
                  <th className="pb-3">Mevcut Rol</th>
                  <th className="pb-3 text-right">Rol Değiştir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50/50">
                    <td className="py-4 font-semibold text-gray-900">
                      {user.first_name} {user.last_name}
                    </td>
                    <td className="py-4 font-mono text-[11px] text-gray-500">{user.email}</td>
                    <td className="py-4">
                      <span className={`inline-block font-bold px-2 py-0.5 rounded border text-[10px] ${getRoleBadgeColor(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="py-4 text-right">
                      {updatingUserId === user.id ? (
                        <span className="text-[10px] text-gray-400 font-bold animate-pulse">Güncelleniyor...</span>
                      ) : (
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          className="rounded-lg border border-gray-300 p-1.5 text-xs outline-none bg-white font-semibold text-gray-700"
                        >
                          <option value="stk_admin">Dernek Admin</option>
                          <option value="muhasebe">Muhasebe/Sayman</option>
                          <option value="crm">CRM Temsilcisi</option>
                          <option value="operasyon">Saha Görevlisi</option>
                          <option value="readonly">Salt Okunur</option>
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
