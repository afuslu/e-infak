/**
 * Kurban toplu girişinin saf kuralları (ekran bileşeninden ayrı, testli).
 */
export interface BulkRow {
  donor_name: string
  phone: string
  on_behalf_of: string
  kurban_type: string
  shares: string
  payment_method: 'cash' | 'bank_transfer' | 'credit_card'
  status: 'paid' | 'pending'
}

export const emptyBulkRow = (defaults?: Partial<BulkRow>): BulkRow => ({
  donor_name: '', phone: '', on_behalf_of: '',
  kurban_type: defaults?.kurban_type || 'vacip',
  shares: defaults?.shares || '1',
  payment_method: defaults?.payment_method || 'cash',
  status: defaults?.status || 'paid',
})

export const isBlankRow = (r: BulkRow) => !r.donor_name.trim() && !r.phone.trim() && !r.on_behalf_of.trim()

/** Excel'den kopyalanan satırlar (sekmeyle ayrılmış): Bağışçı · Telefon · Kimin adına · Hisse. Başlık satırı atlanır. */
export function parsePastedRows(text: string, defaults: BulkRow): BulkRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split('\t').map((cell) => cell.trim()))
    .filter((cells) => cells.some(Boolean))
    .filter((cells) => !/^ba[gğ][iı][sş][cç][iı]/i.test(cells[0] || ''))
    .map(([donor = '', phone = '', onBehalf = '', shares = '']) => ({
      ...defaults,
      donor_name: donor,
      phone,
      on_behalf_of: onBehalf,
      shares: /^\d+$/.test(shares) ? shares : defaults.shares,
    }))
}

/** "Tümüne" doldurma: seçilen alanı her satıra yazar. */
export function applyToAll<K extends keyof BulkRow>(rows: BulkRow[], field: K, value: BulkRow[K]): BulkRow[] {
  return rows.map((r) => ({ ...r, [field]: value }))
}

/** Sunucuya gidecek satırlar: boşlar atılır, hisse en az 1, boş alanlar null. */
export function toPayloadRows(rows: BulkRow[]) {
  return rows.filter((r) => !isBlankRow(r)).map((r) => ({
    donor_name: r.donor_name.trim(), phone: r.phone.trim() || null, on_behalf_of: r.on_behalf_of.trim() || null,
    kurban_type: r.kurban_type, shares: Math.max(1, Number(r.shares) || 1),
    payment_method: r.payment_method, status: r.status,
  }))
}
