import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { authHttp } from '../auth-http.mjs'
const token='a'.repeat(43)
function fixture(overrides={}) {
 const calls=[]
 const handler=authHttp({origin:'https://panel.example.org',login:{login:async data=>{calls.push(data);return {token}}},sessions:{revoke:async value=>calls.push(value)},...overrides})
 return {calls,async request({body='{}',path='/auth/login',method='POST',headers={}}={}) {
  const req=Readable.from([body]);Object.assign(req,{url:path,method,headers:{host:'panel.example.org',origin:'https://panel.example.org','content-type':'application/json',...headers},socket:{remoteAddress:'127.0.0.1'}})
  const result={}
  await handler(req,{writeHead:(status,h)=>Object.assign(result,{status,headers:h}),end:body=>{result.body=body}})
  return result
 }}
}
test('login uses transport IP and returns session only in secure cookie',async()=>{
 const f=fixture(),r=await f.request({body:JSON.stringify({email:'a',password:'secret',clientAddress:'fake'}),headers:{'x-forwarded-for':'forged'}})
 assert.equal(r.status,200);assert.equal(f.calls[0].clientAddress,'127.0.0.1')
 assert.ok(r.headers['Set-Cookie'].includes('HttpOnly'))
 assert.ok(!r.body.includes(token));assert.ok(!r.body.includes('secret'))
})
test('invalid methods, origins, bodies and types never call login',async()=>{
 const f=fixture()
 for(const [input,status] of [[{method:'GET'},405],[{headers:{origin:'https://evil.example'}},403],[{headers:{host:'evil.example'}},403],[{body:'broken'},400],[{body:'null'},400],[{body:'x'.repeat(4097)},413],[{headers:{'content-type':'text/plain'}},415]]) assert.equal((await f.request(input)).status,status)
 assert.equal(f.calls.length,0)
})
test('logout revokes stored session and expires cookie',async()=>{
 const f=fixture(),r=await f.request({path:'/auth/logout',headers:{cookie:`__Host-einfak_session=${token}`}})
 assert.equal(r.status,200);assert.deepEqual(f.calls,[token]);assert.match(r.headers['Set-Cookie'],/Max-Age=0/)
})
test('internal errors do not expose secrets',async()=>{
 const f=fixture({login:{login:async()=>{throw new Error('database-password-secret')}}})
 const r=await f.request();assert.equal(r.status,503);assert.ok(!r.body.includes('secret'))
 assert.throws(()=>authHttp({origin:'http://panel.example.org'}))
})
