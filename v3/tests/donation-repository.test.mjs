import test from 'node:test'
import assert from 'node:assert/strict'
import { donationRepository } from '../donation-repository.mjs'
const org='00000000-0000-0000-0000-000000000001'
const principal={id:'staff',kind:'staff',active:true,memberships:[{organizationId:org,role:'viewer',active:true}]}
function fixture({queryFails=false,rollbackFails=false}={}) {
 const calls=[]
 const pool={connect:async()=>{
  calls.push(['connect'])
  return {query:async(sql,args)=>{
   calls.push([sql,args])
   if(queryFails && sql.includes('FROM einfak.donations')) throw new Error('query failed')
   if(rollbackFails && sql==='ROLLBACK') throw new Error('rollback failed')
   return {rows:[{amount_cents:'12345'}]}
  },release:destroy=>calls.push(['release',destroy])}
 }}
 return {calls,repo:donationRepository(pool)}
}
test('denied access and invalid pagination never obtain database connections',async()=>{
 const {calls,repo}=fixture()
 await assert.rejects(repo.list(null,org),{statusCode:403})
 await assert.rejects(repo.list(principal,'00000000-0000-0000-0000-000000000002'),{statusCode:403})
 await assert.rejects(repo.list(principal,org,{limit:101}))
 await assert.rejects(repo.list(principal,org,{offset:-1}))
 assert.equal(calls.length,0)
})
test('read transaction binds tenant and pagination as parameters without donor PII',async()=>{
 const {calls,repo}=fixture()
 assert.deepEqual(await repo.list(principal,org),[{amount_cents:'12345'}])
 assert.equal(calls[1][0],'BEGIN READ ONLY')
 assert.deepEqual(calls[2][1],[org])
 assert.deepEqual(calls[3][1],[org,25,0])
 assert.ok(!calls[3][0].includes('phone'))
 assert.equal(calls[4][0],'COMMIT')
 assert.deepEqual(calls.at(-1),['release',false])
})
test('query failure rolls back; broken transactions discard the connection',async()=>{
 for(const rollbackFails of [false,true]) {
  const {calls,repo}=fixture({queryFails:true,rollbackFails})
  await assert.rejects(repo.list(principal,org),/query failed/)
  assert.equal(calls.at(-2)[0],'ROLLBACK')
  assert.deepEqual(calls.at(-1),['release',rollbackFails])
 }
})
