import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const hostname = (request.headers.get('host') || '').split(':')[0].toLowerCase()
  const url = new URL(request.url)
  
  // Production custom domains are authoritative; query/cookie tenant selection is
  // allowed only on local development hosts.
  let orgSlug = ''
  if (hostname === 'hicretdernegi.org' || hostname === 'www.hicretdernegi.org') {
    orgSlug = 'hicret-dernegi'
  } else if (hostname === 'kardeslikpayi.org' || hostname === 'www.kardeslikpayi.org') {
    orgSlug = 'kardeslik-payi'
  } else if (hostname.endsWith('.e-infak.org')) {
    const subdomain = hostname.split('.')[0]
    if (subdomain && subdomain !== 'www') {
      orgSlug = subdomain
    }
  } else if (hostname.startsWith('localhost') || hostname.startsWith('127.0.0.1')) {
    orgSlug = url.searchParams.get('org')
      || request.cookies.get('org-slug')?.value
      || 'hicret-dernegi'
  }

  // Set organization context in headers for backend requests
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-organization-slug', orgSlug)
  
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  // Set cookie for client-side access
  response.cookies.set('org-slug', orgSlug, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  })

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
