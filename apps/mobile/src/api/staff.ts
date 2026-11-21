import { useQuery } from '@tanstack/react-query';
import { af } from '@/lib/api';

export type StaffRole = { id: string; name: string; description: string | null; permissions: string[]; capabilities: string[]; user_count: number };
export type Department = { id: string; name: string; description: string | null; user_count: number };

export const useStaffRoles = () => useQuery({ queryKey: ['staff-roles'], queryFn: () => af<StaffRole[]>('/staff-roles') });
export const useDepartments = () => useQuery({ queryKey: ['departments'], queryFn: () => af<Department[]>('/departments') });

export const BUILTIN_ROLE_OPTIONS = [
  { value: 'stk_admin', label: 'Dernek Yöneticisi', hint: 'Tüm yetkiler' },
  { value: 'muhasebe', label: 'Muhasebe', hint: 'Makbuz, finans, raporlar' },
  { value: 'crm', label: 'Bağışçı İlişkileri', hint: 'Bağışçılar ve SMS' },
  { value: 'editor', label: 'İçerik Editörü', hint: 'Web sitesi ve kampanyalar' },
  { value: 'operasyon', label: 'Operasyon', hint: 'Saha işleri, kurban, kumbara' },
  { value: 'readonly', label: 'Yalnızca Görüntüleme', hint: 'Ayarlar hariç her şeyi görür' },
];
