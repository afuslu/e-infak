import test from 'node:test'
import assert from 'node:assert/strict'
import { adminHttp } from '../admin-http.mjs'
const org='00000000-0000-0000-0000-000000000001',token='a'.repeat(43)
function fixture(error) {
 const calls=[]
 const handle=adminHttp({origin:'https://panel.example.org',listDonations:async(...args)=>{calls.push(args);if(error)throw error;return [{amount_cents:'12345'}]}})
 return {calls,async run(options={}) {
  const req={url:`/api/admin/donations?organizationId=${org}`,method:'GET',...options,headers:{host:'panel.example.org',cookie:`__Host-einfak_session=${token}`,...options.headers}}
  const result={};await handle(req,{writeHead:(status,headers)=>Object.assign(result,{status,headers}),end:body=>{result.body=JSON.parse(body)}});return result
 }}
}
test('authorized listing passes session and pagination without converting money',async()=>{
 const f=fixture(),r=await f.run()
 assert.equal(r.status,200);assert.equal(r.headers['Cache-Control'],'no-store')
 assert.deepEqual(f.calls[0],[token,org,{limit:25,offset:0}])
 assert.equal(r.body.donations[0].amount_cents,'12345')
})
test('invalid cookies, sources and pagination are rejected before service call',async()=>{
 const f=fixture()
 for(const [input,status] of [[{headers:{cookie:''}},401],[{headers:{cookie:`__Host-einfak_session=${token}; __Host-einfak_session=${token}`}},401],[{headers:{origin:'https://evil.test'}},403],[{method:'POST'},405],[{url:`/api/admin/donations?organizationId=${org}&limit=0`},400],[{url:`/api/admin/donations?organizationId=${org}&limit=2&limit=3`},400]]) assert.equal((await f.run(input)).status,status)
 assert.equal(f.calls.length,0)
})
test('authorization failures preserve status; internal errors remain private',async()=>{
 for(const status of [401,403,500]) {
  const r=await fixture(Object.assign(new Error('secret query'),{statusCode:status})).run()
  assert.equal(r.status,status===500?503:status)
  assert.ok(!JSON.stringify(r.body).includes('secret'))
 }
})
