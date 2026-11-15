'use client';

import React from 'react';

export type HesapTuru = 'kasa' | 'banka';

export interface HesapGorunumTercihleri {
  kasaSirasi: string[];
  bankaSirasi: string[];
  renkler: Record<string, number>;
  varsayilanDonem?: 'aylik' | 'yillik';
}

export const BOS_HESAP_GORUNUMU: HesapGorunumTercihleri = {
  kasaSirasi: [],
  bankaSirasi: [],
  renkler: {},
  varsayilanDonem: 'yillik',
};

export const HESAP_RENK_PALETI = [
  'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/40',
  'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/40',
  'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/40',
  'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800/40',
  'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800/40',
  'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-300 dark:border-cyan-800/40',
  'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800/40',
  'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-800/40',
  'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800/40',
  'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/30 dark:text-pink-300 dark:border-pink-800/40',
  'bg-lime-50 text-lime-700 border-lime-200 dark:bg-lime-950/30 dark:text-lime-300 dark:border-lime-800/40',
  'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/30 dark:text-fuchsia-300 dark:border-fuchsia-800/40',
] as const;

export const HESAP_RENK_NOKTALARI = [
  'bg-emerald-500',
  'bg-blue-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-lime-500',
  'bg-fuchsia-500',
] as const;

export const HESAP_RENK_ADLARI = [
  'Zümrüt',
  'Mavi',
  'Kehribar',
  'Mor',
  'Gül',
  'Camgöbeği',
  'Çivit',
  ' Deniz Mavisi',
  'Turuncu',
  'Pembe',
  'Limon',
  'Fuşya',
] as const;

export const hesapRenkAnahtari = (tur: HesapTuru, id: string): string => `${tur}:${id}`;

export const otomatikRenkIndeksi = (id?: string | null, ad?: string | null): number => {
  const anahtar = id ? String(id) : (ad || '');
  if (!anahtar) return 0;
  let hash = 0;
  for (let i = 0; i < anahtar.length; i += 1) {
    hash = anahtar.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % HESAP_RENK_PALETI.length;
};

export const getHesapRenkIndeksi = (
  tur: HesapTuru,
  id?: string | null,
  ad?: string | null,
  renkler?: Record<string, number>,
): number => {
  if (id && renkler) {
    const kayitli = renkler[hesapRenkAnahtari(tur, id)];
    if (typeof kayitli === 'number' && kayitli >= 0 && kayitli < HESAP_RENK_PALETI.length) {
      return kayitli;
    }
  }
  return otomatikRenkIndeksi(id, ad);
};

export const getHesapRenkSinifi = (
  tur: HesapTuru,
  id?: string | null,
  ad?: string | null,
  renkler?: Record<string, number>,
): string => HESAP_RENK_PALETI[getHesapRenkIndeksi(tur, id, ad, renkler)];

export const applyUserOrder = <T extends { id: string }>(items: T[], order: string[]): T[] => {
  if (!order.length) return items;
  const siraHaritasi = new Map<string, number>();
  order.forEach((id, index) => {
    if (!siraHaritasi.has(id)) siraHaritasi.set(id, index);
  });
  return [...items].sort((a, b) => {
    const siraA = siraHaritasi.get(a.id);
    const siraB = siraHaritasi.get(b.id);
    if (siraA !== undefined && siraB !== undefined) return siraA - siraB;
    if (siraA !== undefined) return -1;
    if (siraB !== undefined) return 1;
    return 0;
  });
};

export const moveInOrder = (mevcutIds: string[], kaynakId: string, hedefId: string): string[] => {
  const eskiIndeks = mevcutIds.indexOf(kaynakId);
  const yeniIndeks = mevcutIds.indexOf(hedefId);
  if (eskiIndeks < 0 || yeniIndeks < 0 || eskiIndeks === yeniIndeks) return mevcutIds;
  const kopya = [...mevcutIds];
  const [tasinan] = kopya.splice(eskiIndeks, 1);
  kopya.splice(yeniIndeks, 0, tasinan);
  return kopya;
};

export const formatIban = (iban?: string | null): string => {
  if (!iban) return '-';
  const clean = iban.replace(/\s+/g, '').toUpperCase();
  const groups = clean.match(/.{1,4}/g);
  return groups ? groups.join(' ') : clean;
};

export const getBankLogoOrIcon = (bankName?: string | null, sizeClass = 'w-8 h-8'): React.ReactNode => {
  const name = (bankName || '').toLocaleLowerCase('tr-TR');

  if (name.includes('ziraat')) {
    return (
      <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 rounded-lg border border-red-200`} fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" fill="#E30A17" />
        <path d="M30 22 C34 22, 48 31, 48 45 C48 59, 34 68, 30 68 C34 68, 48 78, 48 88" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" />
        <path d="M52 20 V80" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" />
        <path d="M52 46 C60 41, 72 32, 72 32 M52 54 C60 59, 72 68, 72 68" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name.includes('vakıf') || name.includes('vakif')) {
    return (
      <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 rounded-lg border border-slate-200 bg-white`} fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" fill="#FFFFFF" />
        <rect x="39" y="10" width="22" height="22" rx="5" transform="rotate(45 50 21)" stroke="#E2007A" strokeWidth="6" fill="none" />
        <rect x="18" y="32" width="22" height="22" rx="5" transform="rotate(45 29 43)" stroke="#0D4E96" strokeWidth="6" fill="none" />
        <rect x="60" y="32" width="22" height="22" rx="5" transform="rotate(45 71 43)" stroke="#0D4E96" strokeWidth="6" fill="none" />
        <rect x="39" y="54" width="22" height="22" rx="5" transform="rotate(45 50 65)" stroke="#0D4E96" strokeWidth="6" fill="none" />
      </svg>
    );
  }
  if (name.includes('kuveyt')) {
    return (
      <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 rounded-lg border border-teal-800/40`} fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" fill="#005C53" />
        <circle cx="50" cy="50" r="41" stroke="#FFFFFF" strokeWidth="5" />
        <path d="M50 50 C45 48, 17 52, 15 52 C20 42, 42 48, 50 50 Z" fill="#FFFFFF" />
        <path d="M50 50 C46 45, 19 33, 19 32 C28 25, 45 42, 50 50 Z" fill="#FFFFFF" />
        <path d="M50 50 C48 40, 50 16, 50 15 C50 16, 52 40, 50 50 Z" fill="#FFFFFF" />
        <path d="M50 50 C54 45, 81 33, 81 32 C72 25, 55 42, 50 50 Z" fill="#FFFFFF" />
        <path d="M50 50 C55 48, 83 52, 85 52 C80 42, 58 48, 50 50 Z" fill="#FFFFFF" />
        <path d="M50 50 L56 58 H44 Z M50 58 L57 66 H43 Z M50 66 L58 74 H42 Z M50 74 L59 82 H41 Z" fill="#FFFFFF" />
      </svg>
    );
  }
  if (name.includes('emlak')) {
    return (
      <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 rounded-lg border border-slate-200 bg-white`} fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" fill="#FFFFFF" />
        <path d="M22 22 C22 21 23 20 24 20 H76 C77 20 78 21 78 22 V42 L50 30 L22 42 Z" fill="#0D4E96" />
        <path d="M16 54 L48 31 C49.2 30.2 50.8 30.2 52 31 L84 54" stroke="#E20E0E" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22 56 L50 44 L78 56 V78 C78 79 77 80 76 80 H24 C23 80 22 79 22 78 Z" fill="#009639" />
      </svg>
    );
  }
  if (name.includes('albaraka')) {
    return (
      <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 rounded-lg border border-emerald-800/40`} fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" fill="#006430" />
        <circle cx="50" cy="50" r="25" stroke="#D4AF37" strokeWidth="6" fill="none" />
        <path d="M35 50 H65" stroke="#D4AF37" strokeWidth="6" strokeLinecap="round" />
      </svg>
    );
  }
  if (name.includes('garanti')) {
    return (
      <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 rounded-lg border border-slate-200 bg-white`} fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" fill="#FFFFFF" />
        <circle cx="50" cy="50" r="41" fill="#007A87" />
        <circle cx="50" cy="35" r="11" fill="#FFFFFF" />
        <circle cx="50" cy="65" r="11" fill="#FFFFFF" />
        <circle cx="35" cy="50" r="11" fill="#FFFFFF" />
        <circle cx="65" cy="50" r="11" fill="#FFFFFF" />
      </svg>
    );
  }
  if (name.includes('akbank') || name.includes('ak bank')) {
    return (
      <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 rounded-lg border border-red-800/40`} fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" fill="#E30A17" />
        <text x="50" y="65" fill="#FFFFFF" fontSize="48" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">a</text>
      </svg>
    );
  }
  if (name.includes('yapı') || name.includes('yapi')) {
    return (
      <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 rounded-lg border border-slate-900`} fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" fill="#0A2540" />
        <path d="M30 40 C35 30, 45 30, 50 40 C55 30, 65 30, 70 40 C65 55, 35 55, 30 40 Z" stroke="#E3A817" strokeWidth="8" strokeLinecap="round" fill="none" />
        <path d="M50 40 L50 75" stroke="#E3A817" strokeWidth="8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name.includes('halk')) {
    return (
      <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 rounded-lg border border-blue-800/40`} fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="45" fill="#005CA9" />
        <path d="M25 50 C25 35, 35 25, 50 25 C65 25, 75 35, 75 50 L50 50 Z" fill="#FFFFFF" />
        <circle cx="50" cy="50" r="10" fill="#005CA9" />
      </svg>
    );
  }
  if (name.includes('qnb') || name.includes('finans')) {
    return (
      <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 rounded-lg border border-sky-800/40`} fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" fill="#002D62" />
        <path d="M30 30 H70 V70 H30 Z" stroke="#FFFFFF" strokeWidth="6" fill="none" transform="rotate(45 50 50)" />
        <circle cx="50" cy="50" r="10" fill="#E30A17" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 rounded-lg border border-slate-200 bg-slate-50`} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 75 H80 M30 75 V45 M50 75 V45 M70 75 V45 M25 45 L50 25 L75 45 Z" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600" />
    </svg>
  );
};
