import test from 'node:test'
import assert from 'node:assert/strict'
import { createApplication } from '../application.mjs'
const settings={origin:'https://panel.example.org',limiterSecret:'s'.repeat(32)}
const pool=(name,extra={})=>({query:async()=>({rows:[{name,rolsuper:false,rolbypassrls:false,owns_schema_tables:false,...extra}]})})
test('application refuses shared pools, shared roles and elevated DB roles',async()=>{
 const shared=pool('same')
 await assert.rejects(createApplication({...settings,authPool:shared,dataPool:shared}),/Ayrı/)
 await assert.rejects(createApplication({...settings,authPool:pool('same'),dataPool:pool('same')}),/farklı/)
 for(const extra of [{rolsuper:true},{rolbypassrls:true},{owns_schema_tables:true}]) {
  await assert.rejects(createApplication({...settings,authPool:pool('auth',extra),dataPool:pool('data')}),/fazla yetkili/)
 }
})
test('application validates configuration and rejects anonymous donation access',async()=>{
 const config={...settings,authPool:pool('auth'),dataPool:pool('data')}
 await assert.rejects(createApplication({...config,origin:'http://panel.example.org'}),/HTTPS/)
 await assert.rejects(createApplication({...config,limiterSecret:'short'}),/32 bayt/)
 const app=await createApplication(config)
 assert.equal(typeof app.handleAuth,'function')
 await assert.rejects(app.listDonations('invalid-token','any'),{statusCode:401})
})
