import Link from 'next/link'

/** 404 in the organisation's colours (brand variables come from the root layout). */
export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-gray-50 px-4 py-16">
      <div className="max-w-md text-center">
        <p className="text-6xl font-black text-primary-600">404</p>
        <h1 className="mt-3 text-2xl font-bold text-gray-900">Sayfa bulunamadı</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">Aradığınız sayfa kaldırılmış, adı değişmiş ya da hiç var olmamış olabilir.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-700">Ana sayfa</Link>
          <Link href="/kampanyalar" className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-700 hover:border-primary-400">Kampanyalar</Link>
        </div>
      </div>
    </main>
  )
}
