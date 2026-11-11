import test from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword,verifyPassword,sessionService,tokenHash,sessionCookie } from '../auth.mjs'

test('password hashes are salted and verification fails closed',async () => {
 const password='sample-password-long-enough'
 const a=await hashPassword(password), b=await hashPassword(password)
 assert.notEqual(a,b)
 assert.equal(await verifyPassword(password,a),true)
 assert.equal(await verifyPassword('wrong',a),false)
 assert.equal(await verifyPassword(password,'scrypt-v1$broken'),false)
 await assert.rejects(hashPassword('short'))
 await assert.rejects(hashPassword('x'.repeat(1025)))
})

function fixture() {
 let time=100000, principal={id:'staff-1',kind:'staff',active:true,memberships:[]}
 const rows=new Map()
 const repository={
  principal:async () => principal,
  insert:async row => rows.set(row.tokenHash,row),
  find:async hash => rows.get(hash),
  revoke:async (hash,date) => {const row=rows.get(hash);if(row) row.revokedAt=date},
 }
 return {rows,service:sessionService(repository,{clock:()=>time,ttlMs:1000}),tick:()=>{time+=1000},disable:()=>{principal={...principal,active:false}},change:()=>{principal={...principal,memberships:[{organizationId:'hicret',role:'viewer',active:true}]}}}
}
test('session stores only hashed token and expires exactly at deadline',async () => {
 const f=fixture(),token=await f.service.create('staff-1')
 assert.equal(token.length,43)
 assert.equal(f.rows.has(token),false)
 assert.equal(f.rows.has(tokenHash(token)),true)
 assert.equal((await f.service.resolve(token)).id,'staff-1')
 assert.equal(await f.service.resolve('forged'),null)
 f.tick();assert.equal(await f.service.resolve(token),null)
})
test('logout and account disabling invalidate sessions; roles reload',async () => {
 const f=fixture(),token=await f.service.create('staff-1')
 f.change();assert.equal((await f.service.resolve(token)).memberships[0].role,'viewer')
 await f.service.revoke(token);assert.equal(await f.service.resolve(token),null)
 const second=await f.service.create('staff-1')
 f.disable();assert.equal(await f.service.resolve(second),null)
 await assert.rejects(f.service.create('staff-1'))
})
test('cookies are host-only, HTTPS-only and not available to scripts',() => {
 const cookie=sessionCookie('a'.repeat(43))
 for(const flag of ['__Host-','Secure','HttpOnly','SameSite=Lax','Path=/']) assert.ok(cookie.includes(flag))
 assert.ok(!cookie.includes('Domain='))
 assert.match(sessionCookie('',{clear:true}),/Max-Age=0/)
 assert.throws(()=>sessionCookie('bad; injected=true'))
})
