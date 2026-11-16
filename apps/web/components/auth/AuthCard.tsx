'use client'

import Link from 'next/link'
import { ReactNode } from 'react'
import { errorMessage } from '../../lib/api-error'

/** Shell shared by the staff sign-in, forgotten-password and reset pages. */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="portal relative flex min-h-screen flex-col items-center justify-center bg-pt-soft px-4 py-12 font-sans text-pt-text" data-theme="light">
      <div className="w-full max-w-[420px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <Link href="/" className="mb-4 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/e-infak/mark.png" alt="E-İnfak" width={48} height={48}
              className="h-12 w-12 rounded-2xl object-cover ring-1 ring-pt-line pt-shadow" />
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-pt-text sm:text-[1.75rem]">{title}</h1>
          <p className="mt-1.5 text-sm text-pt-muted">{subtitle}</p>
        </div>
        <div className="rounded-2xl border border-pt-line bg-pt-card p-6 pt-shadow sm:p-8">{children}</div>
      </div>
    </div>
  )
}

/** Turkish message from an API error; FastAPI validation errors arrive as a list. */
export const authErrorText = errorMessage
