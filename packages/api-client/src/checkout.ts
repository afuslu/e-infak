import { useMutation, useQuery } from '@tanstack/react-query'
import { getApiClient } from './client'
import type { CheckoutSessionCreate, CheckoutSessionResponse, CheckoutStatus } from './types'

export function useCreateCheckout() {
  const client = getApiClient()
  return useMutation({
    mutationFn: async (data: CheckoutSessionCreate) => {
      const response = await client.post<CheckoutSessionResponse>('/checkout/sessions', data)
      return response.data
    },
  })
}

export function useCheckoutStatus(checkoutId?: string) {
  const client = getApiClient()
  return useQuery({
    queryKey: ['checkout', checkoutId],
    queryFn: async () => {
      const response = await client.get<CheckoutStatus>(`/checkout/${checkoutId}/status`)
      return response.data
    },
    enabled: Boolean(checkoutId),
    refetchInterval: (query) =>
      ['pending', 'processing'].includes(query.state.data?.status || '') ? 2500 : false,
  })
}
