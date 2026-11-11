import test from 'node:test'
import assert from 'node:assert/strict'
import { renderPage, renderRoute } from '../render.mjs'
import { pages } from '../catalog.mjs'
import { impactSections } from '../impact.mjs'

test('institution homepages share donation structure with distinct themes', () => {
  assert.match(renderPage('hicret','/hicret'),/ngo-education/)
  assert.match(renderPage('kardeslik','/kardeslik'),/ngo-aid/)
  assert.match(renderPage('platform','/preview'),/class="p-dashboard launch-console"/)
})

test('quick support offers only the current institution projects', () => {
  const hicret = renderPage('hicret','/hicret')
  const kardeslik = renderPage('kardeslik','/kardeslik')
  assert.match(hicret,/data-add-cart/)
  assert.match(hicret,/<option value="talebe">/)
  assert.doesNotMatch(hicret,/<option value="sofra">/)
  assert.match(kardeslik,/<option value="sofra">/)
  assert.doesNotMatch(kardeslik,/<option value="talebe">/)
  for (const page of [hicret,kardeslik]) {
    assert.match(page,/Faaliyetler ve duyurular/)
    assert.match(page,/Henüz yayımlanmış faaliyet haberi yok/)
  }
})

test('impact selection provides independent tenant-scoped donation forms', () => {
  for (const site of ['hicret','kardeslik']) {
    const html = impactSections(site,`/${site}`)
    assert.equal((html.match(/data-add-cart/g) || []).length,3)
    assert.equal((html.match(/data-add-status/g) || []).length,3)
    assert.match(html,/Gerçek ödeme alınmaz/)
    assert.ok(html.includes(`href="/${site}/sepet"`))
    assert.ok(html.includes(`href="/${site}/seffaflik"`))
  }
  assert.match(impactSections('hicret','/hicret'),/data-campaign="kitap"/)
  assert.doesNotMatch(impactSections('kardeslik','/kardeslik'),/data-campaign="kitap"/)
})
test('all published navigation destinations render for both institutions', () => {
  for (const site of ['hicret','kardeslik']) for (const path of ['kampanyalar','sepet','odeme','sss',...Object.keys(pages)]) {
    assert.ok(renderRoute(site,`/${site}`,`/${path}`,new URLSearchParams()),`${site}/${path}`)
  }
})
test('search escapes markup and campaign details cannot cross tenants', () => {
  const html = renderRoute('hicret','/hicret','/kampanyalar',new URLSearchParams({q:'<script>alert(1)</script>'}))
  assert.ok(!html.includes('<script>alert(1)'))
  assert.ok(html.includes('eşleşen proje bulunamadı'))
  assert.equal(renderRoute('hicret','/hicret','/kampanyalar/sofra',new URLSearchParams()),null)
  assert.ok(renderRoute('kardeslik','/kardeslik','/kampanyalar/sofra',new URLSearchParams()))
})
