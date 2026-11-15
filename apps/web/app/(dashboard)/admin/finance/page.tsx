import { redirect } from 'next/navigation'

// Kasa & Giderler artık Ön Muhasebe (Gelir/Gider sekmesi) altında birleştirildi.
export default function FinanceRedirect() {
  redirect('/admin/muhasebe?sekme=gelir-gider')
}
