import { requireAccess } from './access.mjs'

// pool is an injected PostgreSQL pool. Never supply a migration-owner or
// BYPASSRLS connection here. principal must originate from a verified session.
export function donationRepository(pool) {
  return {
    async list(principal, organizationId, {limit=25,offset=0}={}) {
      requireAccess(principal,organizationId,'donations.read')
      if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(organizationId)) throw new Error('Geçersiz kurum kimliği')
      if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new Error('Geçersiz sayfalama')
      const client = await pool.connect()
      let failed = false
      try {
        await client.query('BEGIN READ ONLY')
        await client.query("SELECT set_config('einfak.organization_id', $1, true)",[organizationId])
        const result = await client.query(`
          SELECT d.id, d.receipt_number, d.created_at,
                 i.campaign_title, i.amount_cents::text AS amount_cents,
                 o.currency, o.state AS payment_state
          FROM einfak.donations d
          JOIN einfak.order_items i ON i.organization_id=d.organization_id AND i.id=d.order_item_id
          JOIN einfak.orders o ON o.organization_id=i.organization_id AND o.id=i.order_id
          WHERE d.organization_id=$1
          ORDER BY d.created_at DESC, d.id DESC
          LIMIT $2 OFFSET $3`,[organizationId,limit,offset])
        await client.query('COMMIT')
        return result.rows
      } catch(error) {
        try { await client.query('ROLLBACK') } catch { failed = true }
        throw error
      } finally {
        // A connection whose rollback failed must be discarded, not pooled.
        client.release(failed)
      }
    },
  }
}
