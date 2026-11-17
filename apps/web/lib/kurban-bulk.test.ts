import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyToAll, emptyBulkRow, parsePastedRows, toPayloadRows } from './kurban-bulk'

test('Excel yapıştırması: başlık atlanır, sütun sırası Bağışçı · Telefon · Kimin adına · Hisse', () => {
  const defaults = emptyBulkRow({ kurban_type: 'sadaka', shares: '1' })
  const rows = parsePastedRows('Bağışçı\tTelefon\tKimin Adına\tHisse\nErsin Şenol\t0555 111 22 01\t\t2\n\nSelim Kaya\t\tAnnesi; Babası\tx\n', defaults)
  assert.equal(rows.length, 2)
  assert.deepEqual([rows[0].donor_name, rows[0].phone, rows[0].shares, rows[0].kurban_type], ['Ersin Şenol', '0555 111 22 01', '2', 'sadaka'])
  assert.deepEqual([rows[1].on_behalf_of, rows[1].shares], ['Annesi; Babası', '1'])
})

test('Tümüne uygula yalnız seçilen alanı değiştirir', () => {
  const rows = [{ ...emptyBulkRow(), donor_name: 'A' }, { ...emptyBulkRow(), donor_name: 'B' }]
  const done = applyToAll(rows, 'status', 'pending')
  assert.deepEqual(done.map((r) => r.status), ['pending', 'pending'])
  assert.deepEqual(done.map((r) => r.donor_name), ['A', 'B'])
})

test('gönderilecek satırlar: boşlar atılır, hisse en az 1', () => {
  const payload = toPayloadRows([emptyBulkRow(), { ...emptyBulkRow(), donor_name: ' Ali ', shares: '0' }])
  assert.deepEqual(payload, [{ donor_name: 'Ali', phone: null, on_behalf_of: null, kurban_type: 'vacip', shares: 1, payment_method: 'cash', status: 'paid' }])
})
