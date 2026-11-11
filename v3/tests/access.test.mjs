import test from 'node:test'
import assert from 'node:assert/strict'
import { authorize, requireAccess } from '../access.mjs'

const principal = (role,extra={}) => ({id:'staff-1',kind:'staff',active:true,memberships:[{organizationId:'hicret',role,active:true}],...extra})
test('staff grants are scoped to an active membership',() => {
 assert.equal(authorize(principal('admin'),'hicret','sms.send'),true)
 assert.equal(authorize(principal('admin'),'kardeslik','sms.send'),false)
 assert.equal(authorize(principal('admin',{active:false}),'hicret','sms.send'),false)
 assert.equal(authorize(principal('admin',{kind:'donor'}),'hicret','sms.send'),false)
 assert.equal(authorize(principal('admin',{memberships:[{organizationId:'hicret',role:'admin',active:false}]}),'hicret','sms.send'),false)
})
test('finance and viewer cannot send SMS or manage staff',() => {
 for (const role of ['finance','viewer']) {
  assert.equal(authorize(principal(role),'hicret','donations.read'),true)
  assert.throws(() => requireAccess(principal(role),'hicret','sms.send'),{statusCode:403})
  assert.equal(authorize(principal(role),'hicret','staff.manage'),false)
 }
 for (const role of ['unknown','constructor','__proto__']) assert.equal(authorize(principal(role),'hicret','sms.send'),false)
 assert.equal(authorize(null,'hicret','sms.send'),false)
})
