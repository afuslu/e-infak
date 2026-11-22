import { redirect } from 'next/navigation'

export default function AdminMenuRedirect() {
  redirect('/admin/site-yapici?tab=menu')
}
