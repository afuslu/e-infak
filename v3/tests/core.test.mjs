import test from 'node:test'
import assert from 'node:assert/strict'
import { amountToCents, resolveSite, paymentTransition } from '../domain.mjs'
import { handler } from '../server.mjs'

test('production tenant is selected only by an exact known host', () => {
  assert.equal(resolveSite('kardeslikpayi.org', '/hicret', false), 'kardeslik')
  assert.equal(resolveSite('hicretdernegi.org.evil.test', '/', false), null)
  assert.equal(resolveSite('localhost', '/hicret', false), null)
  assert.equal(resolveSite('localhost:3100', '/hicret', true), 'hicret')
})

test('money is converted exactly and invalid amounts are rejected', () => {
  assert.equal(amountToCents('250,50'), 25050n)
  assert.equal(amountToCents('1.01'), 101n)
  for (const value of ['0', '-10', 'NaN', '1e5', '1.001', '1000001', '', null]) {
    assert.throws(() => amountToCents(value))
  }
})

test('late callbacks cannot undo refunds or downgrade a completed payment', () => {
  assert.equal(paymentTransition('refunded', 'verified_paid'), 'refunded')
  assert.equal(paymentTransition('partially_refunded', 'verified_paid'), 'partially_refunded')
  assert.throws(() => paymentTransition('paid', 'verified_failed'))
  assert.throws(() => paymentTransition('pending', 'full_refund'))
})

function request(url, method = 'GET', host = 'hicretdernegi.org') {
  const result = { headers: {} }
  handler({ url, method, headers: { host } }, {
    setHeader: (key, value) => { result.headers[key] = value },
    writeHead: (status, headers) => { result.status = status; Object.assign(result.headers, headers) },
    end: body => { result.body = body },
  })
  return result
}

test('each site renders its own identity and accessible mobile navigation', () => {
  for (const [host, name] of [['hicretdernegi.org', 'Hicret Derneği'], ['kardeslikpayi.org', 'Kardeşlik Payı'], ['e-infak.org', 'E‑İnfak']]) {
    const response = request('/', 'GET', host)
    assert.equal(response.status, 200)
    assert.ok(response.body.includes(name))
    assert.ok(response.body.includes('aria-label="Mobil menü"'))
    assert.ok(response.body.includes('Gerçek bağış ve ödeme kabul edilmez'))
  }
})

test('preview rejects payment writes and unknown tenants; amount output is escaped', () => {
  assert.equal(request('/bagis', 'POST').status, 405)
  assert.equal(request('/', 'GET', 'evil.test').status, 421)
  assert.equal(request('/bagis?amount=250%2C50').status, 200)
  assert.equal(request('/bagis?amount=%3Cscript%3E').status, 400)
  assert.equal(request('/not-found').status, 404)
})
