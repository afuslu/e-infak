export const organizations = Object.freeze({
  hicret: Object.freeze({ name: 'Hicret Derneği', domain: 'hicretdernegi.org', color: '#20594a', eyebrow: 'EĞİTİM · DAYANIŞMA · GELECEK', title: 'Bir insan yetişir.\nBir gelecek değişir.', description: 'Eğitime destek olun, iyiliğin nesilden nesile ulaşmasına katkıda bulunun.', mark: 'H', items: ['Eğitime destek', 'Öğrenci desteği', 'Genel bağış'] }),
  kardeslik: Object.freeze({ name: 'Kardeşlik Payı', domain: 'kardeslikpayi.org', color: '#973c2c', eyebrow: 'PAYLAŞMAKLA BAŞLAYAN BİR HİKÂYE', title: 'İyilik,\npaylaştıkça büyür.', description: 'Bir sofraya, bir aileye, bir geleceğe dokunun. Kardeşlik payınızla dayanışmanın bir parçası olun.', mark: 'K', items: ['Gıda desteği', 'İhtiyaç sahiplerine destek', 'Genel bağış'] }),
})

const hosts = new Map([
  ['e-infak.org', 'platform'], ['www.e-infak.org', 'platform'],
  ...Object.entries(organizations).flatMap(([id, org]) => [[org.domain, id], [`www.${org.domain}`, id]]),
])

export function resolveSite(host, path, development = false) {
  const hostname = String(host || '').toLowerCase().split(':')[0]
  if (development && ['localhost', '127.0.0.1'].includes(hostname)) {
    const slug = path.split('/')[1]
    return organizations[slug] ? slug : 'platform'
  }
  return hosts.get(hostname) || null
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

// No floating point arithmetic in payment amounts. Decimal input is explicit.
export function amountToCents(value) {
  if (typeof value !== 'string' || !/^\d{1,7}(?:[.,]\d{1,2})?$/.test(value)) throw new Error('Geçersiz tutar')
  const [whole, fraction = ''] = value.replace(',', '.').split('.')
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (cents < 100n || cents > 100000000n) throw new Error('Tutar 1–1.000.000 TL aralığında olmalıdır')
  return cents
}

// A payment can only progress through verified events. Refunded states never
// become paid again when an old success callback is delivered.
export function paymentTransition(state, event) {
  const transitions = {
    pending: { verified_paid: 'paid', verified_failed: 'failed' },
    paid: { verified_paid: 'paid', partial_refund: 'partially_refunded', full_refund: 'refunded' },
    partially_refunded: { verified_paid: 'partially_refunded', partial_refund: 'partially_refunded', full_refund: 'refunded' },
    refunded: { verified_paid: 'refunded' },
    failed: { verified_failed: 'failed', verified_paid: 'paid' },
  }
  const next = transitions[state]?.[event]
  if (!next) throw new Error('Geçersiz ödeme durum geçişi')
  return next
}
