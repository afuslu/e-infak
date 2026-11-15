import { redirect } from 'next/navigation'

// Banka Mutabakatı artık Ön Muhasebe (Gelen Havaleler sekmesi) altında birleştirildi.
export default function ReconciliationRedirect() {
  redirect('/admin/muhasebe?sekme=gelen-havaleler')
}
