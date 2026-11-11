import test from 'node:test'
import assert from 'node:assert/strict'
import { addToCart, cartTotal, normalizeCart, parseCart, updateCartAmount } from '../cart.mjs'

test('basket respects tenant boundaries and totals cents exactly', () => {
  const cart = addToCart('hicret',[],'kitap','250,51')
  assert.equal(cartTotal('hicret',cart),25051n)
  assert.throws(() => addToCart('hicret',cart,'sofra','100'))
  assert.deepEqual(normalizeCart('kardeslik',cart),[])
  assert.equal(cart.length,1)
})
test('tampered storage cannot insert invalid amounts or unknown campaigns', () => {
  const rows = [{id:'kitap',cents:-1},{id:'kitap',cents:1.5},{id:'kitap',cents:Infinity},{id:'bad',cents:100},null,{id:'kitap',cents:101}]
  assert.deepEqual(normalizeCart('hicret',rows),[{id:'kitap',cents:101}])
  assert.throws(() => addToCart('hicret',[],'kitap','1e6'))
})

test('editing an amount is exact, immutable and validates its row', () => {
  const original = addToCart('hicret',[],'kitap','250')
  const changed = updateCartAmount('hicret',original,0,'123,45')
  assert.equal(cartTotal('hicret',changed),12345n)
  assert.equal(original[0].cents,25000)
  for (const index of [-1,1,0.5]) assert.throws(() => updateCartAmount('hicret',original,index,'100'))
  assert.throws(() => updateCartAmount('hicret',original,0,'0'))
})

test('corrupt storage recovers without blocking subsequent additions', () => {
  for (const raw of ['broken','null','{}',null]) assert.deepEqual(parseCart('hicret',raw),[])
  assert.equal(addToCart('hicret',parseCart('hicret','broken'),'kitap','100').length,1)
  assert.deepEqual(parseCart('kardeslik','[{"id":"kitap","cents":100}]'),[])
})
