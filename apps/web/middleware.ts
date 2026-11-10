import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { devOrgSlug, isLocalHost, normalizeHost, resolveHostSlug } from './lib/tenant-host'

function createNonce() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

export async function middleware(request: NextRequest) {
  const hostname = normalizeHost(request.headers.get('host'))
  const url = new URL(request.url)

  // Production hosts are resolved by the backend (subdomains and verified custom
  // domains); query/cookie tenant selection is allowed only on local hosts.
  // An empty slug renders the platform landing page.
  const orgSlug = isLocalHost(hostname)
    ? devOrgSlug(url.searchParams.get('org'), request.cookies.get('org-slug')?.value)
    : await resolveHostSlug(hostname)

  // The platform console exists only on the platform host, never on an organisation's site.
  if (url.pathname.startsWith('/platform') && orgSlug && !isLocalHost(hostname)) {
    return new NextResponse('Not found', { status: 404 })
  }

  // Website language: ?lang=xx switches and is remembered in a cookie.
  const requestedLang = (url.searchParams.get('lang') || '').toLowerCase()
  const cookieLang = (request.cookies.get('lang')?.value || '').toLowerCase()
  const locale = /^[a-z]{2}$/.test(requestedLang) ? requestedLang : /^[a-z]{2}$/.test(cookieLang) ? cookieLang : 'tr'

  // Set organization context in headers for backend requests
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-locale', locale)
  const nonce = createNonce()
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    // The site builder shows its live preview in a same-origin frame; nothing else may be framed.
    url.pathname === '/site-yapici-cerceve' ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
    "img-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline' https://*.tawk.to",
    "font-src 'self' data: https://*.tawk.to",
    "media-src 'self' https://*.tawk.to",
    // Site builder canvas (same origin), CMS videos (YouTube privacy mode / Vimeo) and the Tawk.to chat widget
    "frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com https://*.tawk.to",
    // 'strict-dynamic' lets the nonce'd app bundle inject the Tawk.to loader
    // `next dev` evaluates modules with eval (React Refresh); production never needs it.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`,
    "connect-src 'self' https://vpos.ziraatpay.com.tr https://test.ziraatpay.com.tr https://*.tawk.to wss://*.tawk.to",
    "form-action 'self' https://vpos.ziraatpay.com.tr https://test.ziraatpay.com.tr",
  ].join('; ')
  requestHeaders.set('x-organization-slug', orgSlug)
  // Next.js reads the nonce from the request headers while rendering and adds
  // it to its own inline scripts.  User supplied scripts remain blocked.
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy)
  
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  if (locale !== cookieLang) {
    response.cookies.set('lang', locale, { httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
  }

  // Set cookie for client-side access
  response.cookies.set('org-slug', orgSlug, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  })
  response.headers.set('Content-Security-Policy', contentSecurityPolicy)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', url.pathname === '/site-yapici-cerceve' ? 'SAMEORIGIN' : 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

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
