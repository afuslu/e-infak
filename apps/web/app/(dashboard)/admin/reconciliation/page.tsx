import { redirect } from 'next/navigation'

// Banka Mutabakatı is now a tab of Gelen Havaleler.
export default function ReconciliationRedirect() {
  redirect('/admin/gelen-havaleler?sekme=mutabakat')
}
