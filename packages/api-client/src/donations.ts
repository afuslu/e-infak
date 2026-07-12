import { useMutation, useQuery } from '@tanstack/react-query'
import { getApiClient } from './client'
import type { DonationCreate, ThreeDSecureResponse, Donation } from './types'

export const donationKeys = {
  all: ['donations'] as const,
  lists: () => [...donationKeys.all, 'list'] as const,
  list: (filters: any) => [...donationKeys.lists(), filters] as const,
  details: () => [...donationKeys.all, 'detail'] as const,
  detail: (id: string) => [...donationKeys.details(), id] as const,
}

export function useCreateDonation() {
  const client = getApiClient()

  return useMutation({
    mutationFn: async (data: DonationCreate) => {
      const response = await client.post<ThreeDSecureResponse>('/donations', data)
      return response.data
    },
  })
}

export function useDonation(id: string) {
  const client = getApiClient()

  return useQuery({
    queryKey: donationKeys.detail(id),
    queryFn: async () => {
      const response = await client.get<Donation>(`/donations/${id}`)
      return response.data
    },
    enabled: !!id,
  })
}

interface DonationListParams {
  page?: number
  page_size?: number
  status?: string
  campaign_id?: string
}

export function useDonations(params: DonationListParams = {}) {
  const client = getApiClient()

  return useQuery({
    queryKey: donationKeys.list(params),
    queryFn: async () => {
      const response = await client.get<Donation[]>('/donations', { params })
      return response.data
    },
  })
}
