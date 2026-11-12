/** Card scheme marks and the 3D Secure note banks look for on a donation site.
 *  Plain markup (no hooks) so both the server-rendered footer and client checkout forms can use it. */
export function PaymentTrustBadges({ tone = 'light', className = '' }: { tone?: 'light' | 'dark'; className?: string }) {
  const chip = tone === 'dark'
    ? 'border-white/15 bg-white text-slate-900'
    : 'border-slate-200 bg-white text-slate-900'
  const note = tone === 'dark' ? 'text-white/70' : 'text-slate-500'
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} aria-label="Kabul edilen kartlar ve güvenli ödeme">
      <span className={`inline-flex h-7 items-center rounded-md border px-2 text-[13px] font-black italic tracking-tight text-[#1a1f71] ${chip}`}>VISA</span>
      <span className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 ${chip}`} title="Mastercard">
        <svg width="26" height="16" viewBox="0 0 26 16" aria-hidden="true">
          <circle cx="9" cy="8" r="7" fill="#eb001b" />
          <circle cx="17" cy="8" r="7" fill="#f79e1b" fillOpacity="0.9" />
        </svg>
        <span className="text-[11px] font-bold">mastercard</span>
      </span>
      <span className={`inline-flex h-7 items-center rounded-md border px-2 text-[12px] font-black tracking-wide text-[#00a4a6] ${chip}`}>TROY</span>
      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${note}`}>
        <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true" fill="currentColor">
          <path d="M6 0 0 2.5v4C0 10 2.6 13 6 14c3.4-1 6-4 6-7.5v-4L6 0Zm-1 10L2 7l1.1-1.1L5 7.8l3.9-3.9L10 5l-5 5Z" />
        </svg>
        3D Secure ile güvenli ödeme
      </span>
    </div>
  )
}
