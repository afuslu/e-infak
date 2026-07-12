import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getApiClient } from './client'
import type { UserLogin, UserRegister, TokenResponse, User } from './types'

export const authKeys = {
  user: ['user'] as const,
}

export function useLogin() {
  const client = getApiClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (credentials: UserLogin) => {
      const response = await client.post<TokenResponse>('/auth/login', credentials)
      return response.data
    },
    onSuccess: (data) => {
      client.setAccessToken(data.access_token)
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      queryClient.invalidateQueries({ queryKey: authKeys.user })
    },
  })
}

export function useRegister() {
  const client = getApiClient()

  return useMutation({
    mutationFn: async (userData: UserRegister) => {
      const response = await client.post<User>('/auth/register', userData)
      return response.data
    },
  })
}

export function useLogout() {
  const client = getApiClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      await client.post('/auth/logout')
    },
    onSuccess: () => {
      client.clearAccessToken()
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      queryClient.setQueryData(authKeys.user, null)
      queryClient.clear()
    },
  })
}

export function useCurrentUser() {
  const client = getApiClient()

  return useQuery({
    queryKey: authKeys.user,
    queryFn: async () => {
      const token = localStorage.getItem('access_token')
      if (!token) return null

      client.setAccessToken(token)
      const response = await client.get<User>('/auth/me')
      return response.data
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
