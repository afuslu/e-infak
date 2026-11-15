import { createHmac } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { devOrgSlug, isLocalHost, normalizeHost, resolveHostSlug } from '../../../../lib/tenant-host'

async function orgForRequest(request: NextRequest) {
  const host = normalizeHost(request.headers.get('host'))
  if (isLocalHost(host)) return devOrgSlug(null, request.cookies.get('org-slug')?.value)
  return resolveHostSlug(host)
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  const orgSlug = await orgForRequest(request)
  // Platform API only through the platform host (it also needs a platform token).
  if (orgSlug && path[0] === 'api' && path[2] === 'platform' && !isLocalHost(normalizeHost(request.headers.get('host')))) {
    return NextResponse.json({ detail: 'Not found' }, { status: 404 })
  }
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const secret = process.env.TENANT_PROXY_SECRET || ''
  const headers = new Headers()
  for (const header of ['accept', 'authorization', 'content-type', 'x-locale', 'user-agent', 'x-forwarded-proto']) {
    const value = request.headers.get(header)
    if (value) headers.set(header, value)
  }
  // Our proxy (nginx / Caddy) appends the address it saw last; anything before it was typed by
  // the client. uvicorn trusts the first entry, so only the proxy-added one is passed on —
  // otherwise IP blocks, rate limits and login logs could be spoofed.
  const forwarded = request.headers.get('x-forwarded-for')
  const clientIp = forwarded?.split(',').map((part) => part.trim()).filter(Boolean).pop()
  if (clientIp) headers.set('x-forwarded-for', clientIp)
  // Platform-level calls (platform console, directory) carry no tenant.
  if (orgSlug) {
    headers.set('x-organization-slug', orgSlug)
    headers.set('x-einfak-tenant-timestamp', timestamp)
    headers.set('x-einfak-tenant-signature', createHmac('sha256', secret).update(`${orgSlug}:${timestamp}`).digest('hex'))
  }

  const baseUrl = (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020').replace(/\/$/, '')
  const target = new URL(`${baseUrl}/${path.map(encodeURIComponent).join('/')}`)
  target.search = request.nextUrl.search
  const method = request.method
  const upstream = await fetch(target, {
    method,
    headers,
    body: ['GET', 'HEAD'].includes(method) ? undefined : await request.arrayBuffer(),
    cache: 'no-store',
  })
  const responseHeaders = new Headers()
  for (const header of ['content-type', 'content-disposition', 'cache-control', 'retry-after']) {
    const value = upstream.headers.get(header)
    if (value) responseHeaders.set(header, value)
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
