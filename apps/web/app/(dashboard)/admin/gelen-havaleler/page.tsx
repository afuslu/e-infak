import { redirect } from 'next/navigation'

// Gelen Havaleler ve Banka Mutabakatı artık Ön Muhasebe altında tek sayfada birleştirildi.
export default function IncomingTransfersRedirect() {
  redirect('/admin/muhasebe?sekme=gelen-havaleler')
}
