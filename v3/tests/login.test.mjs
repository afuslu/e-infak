import test from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword } from '../auth.mjs'
import { loginService,credentialRepository } from '../login-service.mjs'

test('login normalizes email, checks limit first and returns no account details',async()=>{
 const calls=[],password='test-password-long'
 const passwordHash=await hashPassword(password)
 const service=await loginService({
  limiter:{consume:async keys=>{calls.push(['limit',keys]);return true}},
  credentials:{findByEmail:async email=>{calls.push(['lookup',email]);return {id:'one',active:true,passwordHash}}},
  sessions:{create:async id=>{calls.push(['session',id]);return 'token'}},
 })
 assert.deepEqual(await service.login({email:' TEST@EXAMPLE.ORG ',password,clientAddress:'127.0.0.1'}),{token:'token'})
 assert.equal(calls[0][0],'limit')
 assert.equal(calls[0][1].accountKey.length,64)
 assert.deepEqual(calls[1],['lookup','test@example.org'])
 assert.deepEqual(calls[2],['session','one'])
})
test('unknown and inactive accounts use same public rejection',async()=>{
 const passwordHash=await hashPassword('test-password-long')
 for(const account of [null,{active:false,passwordHash},{active:true,passwordHash:'broken'}]) {
  const service=await loginService({limiter:{consume:async()=>true},credentials:{findByEmail:async()=>account},sessions:{create:async()=>assert.fail('Must not issue session')}})
  await assert.rejects(service.login({email:'test@example.org',password:'test-password-long',clientAddress:'127.0.0.1'}),{statusCode:401,message:'E-posta veya parola hatalı.'})
 }
})
test('missing limiter, exhausted limit and limiter outage fail closed',async()=>{
 await assert.rejects(loginService({}),/zorunludur/)
 for(const consume of [async()=>false,async()=>{throw new Error('offline')}]) {
  const service=await loginService({limiter:{consume},credentials:{findByEmail:async()=>assert.fail('No lookup allowed')},sessions:{}})
  await assert.rejects(service.login({email:'test@example.org',password:'long-password',clientAddress:'127.0.0.1'}))
 }
})
test('credential lookup is parameterized',async()=>{
 let values
 const repo=credentialRepository({query:async(sql,args)=>{values=args;assert.ok(sql.includes('email=$1'));return {rows:[]}}})
 assert.equal(await repo.findByEmail("x' OR true --"),null)
 assert.deepEqual(values,["x' OR true --"])
})
