import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api, Query } from './api';

export type Page<T> = { items: T[]; total: number; [key: string]: any };

/** `page` / `page_size` ile sayfalanan ve `{items,total}` dönen listeler için sonsuz kaydırma. */
export function usePaged<T>(key: unknown[], path: string, query: Query = {}, pageSize = 30, enabled = true) {
  const result = useInfiniteQuery({
    queryKey: [...key, query, pageSize],
    enabled,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<Page<T>>(path, { query: { ...query, page: pageParam, page_size: pageSize } }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, p) => sum + (p.items?.length || 0), 0);
      return loaded < (last.total || 0) && last.items?.length ? pages.length + 1 : undefined;
    },
  });
  const items = result.data?.pages.flatMap((p) => p.items || []) ?? [];
  const first = result.data?.pages[0];
  return { ...result, items, total: first?.total ?? 0, first };
}

export function useDebounced<T>(value: T, delay = 350): T {
  const [state, setState] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setState(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return state;
}
