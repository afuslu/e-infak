'use client'

import React from 'react'

function renderInlineBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <React.Fragment key={i}>{part}</React.Fragment>
  })
}

/**
 * Renders plain/lightweight-formatted campaign stories safely via React JSX
 * (headings `## `, bullet lists `- ` / `• `, and `**bold**`).
 */
export function FormattedStory({ text, className = '' }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let listItems: string[] = []

  const flushList = (keyPrefix: string) => {
    if (listItems.length === 0) return
    blocks.push(
      <ul key={`${keyPrefix}-ul`} className="list-disc pl-5 space-y-1 text-slate-700">
        {listItems.map((item, idx) => (
          <li key={idx}>{renderInlineBold(item)}</li>
        ))}
      </ul>,
    )
    listItems = []
  }

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim()
    if (!line) {
      flushList(`b-${idx}`)
      return
    }
    if (line.startsWith('## ')) {
      flushList(`h-${idx}`)
      blocks.push(
        <h3 key={`h-${idx}`} className="text-base font-bold text-slate-900 pt-2">
          {renderInlineBold(line.slice(3))}
        </h3>,
      )
      return
    }
    if (line.startsWith('- ') || line.startsWith('• ')) {
      listItems.push(line.slice(2))
      return
    }
    flushList(`p-${idx}`)
    blocks.push(
      <p key={`p-${idx}`} className="leading-relaxed text-slate-700">
        {renderInlineBold(line)}
      </p>,
    )
  })
  flushList('end')

  return <div className={`space-y-2.5 text-sm ${className}`}>{blocks}</div>
}
