import { campaignFor } from './catalog.mjs'
import { amountToCents } from './domain.mjs'

export function normalizeCart(site, data) {
  if (!Array.isArray(data)) return []
  return data.slice(0,50).filter(row => row && campaignFor(site,row.id) && Number.isSafeInteger(row.cents) && row.cents >= 100 && row.cents <= 100000000).map(row => ({ id: row.id, cents: row.cents }))
}

export function addToCart(site, cart, id, amount) {
  if (!campaignFor(site,id)) throw new Error('Bu proje bu kuruma ait değil.')
  const rows = normalizeCart(site,cart)
  if (rows.length >= 50) throw new Error('Sepete en fazla 50 kalem eklenebilir.')
  return [...rows, { id, cents: Number(amountToCents(amount)) }]
}

export function cartTotal(site, cart) {
  return normalizeCart(site,cart).reduce((sum,row) => sum + BigInt(row.cents), 0n)
}

export function updateCartAmount(site, cart, index, amount) {
  const rows = normalizeCart(site, cart)
  if (!Number.isInteger(index) || index < 0 || index >= rows.length) throw new Error('Sepet kalemi bulunamadı.')
  return rows.map((row, i) => i === index ? { ...row, cents: Number(amountToCents(amount)) } : row)
}

export function parseCart(site, raw) {
  try { return normalizeCart(site, JSON.parse(raw || '[]')) } catch { return [] }
}
