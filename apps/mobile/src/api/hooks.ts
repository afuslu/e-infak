import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { af, api } from '@/lib/api';
import type { Campaign, StaffUser } from './types';

export function useCampaignOptions() {
  const query = useQuery({
    queryKey: ['campaign-options'],
    queryFn: () => api<{ items: Campaign[] }>('/campaigns', { query: { page_size: 100 } }),
    staleTime: 5 * 60_000,
  });
  return useMemo(() => (query.data?.items || []).map((c) => ({ value: c.id, label: c.title })), [query.data]);
}

export function useStaff(enabled = true) {
  return useQuery({ queryKey: ['staff'], enabled, queryFn: () => af<StaffUser[]>('/users'), staleTime: 60_000 });
}

export function useStaffOptions(enabled = true) {
  const query = useStaff(enabled);
  return useMemo(
    () => (query.data || []).filter((u) => u.is_active).map((u) => ({ value: u.id, label: `${u.first_name} ${u.last_name}`.trim() })),
    [query.data],
  );
}
