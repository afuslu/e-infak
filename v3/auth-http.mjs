import { sessionCookie, tokenHash } from './auth.mjs'

export function cookieToken(header='') {
  const values=header.split(';').map(x=>x.trim()).filter(x=>x.startsWith('__Host-einfak_session='))
  if(values.length!==1) return null
  const token=values[0].slice('__Host-einfak_session='.length)
  return tokenHash(token) ? token : null
}

// Mount on a dedicated HTTPS authentication server, not the preview server.
// Pass the trusted transport address; forwarded headers are deliberately ignored.
export function authHttp({origin,login,sessions}) {
  const url=new URL(origin)
  if(url.protocol!=='https:' || url.origin!==origin) throw new Error('Sabit HTTPS origin gereklidir.')
  return async function handle(req,res) {
    const path=req.url?.split('?')[0]
    if(!['/auth/login','/auth/logout'].includes(path)) return false
    const send=(status,message,headers={})=>{
      res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers})
      res.end(JSON.stringify({message}))
      return true
    }
    if(req.method!=='POST') return send(405,'Yalnız POST kabul edilir.',{Allow:'POST'})
    if(req.headers.host!==url.host || req.headers.origin!==origin || req.headers['sec-fetch-site']==='cross-site') return send(403,'İstek kaynağı doğrulanamadı.')
    try {
      if(path==='/auth/logout') {
        const token=cookieToken(req.headers.cookie)
        if(token) await sessions.revoke(token)
        return send(200,'Oturum kapatıldı.',{'Set-Cookie':sessionCookie('',{clear:true})})
      }
      if(req.headers['content-type']?.split(';')[0].trim()!=='application/json') return send(415,'JSON içerik gereklidir.')
      const chunks=[];let size=0
      for await(const chunk of req) {
        const buffer=Buffer.from(chunk);size+=buffer.length
        if(size>4096) return send(413,'İstek çok büyük.')
        chunks.push(buffer)
      }
      let data
      try {data=JSON.parse(Buffer.concat(chunks).toString('utf8'))} catch {return send(400,'Geçersiz istek.')}
      if(!data || Array.isArray(data) || typeof data!=='object') return send(400,'Geçersiz istek.')
      const {token}=await login.login({email:data.email,password:data.password,clientAddress:req.socket.remoteAddress})
      // Never return bearer credentials in JSON or reflect request parameters.
      return send(200,'Giriş başarılı.',{'Set-Cookie':sessionCookie(token)})
    } catch(error) {
      if(error.statusCode===401) return send(401,'E-posta veya parola hatalı.')
      if(error.statusCode===429) return send(429,'Çok fazla deneme. Lütfen daha sonra tekrar deneyin.')
      return send(503,'Giriş hizmeti şu anda kullanılamıyor.')
    }
  }
}
