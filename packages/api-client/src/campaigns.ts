import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiClient } from './client'
import type { Campaign, CampaignListResponse } from './types'

export const campaignKeys = {
  all: ['campaigns'] as const,
  lists: () => [...campaignKeys.all, 'list'] as const,
  list: (filters: any) => [...campaignKeys.lists(), filters] as const,
  details: () => [...campaignKeys.all, 'detail'] as const,
  detail: (slug: string) => [...campaignKeys.details(), slug] as const,
}

interface CampaignListParams {
  page?: number
  page_size?: number
  status?: string
  category?: string
  featured?: boolean
  search?: string
}

export function useCampaigns(params: CampaignListParams = {}) {
  const client = getApiClient()

  return useQuery({
    queryKey: campaignKeys.list(params),
    queryFn: async () => {
      const response = await client.get<CampaignListResponse>('/campaigns', {
        params,
      })
      return response.data
    },
  })
}

export function useCampaign(slug: string) {
  const client = getApiClient()

  return useQuery({
    queryKey: campaignKeys.detail(slug),
    queryFn: async () => {
      const response = await client.get<Campaign>(`/campaigns/${slug}`)
      return response.data
    },
    enabled: !!slug,
  })
}

export function useCreateCampaign() {
  const client = getApiClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: Partial<Campaign>) => {
      const response = await client.post<Campaign>('/campaigns', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.lists() })
    },
  })
}

export function useUpdateCampaign() {
  const client = getApiClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Campaign> }) => {
      const response = await client.patch<Campaign>(`/campaigns/${id}`, data)
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.lists() })
      queryClient.invalidateQueries({ queryKey: campaignKeys.detail(data.slug) })
    },
  })
}
