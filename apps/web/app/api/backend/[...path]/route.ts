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
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const secret = process.env.TENANT_PROXY_SECRET || ''
  const headers = new Headers()
  // x-forwarded-for comes from nginx (it appends the real client last); uvicorn
  // --proxy-headers trusts it from 127.0.0.1 so rate limits and payment
  // providers see the donor's address instead of the gateway's.
  for (const header of ['accept', 'authorization', 'content-type', 'x-locale', 'user-agent', 'x-forwarded-for', 'x-forwarded-proto']) {
    const value = request.headers.get(header)
    if (value) headers.set(header, value)
  }
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
