import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { ACTIVE_TENANT } from '@/config/tenant';
import { useAuth } from '@/context/AuthContext';
import type { SupportedCurrency } from '@/api/public';

export type CartItem = {
  key: string;
  campaign_id: string;
  campaign_slug: string;
  campaign_title: string;
  cover_image_url?: string | null;
  unit_amount_cents: number;
  quantity: number;
  on_behalf_of?: string;
  on_behalf_of_phone?: string;
  donor_message?: string;
  metadata?: Record<string, any>;
  /** Price set by the campaign: not converted when the currency changes, the donor chooses again. */
  locked?: boolean;
  max_quantity?: number;
};

type StoredCart = {
  currency: SupportedCurrency;
  items: CartItem[];
};

const STORAGE_KEY = 'einfak_donation_cart_v1';

/** Ortak uygulamada her kurumun sepeti ayrıdır; kuruma özel uygulama eski dosyasını kullanır. */
const cartKey = (org: string) => (org ? `${STORAGE_KEY}_${org.replace(/[^a-z0-9_-]/gi, '')}` : STORAGE_KEY);

async function readCart(KEY: string): Promise<StoredCart | null> {
  try {
    if (Platform.OS === 'web') {
      const raw = globalThis.localStorage?.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    }
    const file = new File(Paths.document, `${KEY}.json`);
    if (!file.exists) return null;
    const raw = await file.text();
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeCart(KEY: string, data: StoredCart): Promise<void> {
  try {
    const serialized = JSON.stringify(data);
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(KEY, serialized);
      return;
    }
    const file = new File(Paths.document, `${KEY}.json`);
    file.write(serialized);
  } catch {}
}

type AddItemInput = Omit<CartItem, 'key'>;

type CartContextValue = {
  items: CartItem[];
  currency: SupportedCurrency;
  totalCents: number;
  totalCount: number;
  setCurrency: (next: SupportedCurrency, ratesTry?: Record<string, number>) => void;
  addItem: (item: AddItemInput) => void;
  updateQuantity: (key: string, delta: number) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function makeItemKey(item: AddItemInput): string {
  const metaSig = item.metadata && Object.keys(item.metadata).length ? JSON.stringify(item.metadata) : '';
  return [
    item.campaign_id,
    item.unit_amount_cents,
    (item.on_behalf_of || '').trim().toLowerCase(),
    (item.donor_message || '').trim().toLowerCase(),
    metaSig,
  ].join('|');
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [currency, setCurrencyState] = useState<SupportedCurrency>('TRY');
  const { mode, site } = useAuth();
  const key = cartKey(ACTIVE_TENANT || mode !== 'donor' ? '' : site?.slug || '');
  // Hangi kurumun sepeti yüklü; yüklenmemiş sepetin üzerine yazılmaz.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoadedKey(null);
    readCart(key).then((saved) => {
      if (!alive) return;
      setItems(saved && Array.isArray(saved.items) ? saved.items : []);
      const cur = saved?.currency;
      setCurrencyState(cur === 'USD' || cur === 'EUR' ? cur : 'TRY');
      setLoadedKey(key);
    });
    return () => { alive = false; };
  }, [key]);

  useEffect(() => {
    if (loadedKey !== key) return;
    writeCart(key, { currency, items });
  }, [currency, items, loadedKey, key]);

  const setCurrency = useCallback(
    (next: SupportedCurrency, ratesTry?: Record<string, number>) => {
      if (next === currency) return;
      const tryPer = (cur: SupportedCurrency): number | null => {
        if (cur === 'TRY') return 1;
        const r = ratesTry?.[cur];
        return r && r > 0 ? r : null;
      };
      const fromRate = tryPer(currency);
      const toRate = tryPer(next);
      if (fromRate && toRate && items.length > 0) {
        const factor = fromRate / toRate;
        setItems((prev) =>
          prev.filter((item) => !item.locked).map((item) => {
            const converted = Math.max(100, Math.round((item.unit_amount_cents * factor) / 100) * 100);
            return { ...item, unit_amount_cents: converted };
          }),
        );
      }
      setCurrencyState(next);
    },
    [currency, items.length],
  );

  const addItem = useCallback((input: AddItemInput) => {
    const key = makeItemKey(input);
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.key === key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: Math.min(input.max_quantity || 100, next[idx].quantity + Math.max(1, input.quantity)) };
        return next;
      }
      return [...prev, { ...input, key, quantity: Math.max(1, Math.min(100, input.quantity)) }];
    });
  }, []);

  const updateQuantity = useCallback((key: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((item) => (item.key === key ? { ...item, quantity: Math.min(item.max_quantity || 100, item.quantity + delta) } : item))
        .filter((item) => item.quantity > 0),
    );
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const totalCents = useMemo(
    () => items.reduce((sum, item) => sum + item.unit_amount_cents * item.quantity, 0),
    [items],
  );

  const totalCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      currency,
      totalCents,
      totalCount,
      setCurrency,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
    }),
    [items, currency, totalCents, totalCount, setCurrency, addItem, updateQuantity, removeItem, clearCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart, CartProvider içinde kullanılmalı');
  return ctx;
}
