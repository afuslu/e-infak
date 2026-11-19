import { redirect } from 'next/navigation'

// Banka Hesapları, Web Servis Bilgileri ve Akıllı Eşleştirme Kuralları artık Banka & Ödeme altında birleştirildi.
export default function BankAccountsRedirect() {
  redirect('/admin/banka-odeme?sekme=banka-hesaplari')
}
