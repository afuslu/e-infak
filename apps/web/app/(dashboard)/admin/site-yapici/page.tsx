import { Suspense } from 'react'
import { SiteBuilderEditor } from '../../../../components/builder/Editor'

export default function SiteBuilderPage() {
  return <Suspense fallback={null}><SiteBuilderEditor /></Suspense>
}
