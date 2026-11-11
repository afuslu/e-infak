import test from 'node:test'
import assert from 'node:assert/strict'
import { sessionRepository } from '../session-repository.mjs'
function fixture(fail=false) {
 const calls=[]
 const query=async(sql,args)=>{
  calls.push([sql,args])
  if(sql.includes('FROM einfak.staff s')) {
   if(fail) throw new Error('database unavailable')
   return {rows:[{id:'staff',active:true,memberships:[]}]}
  }
  return {rows:[]}
 }
 return {calls,repo:sessionRepository({query,connect:async()=>({query,release:x=>calls.push(['release',x])})})}
}
test('session persistence binds inputs and missing tokens return null',async()=>{
 const {repo,calls}=fixture()
 await repo.insert({tokenHash:'hash',staffId:'staff',expiresAt:new Date(1000)})
 assert.deepEqual(calls[0][1],['hash','staff',new Date(1000)])
 assert.equal(await repo.find('missing'),null)
 await repo.revoke('hash',new Date(2000))
 assert.ok(calls.at(-1)[0].includes('COALESCE'))
 assert.deepEqual(calls.at(-1)[1],['hash',new Date(2000)])
})
test('principal lookup clears tenant context and includes only active memberships and organizations',async()=>{
 const {repo,calls}=fixture()
 assert.deepEqual(await repo.principal('staff'),{id:'staff',kind:'staff',active:true,memberships:[]})
 assert.equal(calls[0][0],'BEGIN READ ONLY')
 assert.match(calls[1][0],/organization_id', '', true/)
 assert.deepEqual(calls[1][1],['staff'])
 assert.match(calls[2][0],/m.active=true/)
 assert.match(calls[2][0],/o.active=true/)
 assert.equal(calls[3][0],'COMMIT')
 assert.deepEqual(calls[4],['release',false])
})
test('failed principal query rolls back before releasing connection',async()=>{
 const {repo,calls}=fixture(true)
 await assert.rejects(repo.principal('staff'),/database unavailable/)
 assert.equal(calls.at(-2)[0],'ROLLBACK')
 assert.deepEqual(calls.at(-1),['release',false])
})
