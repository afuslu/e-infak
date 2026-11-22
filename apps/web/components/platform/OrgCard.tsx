'use client'

import Link from 'next/link'
import { useState } from 'react'
import { startSimulation } from '../../lib/simulation'
import {
  AlertTriangle,
  Eye,
  ArrowRight,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Globe,
  HandCoins,
  LogIn,
  MapPin,
  MessageSquare,
  Power,
  StickyNote,
  Users,
} from 'lucide-react'
import { PlatformAlert, PlatformOrg, copyText, dateTr, platformError } from '../../lib/platform-api'

interface OrgCardProps {
  org: PlatformOrg
  alerts: PlatformAlert[]
  busy: boolean
  onSupport: (org: PlatformOrg) => void
  onToggleActive: (org: PlatformOrg) => void
}

const PLAN_STYLES: Record<string, string> = {
  baslangic: 'bg-slate-100 text-slate-700 ring-slate-200/80',
  orta: 'bg-sky-50 text-sky-700 ring-sky-200/80',
  ileri: 'bg-violet-50 text-violet-700 ring-violet-200/80',
}

const SUB_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  active: { label: 'Aktif abonelik', cls: 'text-emerald-700 bg-emerald-50' },
  trial: { label: 'Deneme', cls: 'text-sky-700 bg-sky-50' },
  past_due: { label: 'Ödeme gecikmiş', cls: 'text-red-700 bg-red-50' },
  suspended: { label: 'Askıda abonelik', cls: 'text-red-700 bg-red-50' },
}

export function OrgCard({ org, alerts, busy, onSupport, onToggleActive }: OrgCardProps) {
  const [copied, setCopied] = useState(false)

  const openAlerts = alerts.filter((a) => a.organization_id === org.id && a.level !== 'info')
  const hasDanger = openAlerts.some((a) => a.level === 'danger')
  const hasWarning = openAlerts.length > 0

  const userCount = org.user_count ?? 0
  const userLimit = Math.max(org.user_limit || 1, 1)
  const usagePct = Math.min(100, Math.round((userCount / userLimit) * 100))
  const isFull = userCount >= org.user_limit
  const isNearFull = !isFull && usagePct >= 80

  const pendingDomain = org.domains.some((d) => d.status === 'pending')
  const errorDomain = org.domains.find((d) => d.last_check_error)

  const effectiveSubStatus = !org.is_active ? 'suspended' : (org.subscription_status || 'active')
  const subInfo = SUB_STATUS_LABELS[effectiveSubStatus] || SUB_STATUS_LABELS.active
  const monthlyFee = org.monthly_fee_cents ? `${(org.monthly_fee_cents / 100).toLocaleString('tr-TR')} ₺/ay` : null

  const accentBorder = !org.is_active
    ? 'border-l-red-400 bg-slate-50/75'
    : hasDanger
      ? 'border-l-red-500 bg-white'
      : hasWarning
        ? 'border-l-amber-400 bg-white'
        : 'border-l-emerald-500 bg-white'

  const handleCopyUrl = async () => {
    const ok = await copyText(org.url)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  const barColor = isFull ? 'bg-red-500' : isNearFull ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <article
      className={`group flex flex-col justify-between rounded-2xl border border-slate-200/90 border-l-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md ${accentBorder}`}
    >
      {/* Header */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold shadow-xs ${
                org.is_active ? 'bg-gradient-to-br from-emerald-600 to-teal-600 text-white' : 'bg-slate-200 text-slate-500'
              }`}
            >
              {(org.name[0] || 'K').toUpperCase()}
            </div>
            <div className="min-w-0">
              <Link
                href={`/platform/kurum/${org.id}`}
                className="block truncate text-base font-bold text-slate-900 transition-colors group-hover:text-emerald-700 hover:underline"
              >
                {org.name}
              </Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                <span className="font-mono text-[11px] text-slate-500">{org.slug}</span>
                {org.city && (
                  <span className="inline-flex items-center gap-0.5 text-slate-400">
                    <MapPin className="h-3 w-3" aria-hidden="true" />
                    {org.city}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                org.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${org.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
              {org.is_active ? 'Aktif' : 'Askıda'}
            </span>
            <span
              className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                PLAN_STYLES[org.plan] || 'bg-slate-100 text-slate-700 ring-slate-200'
              }`}
            >
              {org.plan_label}
            </span>
          </div>
        </div>

        {/* Domain row */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Globe className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            <a
              href={org.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-w-0 items-center gap-1 truncate text-xs font-semibold text-blue-700 hover:underline"
            >
              <span className="truncate">{org.url.replace(/^https?:\/\//, '')}</span>
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
            </a>
          </div>
          <div className="flex items-center gap-1.5">
            {pendingDomain && (
              <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                Bekleyen DNS
              </span>
            )}
            {errorDomain && !pendingDomain && (
              <span
                title={errorDomain.last_check_error || undefined}
                className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700"
              >
                DNS Hatası
              </span>
            )}
            <button
              type="button"
              onClick={handleCopyUrl}
              title="Adresi kopyala"
              aria-label={`${org.name} adresini kopyala`}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-white hover:text-slate-800"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? 'Kopyalandı' : ''}</span>
            </button>
          </div>
        </div>

        {/* Metrics grid */}
        <div className="mt-3.5 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-100 bg-white p-3">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                Kullanıcı
              </span>
              {org.extra_user_seats > 0 && (
                <span className="rounded bg-slate-100 px-1 text-[10px] font-bold text-slate-600">
                  +{org.extra_user_seats} ek
                </span>
              )}
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className={`text-sm font-extrabold ${isFull ? 'text-red-600' : 'text-slate-900'}`}>
                {userCount} <span className="text-xs font-medium text-slate-400">/ {org.user_limit}</span>
              </span>
              <span className="text-[11px] font-semibold text-slate-400">%{usagePct}</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${usagePct}%` }} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-white p-3">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
              <HandCoins className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Bağış</span>
            </div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {(org.donation_count ?? 0).toLocaleString('tr-TR')}
            </div>
            <div className="mt-1.5 truncate text-[11px] text-slate-400" title={dateTr(org.last_donation_at)}>
              Son: {dateTr(org.last_donation_at)}
            </div>
          </div>
        </div>

        {/* Subscription & provider pills */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={`rounded-md px-2 py-0.5 font-semibold ${subInfo.cls}`}>{subInfo.label}</span>
          {monthlyFee && (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{monthlyFee}</span>
          )}
          {org.subscription_ends_at && (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">
              Bitiş: {dateTr(org.subscription_ends_at)}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-slate-600" title="Ödeme sağlayıcı">
            <CreditCard className="h-3 w-3 text-slate-400" aria-hidden="true" />
            {org.payment_provider}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-slate-600" title="SMS sağlayıcı">
            <MessageSquare className="h-3 w-3 text-slate-400" aria-hidden="true" />
            {org.sms_provider}
          </span>
          {org.platform_notes && (
            <span
              title={org.platform_notes}
              className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-800"
            >
              <StickyNote className="h-3 w-3" aria-hidden="true" />
              Not var
            </span>
          )}
        </div>

        {/* Inline alert banner if org has open alerts */}
        {openAlerts.length > 0 && (
          <div
            className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
              hasDanger
                ? 'border-red-200 bg-red-50/80 text-red-800'
                : 'border-amber-200 bg-amber-50/80 text-amber-800'
            }`}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <span className="font-semibold">{openAlerts[0].message}</span>
              {openAlerts.length > 1 && (
                <span className="ms-1.5 text-[11px] font-bold opacity-80">+{openAlerts.length - 1} uyarı daha</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3 rounded-b-2xl">
        <Link
          href={`/platform/kurum/${org.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 transition hover:text-emerald-800"
        >
          <span>Yönet</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!org.is_active || busy}
            onClick={() => startSimulation(org.id).catch((err) => window.alert(platformError(err, 'Simülasyon başlatılamadı')))}
            title="Paneli bu sekmede yönetici olarak aç"
            aria-label={`${org.name} simüle et`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:pointer-events-none disabled:opacity-40"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Simüle et</span>
          </button>
          <button
            type="button"
            disabled={!org.is_active || busy}
            onClick={() => onSupport(org)}
            title="Destek girişi"
            aria-label={`${org.name} destek girişi`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40"
          >
            <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Destek</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onToggleActive(org)}
            title={org.is_active ? 'Askıya al' : 'Aktif et'}
            aria-label={org.is_active ? `${org.name} askıya al` : `${org.name} aktif et`}
            className={`inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
              org.is_active
                ? 'border-red-200 text-red-600 hover:bg-red-50'
                : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            <Power className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{org.is_active ? 'Askıya al' : 'Aktif et'}</span>
          </button>
        </div>
      </div>
    </article>
  )
}
