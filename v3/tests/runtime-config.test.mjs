import test from 'node:test'
import assert from 'node:assert/strict'
import { runtimeConfig } from '../runtime-config.mjs'
const env={V3_AUTH_DATABASE_URL:'postgres://auth@localhost/test',V3_DATA_DATABASE_URL:'postgres://data@localhost/test',V3_PANEL_ORIGIN:'https://localhost:3443',V3_LIMITER_SECRET:'x'.repeat(32),V3_TLS_KEY_PATH:'/test/key',V3_TLS_CERT_PATH:'/test/cert'}
test('runtime requires explicit configuration without insecure defaults',()=>{
 assert.equal(runtimeConfig(env).port,3443)
 for(const key of Object.keys(env)) assert.throws(()=>runtimeConfig({...env,[key]:''}))
 for(const change of [{V3_PANEL_ORIGIN:'http://localhost'},{V3_PANEL_PORT:'NaN'},{V3_LIMITER_SECRET:'short'},{V3_AUTH_DATABASE_URL:env.V3_DATA_DATABASE_URL}]) assert.throws(()=>runtimeConfig({...env,...change}))
})
