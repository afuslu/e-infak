import { redirect } from 'next/navigation'

// Banka Hesapları, Web Servis Bilgileri ve Akıllı Eşleştirme Kuralları artık Ön Muhasebe (Kasa & Banka sekmesi) altında birleştirildi.
export default function BankAccountsRedirect() {
  redirect('/admin/muhasebe?sekme=kasa-banka')
}
