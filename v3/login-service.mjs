import { randomBytes, createHash } from 'node:crypto'
import { hashPassword, verifyPassword } from './auth.mjs'

const failure = () => Object.assign(new Error('E-posta veya parola hatalı.'),{statusCode:401})
// limiter.consume must atomically enforce both IP and account limits in shared
// storage. clientAddress comes from the trusted server, not request form fields.
export async function loginService({credentials,sessions,limiter}) {
  if (typeof limiter?.consume !== 'function') throw new Error('Giriş hız sınırı zorunludur.')
  const dummyHash = await hashPassword(randomBytes(32).toString('hex'))
  return {
    async login({email,password,clientAddress}) {
      if (typeof clientAddress !== 'string' || !clientAddress || clientAddress.length > 128) throw failure()
      const normalized = typeof email === 'string' ? email.trim().toLowerCase() : ''
      const accountKey = createHash('sha256').update(normalized.slice(0,255)).digest('hex')
      const allowed = await limiter.consume({clientAddress,accountKey})
      if (allowed !== true) throw Object.assign(new Error('Çok fazla giriş denemesi. Lütfen daha sonra tekrar deneyin.'),{statusCode:429})
      if (!normalized || normalized.length > 254 || !normalized.includes('@') || typeof password !== 'string' || Buffer.byteLength(password) > 1024) throw failure()
      const account = await credentials.findByEmail(normalized)
      const encoded = account?.passwordHash
      const usable = typeof encoded === 'string' && /^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(encoded)
      // Unknown, disabled and damaged accounts still incur password hash work.
      const valid = await verifyPassword(password,usable ? encoded : dummyHash)
      if (!valid || !usable || account?.active !== true) throw failure()
      const token = await sessions.create(account.id)
      return {token}
    },
  }
}

export function credentialRepository(pool) {
  return {
    async findByEmail(email) {
      const {rows} = await pool.query('SELECT id, active, password_hash AS "passwordHash" FROM einfak.staff WHERE email=$1',[email])
      return rows[0] || null
    },
  }
}
