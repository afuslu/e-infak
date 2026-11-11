// Dedicated authentication pool only, never exposed to public route handlers.
export function sessionRepository(pool) {
  return {
    async insert({tokenHash,staffId,expiresAt}) {
      await pool.query(`INSERT INTO einfak.staff_sessions(token_hash,staff_id,expires_at)
        VALUES ($1,$2,$3)`,[tokenHash,staffId,expiresAt])
    },
    async find(hash) {
      const {rows} = await pool.query(`SELECT staff_id AS "staffId", expires_at AS "expiresAt",
        revoked_at AS "revokedAt" FROM einfak.staff_sessions WHERE token_hash=$1`,[hash])
      return rows[0] || null
    },
    async revoke(hash,date) {
      await pool.query(`UPDATE einfak.staff_sessions SET revoked_at=COALESCE(revoked_at,$2)
        WHERE token_hash=$1`,[hash,date])
    },
    async principal(staffId) {
      const client = await pool.connect()
      let discard = false
      try {
        await client.query('BEGIN READ ONLY')
        // Clear tenant context; identity is derived from a stored session, not a header.
        await client.query("SELECT set_config('einfak.organization_id', '', true), set_config('einfak.staff_id', $1, true)",[staffId])
        const {rows} = await client.query(`SELECT s.id, s.active,
          COALESCE(jsonb_agg(jsonb_build_object('organizationId',m.organization_id,
          'role',m.role,'name',o.name,'active',true)) FILTER (WHERE o.id IS NOT NULL), '[]'::jsonb) AS memberships
          FROM einfak.staff s
          LEFT JOIN einfak.memberships m ON m.staff_id=s.id AND m.active=true
          LEFT JOIN einfak.organizations o ON o.id=m.organization_id AND o.active=true
          WHERE s.id=$1 GROUP BY s.id`,[staffId])
        await client.query('COMMIT')
        return rows[0] ? {...rows[0],kind:'staff'} : null
      } catch(error) {
        try { await client.query('ROLLBACK') } catch { discard=true }
        throw error
      } finally { client.release(discard) }
    },
  }
}
