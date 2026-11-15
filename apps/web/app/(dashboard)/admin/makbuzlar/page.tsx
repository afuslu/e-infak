import { redirect } from 'next/navigation'

// Makbuzlar became the "Elle makbuzlar" view of Bağışlar (same records, more filters).
export default function ReceiptsRedirect() {
  redirect('/admin/bagislar?gorunum=elle')
}
