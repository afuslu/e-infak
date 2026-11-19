import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BOOT_ID = String(Date.now())

function resolveBuildId(): string {
  if (process.env.NEXT_PUBLIC_BUILD_ID) return process.env.NEXT_PUBLIC_BUILD_ID
  try {
    const buildIdPath = join(process.cwd(), '.next', 'BUILD_ID')
    if (existsSync(buildIdPath)) {
      const id = readFileSync(buildIdPath, 'utf8').trim()
      if (id) return id
    }
  } catch { /* fallback below */ }
  return BOOT_ID
}

export async function GET() {
  return NextResponse.json(
    { buildId: resolveBuildId() },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
  )
}
