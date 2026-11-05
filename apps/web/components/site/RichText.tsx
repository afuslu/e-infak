/**
 * Renders CMS body text stored as plain text: blank lines separate paragraphs,
 * lines starting with "## " become headings. Content is never injected as HTML.
 */
export function RichText({ text, className = '' }: { text: string | null | undefined; className?: string }) {
  if (!text) return null
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  return (
    <div className={`space-y-4 text-[17px] leading-relaxed text-[#3A4540] ${className}`}>
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        if (lines.length === 1 && block.startsWith('## ')) {
          return <h2 key={i} className="pt-2 text-2xl font-bold text-[#1C2420]">{block.slice(3)}</h2>
        }
        return (
          <p key={i}>
            {lines.map((line, j) => (
              <span key={j}>
                {line.startsWith('## ') ? <strong className="block text-xl text-[#1C2420]">{line.slice(3)}</strong> : line}
                {j < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}
