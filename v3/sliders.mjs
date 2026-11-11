import { escapeHtml as e } from './domain.mjs'
import { campaigns } from './catalog.mjs'

export function featuredSlides(site,base) {
  const ids = site === 'hicret' ? ['hafizlik','talebe','kuran','medrese'] : ['sofra','su','yetim','acil']
  return `<section class="wrap section" data-slider aria-label="Öne çıkan bağışlar"><div class="section-head"><div><span class="eyebrow">İYİLİĞİN FARKLI YOLLARI</span><h2>Bugün bir hayra vesile olun.</h2></div><div class="slider-controls"><button type="button" data-prev aria-label="Önceki bağış">←</button><span data-position role="status">1 / ${ids.length}</span><button type="button" data-next aria-label="Sonraki bağış">→</button></div></div><div class="feature-track" data-track tabindex="0" aria-label="Kaydırılabilir bağış projeleri">${ids.map((id,i) => {
    const c = campaigns.find(c => c.site === site && c.id === id)
    return `<article class="feature-slide tone-${i}" data-slide><div><span class="demo">ÖRNEK PROJE · ${e(c.category)}</span><h3>${e(c.title)}</h3><p>${e(c.summary)}</p><a class="btn" href="${base}/kampanyalar/${id}">Bağış yap →</a></div><span class="feature-symbol" aria-hidden="true">${c.icon}</span></article>`
  }).join('')}</div><p class="inline-note">Kartları kaydırın veya yön düğmelerini kullanın. Gerçek ödeme kabul edilmez.</p></section>`
}
