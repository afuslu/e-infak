/** One readable Turkish line from an API error: FastAPI sends a string, an object with a
 * message, or (validation errors) a list of {msg}. Rendering the raw list crashes React. */
export function errorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (!detail) return fallback
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const text = detail
      .map((d: { msg?: string }) => (d?.msg || '').replace(/^Value error, /, ''))
      .filter(Boolean)
      .join(', ')
    return text || fallback
  }
  if (typeof detail === 'object' && 'message' in detail) return String((detail as { message: unknown }).message)
  return fallback
}
