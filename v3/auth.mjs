import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'
const scrypt = promisify(scryptCallback)
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const validPassword = value => typeof value === 'string' && Buffer.byteLength(value) <= 1024

export async function hashPassword(password) {
  if (!validPassword(password) || password.length < 12) throw new Error('Parola en az 12 karakter, en fazla 1024 bayt olmalıdır.')
  const salt = randomBytes(16)
  const hash = await scrypt(password,salt,32,options)
  return `scrypt-v1$${salt.toString('hex')}$${hash.toString('hex')}`
}

export async function verifyPassword(password,encoded) {
  if (!validPassword(password) || typeof encoded !== 'string') return false
  const match = /^scrypt-v1\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(encoded)
  if (!match) return false
  const actual = await scrypt(password,Buffer.from(match[1],'hex'),32,options)
  return timingSafeEqual(actual,Buffer.from(match[2],'hex'))
}

export function tokenHash(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  return createHash('sha256').update(token).digest('hex')
}

// Repository must be private server-side storage; membership is loaded afresh
// on every resolution so role changes take effect without waiting for expiry.
export function sessionService(repository,{clock=Date.now,ttlMs=8*60*60*1000}={}) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 86400000) throw new Error('Geçersiz oturum süresi')
  return {
    async create(staffId) {
      const principal = await repository.principal(staffId)
      if (!principal || principal.active !== true || principal.kind !== 'staff') throw new Error('Hesap kullanılamıyor')
      const token = randomBytes(32).toString('base64url')
      await repository.insert({tokenHash:tokenHash(token),staffId,expiresAt:new Date(clock()+ttlMs)})
      return token
    },
    async resolve(token) {
      const hash = tokenHash(token)
      if (!hash) return null
      const session = await repository.find(hash)
      if (!session || session.revokedAt || !Number.isFinite(new Date(session.expiresAt).getTime()) || new Date(session.expiresAt).getTime() <= clock()) return null
      const principal = await repository.principal(session.staffId)
      return principal?.active === true && principal.kind === 'staff' ? principal : null
    },
    async revoke(token) {
      const hash = tokenHash(token)
      if (hash) await repository.revoke(hash,new Date(clock()))
    },
  }
}

export function sessionCookie(token,{clear=false}={}) {
  if (!clear && !tokenHash(token)) throw new Error('Geçersiz oturum anahtarı')
  return `__Host-einfak_session=${clear ? '' : token}; Path=/; Secure; HttpOnly; SameSite=Lax${clear ? '; Max-Age=0' : ''}`
}
