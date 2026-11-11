import test from 'node:test'
import assert from 'node:assert/strict'
import { panelUi } from '../panel-ui.mjs'
function fixture(principal=null){
 const handle=panelUi({origin:'https://panel.example.org',resolveSession:async()=>principal})
 return async(path,headers={})=>{
  const result={};await handle({url:path,method:'GET',headers:{host:'panel.example.org',...headers}},{writeHead:(status,h)=>Object.assign(result,{status,headers:h}),end:body=>{result.body=body}});return result
 }
}
test('panel page redirects unauthenticated users and session API returns 401',async()=>{
 const request=fixture()
 assert.equal((await request('/panel')).headers.Location,'/giris')
 assert.equal((await request('/api/session')).status,401)
 const login=await request('/giris');assert.match(login.body,/data-login/);assert.match(login.headers['Content-Security-Policy'],/connect-src 'self'/)
})
test('session response projects only membership display fields',async()=>{
 const request=fixture({id:'staff',passwordHash:'secret',memberships:[{organizationId:'org',name:'Hicret',role:'viewer',privateField:'secret'}]})
 const result=await request('/api/session')
 assert.deepEqual(JSON.parse(result.body),{memberships:[{organizationId:'org',name:'Hicret',role:'viewer'}]})
 assert.ok(!result.body.includes('secret'))
 assert.match((await request('/panel')).body,/data-organizations/)
 assert.equal((await request('/api/session',{origin:'https://evil.example'})).status,403)
})
