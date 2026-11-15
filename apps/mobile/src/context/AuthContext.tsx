import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'
import { apiFetch, clearTokens, getTokens, saveTokens } from '../lib/api'
import { registerForPushNotificationsAsync } from '../lib/notifications'

const BIOMETRIC_KEY = 'einfak_biometric_enabled'

export interface AuthUser {
  id: string
  email: string
  first_name: string
  last_name: string
  role: string
  organization_id?: string | null
}

export interface AdminAccess {
  me: {
    id: string
    role: string
    permissions?: string[]
  }
  features?: string[]
}

interface AuthContextValue {
  user: AuthUser | null
  access: AdminAccess | null
  isStaffOrAdmin: boolean
  loading: boolean
  biometricEnabled: boolean
  lockedByBiometric: boolean
  unlockWithBiometric: () => Promise<boolean>
  toggleBiometric: (enable: boolean) => Promise<boolean>
  signIn: (email: string, password: string, tenantHost?: string) => Promise<void>
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [access, setAccess] = useState<AdminAccess | null>(null)
  const [loading, setLoading] = useState(true)
  const [biometricEnabled, setBiometricEnabled] = useState(false)
  const [lockedByBiometric, setLockedByBiometric] = useState(false)

  const refreshSession = useCallback(async () => {
    setLoading(true)
    try {
      const [{ access: token }, bio] = await Promise.all([
        getTokens(),
        SecureStore.getItemAsync(BIOMETRIC_KEY),
      ])
      const isBio = bio === '1'
      setBiometricEnabled(isBio)

      if (!token) {
        setUser(null)
        setAccess(null)
        setLockedByBiometric(false)
        return
      }
      const me = await apiFetch<AuthUser>('/auth/me')
      setUser(me)
      if (isBio) setLockedByBiometric(true)

      try {
        const adm = await apiFetch<AdminAccess>('/admin-features/access')
        setAccess(adm)
      } catch {
        setAccess(null)
      }
      registerForPushNotificationsAsync().catch(() => {})
    } catch {
      setUser(null)
      setAccess(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshSession()
  }, [refreshSession])

  const unlockWithBiometric = async (): Promise<boolean> => {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'e-İnfak kilidini açın',
      cancelLabel: 'Vazgeç',
    })
    if (res.success) {
      setLockedByBiometric(false)
      return true
    }
    return false
  }

  const toggleBiometric = async (enable: boolean): Promise<boolean> => {
    if (enable) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync()
      const enrolled = await LocalAuthentication.isEnrolledAsync()
      if (!hasHardware || !enrolled) return false
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Biyometrik kilidi etkinleştir',
      })
      if (!res.success) return false
      await SecureStore.setItemAsync(BIOMETRIC_KEY, '1')
      setBiometricEnabled(true)
      return true
    }
    await SecureStore.deleteItemAsync(BIOMETRIC_KEY)
    setBiometricEnabled(false)
    setLockedByBiometric(false)
    return true
  }

  const signIn = async (email: string, password: string, tenantHost?: string) => {
    const cleanHost = tenantHost?.trim() || null
    if (cleanHost) {
      await saveTokens('', null, cleanHost)
    }
    const res = await apiFetch<{ access_token: string; refresh_token?: string }>(
      '/auth/login',
      {
        method: 'POST',
        auth: false,
        headers: cleanHost ? { 'X-Forwarded-Host': cleanHost } : undefined,
        body: JSON.stringify({ email: email.trim(), password }),
      },
    )
    await saveTokens(res.access_token, res.refresh_token, cleanHost)
    await refreshSession()
    setLockedByBiometric(false)
  }

  const signOut = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' })
    } catch {
      // ignore logout network errors
    }
    await clearTokens()
    setUser(null)
    setAccess(null)
    setLockedByBiometric(false)
  }

  const isStaffOrAdmin = Boolean(
    access ||
      (user &&
        ['platform_admin', 'org_admin', 'admin', 'staff', 'accountant'].includes(
          user.role?.toLowerCase(),
        )),
  )

  return (
    <AuthContext.Provider
      value={{
        user,
        access,
        isStaffOrAdmin,
        loading,
        biometricEnabled,
        lockedByBiometric,
        unlockWithBiometric,
        toggleBiometric,
        signIn,
        signOut,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
