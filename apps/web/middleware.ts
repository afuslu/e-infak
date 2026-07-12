import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || ''
  
  // Extract organization slug from hostname
  let orgSlug = 'default'
  
  // Custom domain mapping
  if (hostname.includes('hicretdernegi.org')) {
    orgSlug = 'hicret-dernegi'
  } else if (hostname.includes('kardeslikpayi.org')) {
    orgSlug = 'kardeslik-payi'
  } else if (hostname.includes('e-infak.org')) {
    // Subdomain routing: tenant.e-infak.org
    const subdomain = hostname.split('.')[0]
    if (subdomain && subdomain !== 'www' && subdomain !== 'e-infak') {
      orgSlug = subdomain
    }
  } else if (hostname.includes('localhost')) {
    // For development, allow localhost with port
    orgSlug = 'hicret-dernegi' // Default for development
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
