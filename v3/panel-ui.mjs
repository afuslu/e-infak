import { cookieToken } from './auth-http.mjs'
import { readFileSync } from 'node:fs'

const page=body=>`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>E‑İnfak çalışma alanı</title><link rel="stylesheet" href="/assets/site.css"><script type="module" src="/assets/panel-client.mjs"></script></head><body class="platform"><main class="wrap section"><a class="brand" href="/panel">e‑infak / çalışma alanı</a>${body}</main></body></html>`
export const activeLoginView=()=>page(`<section class="login-card"><h1>Personel girişi</h1><p>Yalnız kurum tarafından açılan personel hesapları kullanılabilir.</p><form data-login method="post" action="/auth/login"><label for="email">E-posta</label><input id="email" name="email" type="email" autocomplete="username" maxlength="254" required><label for="password">Parola</label><input id="password" name="password" type="password" autocomplete="current-password" required><button class="btn" type="submit">Giriş yap</button><p role="status" data-status></p></form><noscript>Giriş için JavaScript gereklidir.</noscript></section>`)
const panelView=()=>page(`<section class="section"><div class="section-head"><div><span class="eyebrow">KURUM YÖNETİMİ</span><h1>Bağışlar</h1></div><button class="btn outline" data-logout>Güvenli çıkış</button></div><label for="organization">Çalışacağınız kurum</label><select id="organization" data-organizations></select><p role="status" data-status>Yetkileriniz kontrol ediliyor…</p><div data-donations></div><div class="actions"><button class="btn outline" data-prev disabled>Önceki sayfa</button><button class="btn outline" data-next disabled>Sonraki sayfa</button></div><p class="muted">SMS, iade ve kampanya düzenleme bu ekranda henüz açık değildir.</p></section>`)

export function panelUi({origin,resolveSession}) {
 const host=new URL(origin).host
 const assets=new Map([['/assets/site.css',['text/css',readFileSync(new URL('./site.css',import.meta.url))]],['/assets/panel-client.mjs',['text/javascript',readFileSync(new URL('./panel-client.mjs',import.meta.url))]]])
 return async(req,res)=>{
  const path=req.url?.split('?')[0]
  if(!['/','/giris','/panel','/api/session',...assets.keys()].includes(path)) return false
  const send=(status,type,body)=>{res.writeHead(status,{'Content-Type':`${type}; charset=utf-8`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});res.end(body);return true}
  if(req.method!=='GET') return send(405,'text/plain','Yalnız GET kabul edilir.')
  if(req.headers.host!==host || req.headers['sec-fetch-site']==='cross-site' || (req.headers.origin && req.headers.origin!==origin)) return send(403,'text/plain','İstek kaynağı doğrulanamadı.')
  if(assets.has(path)) {const [type,body]=assets.get(path);return send(200,type,body)}
  if(path==='/' || path==='/giris') return send(200,'text/html',activeLoginView())
  const principal=await resolveSession(cookieToken(req.headers.cookie))
  if(!principal) {
   if(path==='/api/session') return send(401,'application/json',JSON.stringify({message:'Oturum açmanız gerekiyor.'}))
   res.writeHead(303,{Location:'/giris','Cache-Control':'no-store'});res.end();return true
  }
  if(path==='/api/session') return send(200,'application/json',JSON.stringify({memberships:principal.memberships.map(m=>({organizationId:m.organizationId,role:m.role,name:m.name || m.organizationId}))}))
  return send(200,'text/html',panelView())
 }
}
