import { useMutation, useQuery } from '@tanstack/react-query'
import { getApiClient } from './client'
import type {
  ContactMessageCreate,
  ContactMessageResponse,
  PreRegistrationCreate,
  PreRegistrationResponse,
  ZakatInfo,
  OrgSettingsInfo,
} from './types'

export function useSendContactMessage() {
  const client = getApiClient()

  return useMutation({
    mutationFn: async (data: ContactMessageCreate) => {
      const response = await client.post<ContactMessageResponse>('/public/contact-messages', data)
      return response.data
    },
  })
}

export function useSendPreRegistration() {
  const client = getApiClient()

  return useMutation({
    mutationFn: async (data: PreRegistrationCreate) => {
      const response = await client.post<PreRegistrationResponse>('/public/pre-registrations', data)
      return response.data
    },
  })
}

export function useZakatInfo() {
  const client = getApiClient()

  return useQuery({
    queryKey: ['zakat-info'] as const,
    queryFn: async () => {
      const response = await client.get<ZakatInfo>('/public/zakat-info')
      return response.data
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useOrgSettings() {
  const client = getApiClient()

  return useQuery({
    queryKey: ['org-settings'] as const,
    queryFn: async () => {
      const response = await client.get<OrgSettingsInfo>('/public/org-settings')
      return response.data
    },
    staleTime: 5 * 60 * 1000,
  })
}
