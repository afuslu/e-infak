import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'

// Dedicated authentication pool; never expose keys, raw IPs or email in logs.
// Rolling fixed-duration buckets start at first attempt, using database time.
export function loginLimiter(pool,{secret,ipLimit=30,accountLimit=10,windowSeconds=900}={}) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret)<32) throw new Error('Limit anahtarı en az 32 bayt olmalıdır.')
  for (const value of [ipLimit,accountLimit,windowSeconds]) if (!Number.isSafeInteger(value) || value < 1 || value > 86400) throw new Error('Geçersiz limit ayarı')
  const digest=value=>createHmac('sha256',secret).update(value).digest('hex')
  return {
    async consume({clientAddress,accountKey}) {
      if (!isIP(clientAddress) || !/^[a-f0-9]{64}$/.test(accountKey)) return false
      // URL normalizes equivalent IPv6 spellings; map IPv4-mapped IPv6 to IPv4.
      let address = isIP(clientAddress)===6 ? new URL(`http://[${clientAddress}]/`).hostname.slice(1,-1) : clientAddress
      const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(address)
      if(mapped) { const a=parseInt(mapped[1],16),b=parseInt(mapped[2],16); address=[a>>8,a&255,b>>8,b&255].join('.') }
      const keys=[{hash:digest(`ip:${address}`),limit:ipLimit},{hash:digest(`account:${accountKey}`),limit:accountLimit}].sort((a,b)=>a.hash.localeCompare(b.hash))
      const client=await pool.connect()
      let discard=false
      try {
        await client.query('BEGIN')
        // Stable key ordering avoids opposite-order row-lock deadlocks.
        let allowed=true
        for(const key of keys) {
          const {rows}=await client.query(`INSERT INTO einfak.login_limits(key_hash,attempts,expires_at)
            VALUES ($1,1,clock_timestamp()+make_interval(secs => $2::int))
            ON CONFLICT (key_hash) DO UPDATE SET
              attempts=CASE WHEN einfak.login_limits.expires_at<=clock_timestamp() THEN 1
                ELSE LEAST(einfak.login_limits.attempts+1,1000000) END,
              expires_at=CASE WHEN einfak.login_limits.expires_at<=clock_timestamp()
                THEN clock_timestamp()+make_interval(secs => $2::int) ELSE einfak.login_limits.expires_at END
            RETURNING attempts`,[key.hash,windowSeconds])
          if (!Number.isInteger(rows[0]?.attempts) || rows[0].attempts>key.limit) allowed=false
        }
        // Denied attempts still count in both buckets.
        await client.query('COMMIT')
        return allowed
      } catch(error) {
        try { await client.query('ROLLBACK') } catch { discard=true }
        throw error
      } finally { client.release(discard) }
    },
  }
}
