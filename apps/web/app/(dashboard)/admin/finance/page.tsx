import { redirect } from 'next/navigation'

// Kasa & Giderler moved into Muhasebe (same expense records); DERBİS export is in its header.
export default function FinanceRedirect() {
  redirect('/admin/muhasebe?sekme=expenses')
}
