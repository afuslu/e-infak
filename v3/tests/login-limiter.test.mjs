import test from 'node:test'
import assert from 'node:assert/strict'
import { loginLimiter } from '../login-limiter.mjs'
const config={secret:'s'.repeat(32),ipLimit:2,accountLimit:2}
const request={clientAddress:'127.0.0.1',accountKey:'a'.repeat(64)}
function fixture(attempts=1,fail=false) {
 const calls=[]
 const pool={connect:async()=>({query:async(sql,args)=>{
  calls.push([sql,args]);if(fail && args) throw new Error('offline')
  return {rows:[{attempts}]}
 },release:x=>calls.push(['release',x])})}
 return {calls,limiter:loginLimiter(pool,config)}
}
test('limiter binds opaque keys in deterministic order and commits allowed attempts',async()=>{
 const {limiter,calls}=fixture()
 assert.equal(await limiter.consume(request),true)
 const queries=calls.filter(x=>x[1]?.length===2)
 assert.equal(queries.length,2)
 const hashes=queries.map(x=>x[1][0])
 assert.deepEqual(hashes,[...hashes].sort())
 assert.ok(hashes.every(x=>/^[a-f0-9]{64}$/.test(x)))
 assert.ok(!JSON.stringify(calls).includes('127.0.0.1'))
 assert.equal(calls.at(-2)[0],'COMMIT')
})
test('denied attempts commit counters; invalid IP makes no queries',async()=>{
 const {limiter,calls}=fixture(3)
 assert.equal(await limiter.consume(request),false)
 assert.equal(calls.at(-2)[0],'COMMIT')
 const count=calls.length
 assert.equal(await limiter.consume({...request,clientAddress:'forged'}),false)
 assert.equal(calls.length,count)
})
test('IPv4 and mapped IPv6 share the same limits',async()=>{
 const one=fixture(),two=fixture()
 await one.limiter.consume(request)
 await two.limiter.consume({...request,clientAddress:'::ffff:127.0.0.1'})
 assert.deepEqual(one.calls,two.calls)
})
test('database failure rolls back and propagates; weak configuration rejected',async()=>{
 const {limiter,calls}=fixture(1,true)
 await assert.rejects(limiter.consume(request),/offline/)
 assert.equal(calls.at(-2)[0],'ROLLBACK')
 assert.throws(()=>loginLimiter({}, {secret:'short'}))
})
