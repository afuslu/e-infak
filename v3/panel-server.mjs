import { createServer } from 'node:https'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { runtimeConfig } from './runtime-config.mjs'
import { createApplication } from './application.mjs'

export async function startPanel(env=process.env) {
  const config=runtimeConfig(env)
  let Pool
  try { ({Pool}=await import('pg')) } catch { throw new Error('PostgreSQL sürücüsü eksik: v3 içinde pg kurulumu gerekli.') }
  const tls={key:readFileSync(config.keyPath),cert:readFileSync(config.certPath)}
  const options={max:5,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:5000}
  const authPool=new Pool({...options,connectionString:config.authUrl})
  const dataPool=new Pool({...options,connectionString:config.dataUrl})
  // Do not log connection strings or provider error details.
  for(const pool of [authPool,dataPool]) pool.on('error',()=>console.error('Panel veritabanı bağlantı hatası.'))
  let server
  try {
    const app=await createApplication({authPool,dataPool,origin:config.origin,limiterSecret:config.secret})
    server=createServer(tls,async(req,res)=>{
      try {
        if(await app.handleAuth(req,res)) return
        if(await app.handleAdmin(req,res)) return
        if(await app.handleUi(req,res)) return
        res.writeHead(404,{'Content-Type':'application/json','Cache-Control':'no-store'})
        res.end(JSON.stringify({message:'Uç nokta bulunamadı.'}))
      } catch {
        if(res.headersSent) {res.destroy();return}
        res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'})
        res.end(JSON.stringify({message:'Hizmet şu anda kullanılamıyor.'}))
      }
    })
    server.requestTimeout=15000;server.headersTimeout=10000;server.timeout=15000
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,'127.0.0.1',resolve)})
    return {server,async close(){await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await Promise.all([authPool.end(),dataPool.end()])}}
  } catch(error) {await Promise.all([authPool.end(),dataPool.end()]);throw error}
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  startPanel().then(runtime=>{
    console.log('Panel API yalnız loopback üzerinde HTTPS ile başlatıldı.')
    const stop=()=>runtime.close().catch(()=>{process.exitCode=1})
    process.once('SIGINT',stop);process.once('SIGTERM',stop)
  }).catch(()=>{console.error('Panel başlatılamadı. Yapılandırma, sürücü, sertifika ve veritabanı rollerini kontrol edin.');process.exitCode=1})
}
