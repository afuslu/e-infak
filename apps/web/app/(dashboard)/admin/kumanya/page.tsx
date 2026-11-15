import { redirect } from 'next/navigation'

export default function KumanyaRedirectPage() {
  redirect('/admin/yoksul-takip?tab=packages')
}
