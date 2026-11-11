// Input principal must come from a verified server session, never request JSON.
const grants = Object.freeze({
  admin: ['donations.read','donors.read','campaigns.write','sms.send','staff.manage'],
  finance: ['donations.read','donors.read'],
  communications: ['donors.read','sms.send'],
  viewer: ['donations.read'],
})

export function authorize(principal, organizationId, permission) {
  if (!principal || principal.active !== true || principal.kind !== 'staff' || !principal.id) return false
  if (!Array.isArray(principal.memberships) || typeof organizationId !== 'string' || !organizationId) return false
  return principal.memberships.some(m => m.organizationId === organizationId && m.active === true &&
    Object.hasOwn(grants,m.role) && grants[m.role].includes(permission))
}

export function requireAccess(principal, organizationId, permission) {
  if (!authorize(principal,organizationId,permission)) {
    const error = new Error('Bu kurum veya işlem için yetkiniz yok.')
    error.statusCode = 403
    throw error
  }
}
