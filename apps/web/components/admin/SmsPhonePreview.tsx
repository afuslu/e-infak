'use client'

import { ArrowUp, ChevronLeft, MessageSquare } from 'lucide-react'

interface SmsPhonePreviewProps {
  senderTitle: string
  senderSubtitle?: string
  body: string
  counterText?: string
  counterWarn?: boolean
  variant?: 'A' | 'B'
  onVariantChange?: (variant: 'A' | 'B') => void
  compact?: boolean
}

/** Light-mode upright smartphone mockup for live SMS previews in admin. */
export function SmsPhonePreview({
  senderTitle,
  senderSubtitle,
  body,
  counterText,
  counterWarn = false,
  variant = 'A',
  onVariantChange,
  compact = false,
}: SmsPhonePreviewProps) {
  const isVariantB = Boolean(onVariantChange && variant === 'B')

  return (
    <div className="mx-auto w-full max-w-[290px]">
      <div className="overflow-hidden rounded-[2.25rem] border-[6px] border-slate-800 bg-white shadow-xl ring-1 ring-slate-900/10">
        {/* Status Bar */}
        <div className="flex items-center justify-between bg-white px-5 pt-2.5 pb-1.5 text-[10px] font-semibold text-slate-800">
          <span className="tabular-nums">09:41</span>
          <span className="h-3.5 w-16 rounded-full bg-slate-900" aria-hidden="true" />
          <div className="flex items-center gap-1">
            <span>5G</span>
            <span className="inline-flex h-2.5 w-4 items-center rounded-[3px] border border-slate-700 p-[1px]" aria-hidden="true">
              <span className="h-full w-3 rounded-[1px] bg-slate-800" />
            </span>
          </div>
        </div>

        {/* Messaging App Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-white px-3 py-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <ChevronLeft className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-200/80 bg-emerald-50 text-emerald-700">
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-slate-900">{senderTitle}</div>
              {senderSubtitle && (
                <div className="truncate font-mono text-[10px] text-slate-400">{senderSubtitle}</div>
              )}
            </div>
          </div>

          {onVariantChange && (
            <div className="flex shrink-0 rounded-lg bg-slate-100 p-0.5 text-[10px] font-bold">
              <button
                type="button"
                onClick={() => onVariantChange('A')}
                className={`cursor-pointer rounded-md px-2 py-0.5 transition-colors ${
                  variant === 'A' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                A
              </button>
              <button
                type="button"
                onClick={() => onVariantChange('B')}
                className={`cursor-pointer rounded-md px-2 py-0.5 transition-colors ${
                  variant === 'B' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                B
              </button>
            </div>
          )}
        </div>

        {/* Message Screen */}
        <div className={`flex flex-col bg-slate-50 px-3.5 py-4 ${compact ? 'min-h-[150px]' : 'min-h-[200px]'}`}>
          <div className="mb-3 text-center text-[10px] font-medium text-slate-400">
            SMS · Bugün 09:41
          </div>
          <div
            className={`max-w-[92%] whitespace-pre-line rounded-2xl rounded-tl-sm border px-3.5 py-2.5 text-xs leading-relaxed text-slate-800 shadow-2xs ${
              isVariantB
                ? 'border-indigo-200 bg-indigo-50/70'
                : 'border-slate-200/80 bg-white'
            }`}
          >
            {body || '…'}
          </div>
        </div>

        {/* Mock Input & Home Bar */}
        <div className="border-t border-slate-100 bg-white px-3 pt-2 pb-2">
          <div className="flex items-center justify-between rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] text-slate-400">
            <span>Kısa Mesaj</span>
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white" aria-hidden="true">
              <ArrowUp className="h-2.5 w-2.5" />
            </span>
          </div>
          <div className="mx-auto mt-2.5 h-1 w-24 rounded-full bg-slate-300" aria-hidden="true" />
        </div>
      </div>

      {counterText && (
        <p
          className={`mt-2.5 text-center text-[11px] font-semibold ${
            counterWarn ? 'text-amber-600' : 'text-slate-500'
          }`}
        >
          {counterText}
        </p>
      )}
    </div>
  )
}
