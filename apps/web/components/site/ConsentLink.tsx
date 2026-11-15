'use client'

import { openConsent } from '../../lib/consent'

/** Footer entry that reopens the cookie choice. */
export function ConsentLink({ className = 'hover:text-white' }: { className?: string }) {
  return <button type="button" onClick={openConsent} className={className}>Çerez tercihleri</button>
}
