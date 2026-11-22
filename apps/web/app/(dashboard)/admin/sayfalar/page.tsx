import { redirect } from 'next/navigation'

export default function AdminPagesRedirect() {
  redirect('/admin/site-yapici?tab=pages')
}
