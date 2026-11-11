import { cookieToken } from './auth-http.mjs'

export function adminHttp({origin,listDonations}) {
  const base=new URL(origin)
  if(base.protocol!=='https:' || base.origin!==origin) throw new Error('Sabit HTTPS origin gereklidir.')
  return async(req,res)=>{
    if(req.url?.split('?')[0]!=='/api/admin/donations') return false
    const send=(status,body,headers={})=>{
      res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers})
      res.end(JSON.stringify(body));return true
    }
    if(req.method!=='GET') return send(405,{message:'Yalnız GET kabul edilir.'},{Allow:'GET'})
    if(req.headers.host!==base.host || (req.headers.origin && req.headers.origin!==origin) || req.headers['sec-fetch-site']==='cross-site') return send(403,{message:'İstek kaynağı doğrulanamadı.'})
    const token=cookieToken(req.headers.cookie)
    if(!token) return send(401,{message:'Oturum açmanız gerekiyor.'})
    const params=new URL(req.url,origin).searchParams
    const org=params.get('organizationId')
    const limit=params.get('limit') ?? '25',offset=params.get('offset') ?? '0'
    const validKeys=['organizationId','limit','offset']
    if([...params.keys()].some(k=>!validKeys.includes(k) || params.getAll(k).length!==1) || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(org || '') || !/^\d{1,3}$/.test(limit) || !/^\d{1,6}$/.test(offset) || +limit<1 || +limit>100 || +offset>100000) return send(400,{message:'Geçersiz kurum veya sayfalama bilgisi.'})
    try {
      const rows=await listDonations(token,org,{limit:+limit,offset:+offset})
      return send(200,{donations:rows,limit:+limit,offset:+offset})
    } catch(error) {
      if(error.statusCode===401) return send(401,{message:'Oturum açmanız gerekiyor.'})
      if(error.statusCode===403) return send(403,{message:'Bu kuruma erişim yetkiniz yok.'})
      return send(503,{message:'Bağış listesi şu anda kullanılamıyor.'})
    }
  }
}
