import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import { resolveSite, amountToCents, escapeHtml } from './domain.mjs'
import { renderPage, renderRoute } from './render.mjs'
import { loginView } from './login-view.mjs'

const style = readFileSync(new URL('./site.css', import.meta.url))
const modules = new Map(['client.mjs','cart.mjs','catalog.mjs','domain.mjs'].map(name => [`/assets/${name}`,readFileSync(new URL(name,import.meta.url))]))
const media = new Map([
  ['/media/hicret-class', '../public/images/hicret/talebe 8.jpeg'],
  ['/media/hicret-book', '../public/images/hicret/talebe 10.jpeg'],
  ['/media/hicret-students', '../public/images/hicret/talebe 12.jpeg'],
].map(([url,file]) => [url,new URL(file,import.meta.url)]))

export function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
  const send = (status, type, body) => { res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` }); res.end(body) }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD')
    return send(405, 'text/plain', 'Bu önizlemede veri kaydı ve ödeme kapalıdır.')
  }
  const url = new URL(req.url, 'http://localhost')
  const site = resolveSite(req.headers.host, url.pathname, process.env.NODE_ENV !== 'production')
  if (!site) return send(421, 'text/plain', 'Tanınmayan alan adı')
  if (site === 'platform' && url.pathname === '/giris') return send(200,'text/html',loginView())
  if (url.pathname === '/assets/site.css') return send(200, 'text/css', process.env.NODE_ENV === 'production' ? style : readFileSync(new URL('./site.css', import.meta.url)))
  if (modules.has(url.pathname)) return send(200,'text/javascript',modules.get(url.pathname))
  if (media.has(url.pathname)) {
    try { const image = readFileSync(media.get(url.pathname)); res.writeHead(200,{'Content-Type':'image/jpeg'}); return res.end(image) }
    catch { return send(404,'text/plain','Görsel bulunamadı') }
  }
  if (url.pathname === '/health') return send(200, 'application/json', JSON.stringify({ status: 'ok', version: '0.1.0', payments: 'disabled' }))
  if (url.pathname === '/robots.txt') return send(200, 'text/plain', 'User-agent: *\nDisallow: /\n')
  const local = ['localhost', '127.0.0.1'].includes((req.headers.host || '').split(':')[0]) && process.env.NODE_ENV !== 'production'
  const base = local && site !== 'platform' ? `/${site}` : ''
  const route = renderRoute(site,base,base ? url.pathname.slice(base.length) : url.pathname,url.searchParams)
  if (route) return send(200,'text/html',route)
  if (site !== 'platform' && url.pathname === `${base}/bagis`) {
    try {
      const cents = amountToCents(url.searchParams.get('amount'))
      return send(200, 'text/html', `<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Destek tutarı</title><link rel="stylesheet" href="/assets/site.css"><body style="--accent:#20594a"><main class="wrap section"><span class="eyebrow">GELİŞTİRME ÖNİZLEMESİ</span><h1>Tutarınız hazır.</h1><p>${escapeHtml((Number(cents) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 }))} TL destek tutarını seçtiniz.</p><p>Henüz ödeme alınmıyor. Aktif kampanyalar ve banka entegrasyonu tamamlandığında bağış yapılabilecek.</p><a class="button" href="${base || '/'}">Ana sayfaya dön</a></main></body></html>`)
    } catch {
      return send(400, 'text/plain', 'Lütfen 1–1.000.000 TL aralığında geçerli bir tutar girin. Örnek: 250,50')
    }
  }
  if (![base || '/', `${base}/`, ...(local && site === 'platform' ? ['/preview'] : [])].includes(url.pathname)) return send(404, 'text/plain', 'Sayfa bulunamadı')
  return send(200, 'text/html', renderPage(site, local && site === 'platform' ? '/preview' : base))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer(handler).listen(Number(process.env.PORT || 3100), '127.0.0.1', () => {
    console.log('E-İnfak V3: http://localhost:3100 — /hicret — /kardeslik')
  })
}
