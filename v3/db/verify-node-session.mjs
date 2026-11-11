// Dedicated disposable test database only. All records and roles roll back.
import pg from 'pg'
import assert from 'node:assert/strict'
import { sessionRepository } from '../session-repository.mjs'
import { sessionService, hashPassword } from '../auth.mjs'
import { randomBytes } from 'node:crypto'
import { loginService, credentialRepository } from '../login-service.mjs'
import { loginLimiter } from '../login-limiter.mjs'
import { donationRepository } from '../donation-repository.mjs'
import { authHttp } from '../auth-http.mjs'
import { adminHttp } from '../admin-http.mjs'
import { Readable } from 'node:stream'
const connectionString=process.env.V3_TEST_DATABASE_URL
if(!connectionString) throw new Error('V3_TEST_DATABASE_URL gereklidir')
const client=new pg.Client({connectionString})
await client.connect()
try {
 await client.query('BEGIN')
 const password=randomBytes(32).toString('hex')
 await client.query(`INSERT INTO einfak.staff(id,email,password_hash) VALUES
 ('30000000-0000-0000-0000-000000000001','node-test@example.invalid',$1)`,[await hashPassword(password)])
 const org='40000000-0000-0000-0000-000000000001'
 await client.query(`INSERT INTO einfak.organizations(id,slug,name,canonical_host) VALUES ($1,'node-test-org','Test kurum','node-test.invalid')`,[org])
 await client.query(`INSERT INTO einfak.memberships(organization_id,staff_id,role) VALUES ($1,'30000000-0000-0000-0000-000000000001','viewer')`,[org])
 // Synthetic fixtures only; this is not a real bank-verified donation.
 const donor=(await client.query(`INSERT INTO einfak.donors(organization_id,display_name) VALUES ($1,'Test bağışçı') RETURNING id`,[org])).rows[0].id
 const campaign=(await client.query(`INSERT INTO einfak.campaigns(organization_id,title) VALUES ($1,'Test eğitim desteği') RETURNING id`,[org])).rows[0].id
 const order=(await client.query(`INSERT INTO einfak.orders(organization_id,donor_id,amount_cents,idempotency_key,state) VALUES ($1,$2,12345,gen_random_uuid(),'paid') RETURNING id`,[org,donor])).rows[0].id
 const item=(await client.query(`INSERT INTO einfak.order_items(organization_id,order_id,campaign_id,campaign_title,amount_cents) VALUES ($1,$2,$3,'Test eğitim desteği',12345) RETURNING id`,[org,order,campaign])).rows[0].id
 const event=(await client.query(`INSERT INTO einfak.payment_events(organization_id,order_id,provider_event_id,amount_cents,verified_at) VALUES ($1,$2,'synthetic-test-event',12345,now()) RETURNING id`,[org,order])).rows[0].id
 await client.query(`INSERT INTO einfak.donations(organization_id,order_item_id,payment_event_id,order_id,receipt_number) VALUES ($1,$2,$3,$4,'TEST-ONLY-001')`,[org,item,event,order])
 const otherOrder=(await client.query(`INSERT INTO einfak.orders(organization_id,donor_id,amount_cents,idempotency_key) VALUES ($1,$2,12345,gen_random_uuid()) RETURNING id`,[org,donor])).rows[0].id
 const otherEvent=(await client.query(`INSERT INTO einfak.payment_events(organization_id,order_id,provider_event_id,amount_cents,verified_at) VALUES ($1,$2,'synthetic-wrong-order',12345,now()) RETURNING id`,[org,otherOrder])).rows[0].id
 await client.query('SAVEPOINT wrong_order_test')
 await assert.rejects(client.query(`UPDATE einfak.donations SET payment_event_id=$1 WHERE organization_id=$2 AND receipt_number='TEST-ONLY-001'`,[otherEvent,org]),{code:'23503'})
 await client.query('ROLLBACK TO SAVEPOINT wrong_order_test')
 await client.query('CREATE ROLE einfak_node_session_test NOLOGIN NOSUPERUSER NOBYPASSRLS')
 await client.query('GRANT einfak_v3_identity,einfak_v3_reader TO einfak_node_session_test')
 await client.query('GRANT USAGE ON SCHEMA einfak TO einfak_node_session_test')
 await client.query('GRANT SELECT ON einfak.staff,einfak.memberships,einfak.organizations TO einfak_node_session_test')
 await client.query('GRANT SELECT,INSERT,UPDATE ON einfak.staff_sessions TO einfak_node_session_test')
 await client.query('GRANT SELECT,INSERT,UPDATE ON einfak.login_limits TO einfak_node_session_test')
 await client.query('GRANT SELECT ON einfak.donations,einfak.order_items,einfak.orders TO einfak_node_session_test')
 await client.query('SET LOCAL ROLE einfak_node_session_test')
 // Map repository transactions to savepoints so fixtures always roll back.
 const query=(sql,args)=>client.query(['BEGIN READ ONLY','BEGIN'].includes(sql)?'SAVEPOINT repository_read':sql==='COMMIT'?'RELEASE SAVEPOINT repository_read':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT repository_read':sql,args)
 const pool={query,connect:async()=>({query,release(){}})}
 const sessions=sessionService(sessionRepository(pool))
 const limiter=loginLimiter(pool,{secret:randomBytes(32).toString('hex')})
 const login=await loginService({credentials:credentialRepository(pool),sessions,limiter})
 await assert.rejects(login.login({email:'node-test@example.invalid',password:'wrong-password',clientAddress:'127.0.0.1'}),{statusCode:401})
 const {token}=await login.login({email:'node-test@example.invalid',password,clientAddress:'127.0.0.1'})
 const principal=await sessions.resolve(token)
 assert.equal(principal.id,'30000000-0000-0000-0000-000000000001')
 assert.equal(principal.memberships[0].organizationId,org)
 const donations=donationRepository(pool)
 const rows=await donations.list(principal,org)
 assert.equal(rows.length,1)
 assert.equal(rows[0].amount_cents,'12345')
 assert.equal(rows[0].receipt_number,'TEST-ONLY-001')
 assert.equal(rows[0].campaign_title,'Test eğitim desteği')
 assert.equal(rows[0].payment_state,'paid')
 assert.equal(rows[0].phone,undefined)
 assert.deepEqual(await donations.list(principal,org,{limit:25,offset:25}),[])
 await assert.rejects(donations.list(principal,'40000000-0000-0000-0000-000000000002'),{statusCode:403})
 await sessions.revoke(token)
 assert.equal(await sessions.resolve(token),null)
 const origin='https://panel.example.invalid'
 const auth=authHttp({origin,login,sessions})
 const admin=adminHttp({origin,listDonations:async(t,id,pagination)=>{
  const user=await sessions.resolve(t)
  if(!user) throw Object.assign(new Error('Not authenticated'),{statusCode:401})
  return donations.list(user,id,pagination)
 }})
 async function request(handler,path,method,body={},cookie='') {
  const req=Readable.from([JSON.stringify(body)])
  Object.assign(req,{url:path,method,headers:{host:'panel.example.invalid',origin,'content-type':'application/json',cookie},socket:{remoteAddress:'127.0.0.1'}})
  const result={}
  await handler(req,{writeHead:(status,headers)=>Object.assign(result,{status,headers}),end:body=>{result.body=JSON.parse(body)}})
  return result
 }
 const response=await request(auth,'/auth/login','POST',{email:'node-test@example.invalid',password})
 assert.equal(response.status,200)
 assert.match(response.headers['Set-Cookie'],/Secure; HttpOnly/)
 const cookie=response.headers['Set-Cookie'].split(';')[0]
 const listed=await request(admin,`/api/admin/donations?organizationId=${org}`,'GET',{},cookie)
 assert.equal(listed.status,200)
 assert.equal(listed.body.donations[0].amount_cents,'12345')
 assert.equal((await request(admin,'/api/admin/donations?organizationId=40000000-0000-0000-0000-000000000002','GET',{},cookie)).status,403)
 assert.equal((await request(auth,'/auth/logout','POST',{},cookie)).status,200)
 assert.equal((await request(admin,`/api/admin/donations?organizationId=${org}`,'GET',{},cookie)).status,401)
 console.log('HTTP handler integration with real PostgreSQL: login cookie, donation response, tenant rejection and post-logout 401 passed. No network/TLS browser involved.')
 console.log('Real pg driver: password login, limiter, session, donation record and exact cents, pagination, cross-tenant denial and revocation passed.')
} finally {
 await client.query('ROLLBACK')
 await client.end()
}
