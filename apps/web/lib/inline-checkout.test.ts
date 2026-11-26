import assert from 'node:assert/strict'
import test from 'node:test'
import { bundleTotal, campaignUnit, cartLine, intentsFor, parsePresets, quantityLimits, sharesTaken, splitName, storyIndex, validPhone } from './inline-checkout'

test('price comes from the campaign before the block', () => {
  assert.equal(campaignUnit({ id: 'a', donation_options: { mode: 'share' }, reference_amounts: { TRY: 50000 } }, 10), 500)
  assert.equal(campaignUnit({ id: 'a', donation_options: { mode: 'fixed' }, reference_amounts: {} }, 10), null)
  assert.equal(campaignUnit({ id: 'a', donation_options: { mode: 'packages' } }, 10), null)
  assert.equal(campaignUnit({ id: 'a', allow_custom_amount: false, suggested_amounts_cents: [250000] }, 10), 2500)
  assert.equal(campaignUnit({ id: 'a', allow_custom_amount: true, suggested_amounts_cents: [250000] }, 450), 450)
  assert.equal(campaignUnit({ id: 'a', donation_options: { mode: 'free' } }, 0), null)
  assert.equal(campaignUnit(undefined, 75), 75)
})

test('quantity limits follow counted campaigns and the block minimum', () => {
  assert.deepEqual(quantityLimits({ id: 'a', donation_options: { mode: 'quantity', min_qty: 2, max_qty: 20 } }, 10), { min: 10, max: 20 })
  assert.deepEqual(quantityLimits({ id: 'a', donation_options: { mode: 'fixed', min_qty: 5 } }), { min: 1, max: 100 })
  assert.deepEqual(quantityLimits({ id: 'a', donation_options: { mode: 'share', max_qty: 3 } }, 10), { min: 3, max: 3 })
})

test('campaign intentions win over the block list', () => {
  assert.deepEqual(intentsFor({ id: 'a', donation_options: { intents: ['Adak'] } }, 'Şükür'), ['Adak'])
  assert.deepEqual(intentsFor({ id: 'a', checkout_fields_schema: [{ key: 'niyet', options: ['Akika'] }] }, 'Şükür'), ['Akika'])
  assert.deepEqual(intentsFor({ id: 'a' }, 'Şükür, Şifa ,'), ['Şükür', 'Şifa'])
  assert.ok(intentsFor(undefined).includes('Adak'))
})

test('presets, shares and the story slide', () => {
  assert.deepEqual(parsePresets('10, 1, x, 5, 5'), [10, 1, 5])
  assert.deepEqual(parsePresets(''), [1, 5, 10])
  assert.equal(sharesTaken(30, 4, 5000, 500), 10)
  assert.equal(sharesTaken(30, 12, 5000, 500), 12)
  assert.equal(sharesTaken(30, 0, 99999, 500), 30)
  assert.equal(storyIndex(0, 30, 15), 0)
  assert.equal(storyIndex(1, 30, 15), 1)
  assert.equal(storyIndex(30, 30, 15), 14)
  assert.equal(storyIndex(15, 30, 15), 7)
  assert.equal(storyIndex(5, 30, 1), 0)
})

test('names, phones, lines and totals', () => {
  assert.deepEqual(splitName('  Ahmet  Fatih Yılmaz '), { firstName: 'Ahmet Fatih', lastName: 'Yılmaz' })
  assert.deepEqual(splitName('Ayşe'), { firstName: 'Ayşe', lastName: '' })
  assert.ok(validPhone('0532 123 45 67') && validPhone('+90 532 123 4567') && !validPhone('212 123 45 67'))
  const line = cartLine({ id: 'c', donation_options: { mode: 'share', max_qty: 30 } }, 'c', 'Kuyu', 500, 3, { birim: 'hisse' }, ['Osmanlı Hayratı', ''])
  assert.equal(line.campaignTitle, 'Kuyu · Osmanlı Hayratı')
  assert.equal(line.locked, true)
  assert.equal(line.maxQuantity, 30)
  assert.equal(cartLine(undefined, 'c', 'Ekmek', 9, 50).locked, false)
  assert.equal(bundleTotal([{ unit: 9, qty: 50 }, { unit: 100, qty: 10 }, { unit: null, qty: 3 }]), 1450)
})
