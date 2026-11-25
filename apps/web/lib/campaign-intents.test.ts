import assert from 'node:assert/strict'
import test from 'node:test'
import { campaignIntents } from './campaign-intents'

test('campaign donation options win over the checkout fields', () => {
  const r = campaignIntents({ category: 'kurban', donation_options: { intents: ['Adak', 'Hayır'] }, checkout_fields_schema: [{ key: 'kurban_type', options: ['Vacip'] }] })
  assert.deepEqual(r, { options: ['Adak', 'Hayır'], initial: '', required: true })
})

test('a kurban campaign offers the standard list and preselects its own type', () => {
  const r = campaignIntents({ campaign_type: 'kurban', type_details: { kurban_type: 'akika' } })
  assert.equal(r?.initial, 'Akika')
  assert.equal(r?.required, false)
  assert.ok(r?.options.includes('Şifa'))
  assert.equal(campaignIntents({ category: 'adak' })?.initial, '')
})

test('other campaigns have no intention', () => {
  assert.equal(campaignIntents({ category: 'su', donation_options: {}, checkout_fields_schema: [] }), null)
  assert.equal(campaignIntents(undefined), null)
})
