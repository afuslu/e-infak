import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Block text without HTML: blank line = paragraph, "## "/"### " = headings,
 * "- " = bullet list, "1. " = numbered list, "> " = quote, **bold**, *italic*,
 * [text](https://… or /path). Everything else is plain text.
 */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\))/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const key = `${keyPrefix}-${i++}`
    if (match[2]) out.push(<strong key={key}>{match[2]}</strong>)
    else if (match[3]) out.push(<em key={key}>{match[3]}</em>)
    else if (match[4] && match[5]) {
      const href = match[5]
      out.push(href.startsWith('/')
        ? <Link key={key} href={href} className="font-semibold text-primary-700 underline">{match[4]}</Link>
        : <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-700 underline">{match[4]}</a>)
    }
    last = match.index + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function BlockText({ text, className = '' }: { text?: string | null; className?: string }) {
  if (!text) return null
  const chunks = text.split(/\n{2,}/).map((c) => c.trim()).filter(Boolean)
  return (
    <div className={`space-y-4 text-[17px] leading-relaxed ${className}`}>
      {chunks.map((chunk, i) => {
        const lines = chunk.split('\n')
        const key = `t${i}`
        if (lines.length === 1 && chunk.startsWith('### ')) return <h3 key={key} className="pt-1 font-heading text-xl font-bold">{inline(chunk.slice(4), key)}</h3>
        if (lines.length === 1 && chunk.startsWith('## ')) return <h2 key={key} className="pt-2 font-heading text-2xl font-bold">{inline(chunk.slice(3), key)}</h2>
        if (lines.every((l) => /^[-•] /.test(l))) {
          return <ul key={key} className="list-disc space-y-1 ps-6">{lines.map((l, j) => <li key={j}>{inline(l.slice(2), `${key}-${j}`)}</li>)}</ul>
        }
        if (lines.every((l) => /^\d+[.)] /.test(l))) {
          return <ol key={key} className="list-decimal space-y-1 ps-6">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\d+[.)] /, ''), `${key}-${j}`)}</li>)}</ol>
        }
        if (lines.every((l) => l.startsWith('> '))) {
          return <blockquote key={key} className="border-s-4 border-primary-600 ps-4 italic opacity-90">{lines.map((l, j) => <p key={j}>{inline(l.slice(2), `${key}-${j}`)}</p>)}</blockquote>
        }
        return <p key={key}>{lines.map((line, j) => <span key={j}>{inline(line, `${key}-${j}`)}{j < lines.length - 1 && <br />}</span>)}</p>
      })}
    </div>
  )
}
