import { organizations, escapeHtml as e } from './domain.mjs'
import { campaigns, campaignFor, pages } from './catalog.mjs'
import { ngoHome } from './ngo-home.mjs'
import { platformHome as modernPlatformHome } from './platform-home.mjs'

const money = value => Number(value).toLocaleString('tr-TR') + ' TL'
const sampleNote = '<p class="inline-note">Örnek projeler gösterilmektedir. Kampanyalar henüz bağışa açık değildir.</p>'

function header(site, base) {
  const org = organizations[site]
  const links = org ? `<a href="${base}/kampanyalar">Kampanyalar</a><a href="${base}/${site === 'hicret' ? 'egitim' : 'faaliyetler'}">${site === 'hicret' ? 'Eğitim' : 'Faaliyetler'}</a><a href="${base}/hakkimizda">Kurumsal</a><a href="${base}/iletisim">İletişim</a><a href="${base}/sepet">Sepet <span data-cart-count>0</span></a><a class="btn" href="${base}/kampanyalar">Bağış yap ↗</a>` : '<a href="#cozumler">Platform</a><a href="#kurumlar">Kurumlarımız</a><a href="#yaklasim">Yaklaşımımız</a><a class="btn" href="/giris">Personel girişi ↗</a>'
  return `<a class="skip" href="#main">İçeriğe geç</a><div class="notice">V3 geliştirme önizlemesi · Gerçek bağış ve ödeme kabul edilmez.</div>${org ? `<div class="utility"><div class="wrap"><span>${site === 'hicret' ? 'İlim, emek ve dayanışma.' : 'İyiliğin bir parçası olun.'}</span><div class="utility-links"><a href="${base}/banka-hesaplari">Banka hesapları</a><a href="${base}/gonullu">Gönüllü olun</a><a href="${base}/seffaflik">Şeffaflık</a></div></div></div>` : ''}<header class="header"><div class="wrap header-inner"><a class="brand" href="${base || '/'}"><span class="brand-mark">${org?.mark || 'e'}</span><span>${e(org?.name || 'E‑İnfak')}<small>${site === 'hicret' ? 'İLİMLE YETİŞEN NESİLLER' : site === 'kardeslik' ? 'İYİLİKTE SİZİN DE PAYINIZ OLSUN' : 'İYİLİĞİN DİJİTAL ALTYAPISI'}</small></span></a><nav class="nav" aria-label="Ana menü">${links}</nav><details class="mobile"><summary>Menü ☰</summary><nav aria-label="Mobil menü">${links}</nav></details></div></header>`
}

function footer(site, base) {
  const org = organizations[site]
  if (!org) return '<footer class="footer"><div class="wrap footer-bottom"><span>E‑İnfak · İyiliğin dijital altyapısı.</span><span>Yeni platform geliştirme aşamasında.</span><a href="#main">Başa dön ↑</a></div></footer>'
  const groups = [['DESTEK OLUN', [['Tüm kampanyalar','kampanyalar'],['Banka hesapları','banka-hesaplari'],['Bağış sepeti','sepet'],['Gönüllülük','gonullu']]],['KURUMSAL',[['Hakkımızda','hakkimizda'],['Belgeler ve raporlar','seffaflik'],['Faaliyetler','faaliyetler'],['İletişim','iletisim']]],['BİLGİ ALIN',[['Sık sorulan sorular','sss'],['Kişisel veriler','kvkk'],['Bağış ve iade koşulları','bagis-kosullari']]]]
  return `<footer class="footer"><div class="wrap footer-grid"><div><h3>${e(org.name)}</h3><p>${e(org.description)}</p><p>Doğrulanmış iletişim bilgileri kurum onayından sonra yayımlanacaktır.</p></div>${groups.map(([title, items]) => `<div><h4>${title}</h4>${items.map(([label,path]) => `<a href="${base}/${path}">${label}</a>`).join('')}</div>`).join('')}</div><div class="wrap footer-bottom"><span>${e(org.name)} · E‑İnfak altyapısı ile.</span><span>Örnek tasarım · Ödeme kabul edilmez</span></div></footer><nav class="bottom-nav" aria-label="Mobil kısayollar"><a href="${base || '/'}">Ana sayfa</a><a href="${base}/kampanyalar">Bağış yap</a><a href="${base}/sepet">Sepet <span data-cart-count>0</span></a><a href="${base}/iletisim">İletişim</a></nav>`
}

function shell(site, base, title, body) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${e(title)} | ${e(organizations[site]?.name || 'E‑İnfak')}</title><link rel="stylesheet" href="/assets/site.css"><script type="module" src="/assets/client.mjs"></script></head><body class="${site}" data-site="${site}" data-base="${base}">${header(site, base)}<main id="main">${body}</main>${footer(site, base)}</body></html>`
}

function art(c, large = false) {
  return c.image ? `<img class="${large ? 'detail-img' : ''}" src="${c.image}" alt="${e(c.title)}" loading="lazy" width="600" height="400">` : `<div class="campaign-art art-${c.id}" aria-hidden="true"><span>${c.icon}</span></div>`
}

function card(c, base) {
  return `<article class="campaign">${art(c)}<div class="campaign-body"><div class="campaign-meta"><span>${e(c.category.toLocaleUpperCase('tr-TR'))}</span><span class="demo">ÖRNEK PROJE</span></div><h3><a href="${base}/kampanyalar/${c.id}">${e(c.title)}</a></h3><p>${e(c.summary)}</p><div class="campaign-bottom"><strong>${money(c.amount)}<small>Örnek destek tutarı</small></strong><a class="btn" href="${base}/kampanyalar/${c.id}">Bağış yap ↗</a></div></div></article>`
}

function quick(site, base) {
  return `<form class="quick" action="${base}/kampanyalar" method="get"><div><h3>İyilik beklemesin.</h3><small>Destek vermek istediğiniz alanı seçin.</small></div><div><label for="quick-category">Bağış alanı</label><select id="quick-category" name="category"><option value="">Tüm alanlar</option>Eğitim</option>${site === 'hicret' ? '<option>Öğrenci</option>' : '<option>Gıda</option><option>Su</option><option>Genel</option>'}</select></div><div><label for="quick-search">Kampanya ara</label><input id="quick-search" name="q" placeholder="Proje adı veya anahtar kelime" maxlength="100"></div><button class="btn" type="submit">Kampanyaları gör →</button></form>`
}

function campaignSection(site, base) {
  return `<section class="wrap section"><div class="section-head"><div><span class="eyebrow">İYİLİĞE BİR YERDEN BAŞLAYIN</span><h2>${site === 'hicret' ? 'Bir talebeye, bir geleceğe.' : 'Hangi iyiliğin parçası olacaksınız?'}</h2></div><a class="text-link" href="${base}/kampanyalar">Tüm projeler ↗</a></div><div class="cards">${campaigns.filter(c => c.site === site).slice(0, 6).map(c => card(c, base)).join('')}</div>${sampleNote}</section>`
}

function faq() {
  const entries = [
    ['Bu siteden şu anda bağış yapabilir miyim?', 'Bu sürüm geliştirme önizlemesidir. Kampanya seçimini ve sepeti deneyebilirsiniz; gerçek ödeme veya havale kabul edilmez.'],
    ['Birden fazla projeyi destekleyebilir miyim?', 'Farklı proje ve tutarları aynı kurumun sepetinde bir araya getirebilirsiniz. Kurumların sepetleri birbirinden ayrıdır.'],
    ['Kart bilgilerimi nerede gireceğim?', 'Canlı ödeme entegrasyonu tamamlandığında kart bilgileri bankanın ödeme sayfasında girilecektir. Bu önizleme kart bilgisi istemez.'],
    ['Makbuz ve proje sonuçlarına nasıl ulaşacağım?', 'Banka onayından sonra makbuz ve bağışçı portalı üzerinden takip planlanmaktadır. Bu özellikler henüz kullanıma açılmamıştır.'],
  ]
  return `<div class="faq">${entries.map(([q,a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>`
}

function trust(base) {
  return `<section class="wrap section split"><div><span class="eyebrow">ŞEFFAFLIK VE SORUMLULUK</span><h2>Her desteğin<br>izini önemseriz.</h2><p>Kurumunuzu tanıyın, belgelerini inceleyin ve bağış süreci hakkında bilgi alın.</p><a class="text-link" href="${base}/seffaflik">Şeffaflık merkezine git ↗</a></div><div class="documents">${['Kurum tüzüğü','Faaliyet raporları','Denetim belgeleri','Yardım toplama izinleri'].map(x => `<div class="document">${x}<small>Doğrulanmış belge bekleniyor</small></div>`).join('')}</div></section>`
}

function hicretHome(base) {
  return `<section class="h-hero"><div class="wrap"><div><span class="eyebrow">HİCRET DERNEĞİ · EĞİTİME DESTEK</span><h1>Bir insan yetişir.<br><em>Bir gelecek<br>değişir.</em></h1><p>İlimle aydınlanan bir yolculukta, sizin de katkınız olsun. Eğitime verilen her destek, yarına bırakılan bir izdir.</p><div class="actions"><a class="btn light" href="${base}/kampanyalar">Eğitime destek olun ↗</a><a class="btn outline" style="color:white;border-color:#ffffff55" href="${base}/egitim">Bizi yakından tanıyın</a></div></div><figure class="h-photo"><img src="/media/hicret-class" width="600" height="500" alt="Eğitim için bir araya gelen Hicret talebeleri"><figcaption><small>İLİM · EMEK · DAYANIŞMA</small>Geleceğe birlikte hazırlanıyoruz.</figcaption></figure></div></section><div class="wrap quick-wrap">${quick('hicret',base)}</div>${campaignSection('hicret',base)}<section class="programs section"><div class="wrap"><div class="section-head"><div><span class="eyebrow">EĞİTİM YOLCULUĞU</span><h2>Bilgiden hayata uzanan bir yol.</h2></div><a class="text-link" href="${base}/egitim">Program bilgileri ↗</a></div><div class="program-grid">${['Kur’an ve hafızlık','Arapça ve temel ilimler','Öğrenci destekleri'].map((x,i) => `<article class="program"><span>0${i+1}</span><h3>${x}</h3><p>Program içeriği ve başvuru bilgileri kurum tarafından doğrulanarak yayımlanacak.</p><a class="text-link" href="${base}/egitim">Bilgi alın →</a></article>`).join('')}</div></div></section>${trust(base)}<section class="wrap section split"><div><span class="eyebrow">MERAK ETTİKLERİNİZ</span><h2>Destek olmadan<br>önce bilmeniz gerekenler.</h2></div>${faq()}</section>`
}

function kardeslikHome(base) {
  return `<section class="wrap k-hero"><div class="k-copy"><span class="eyebrow">KARDEŞLİK, PAYLAŞMAKLA BAŞLAR.</span><h1>İyilikte<br>sizin de<br><span>payınız olsun.</span></h1><p>Bir sofra, bir damla su, bir çocuğun yarını… Küçük bir adım, büyük bir dayanışmanın başlangıcı.</p><a class="btn" href="${base}/kampanyalar">Payınızı iyiliğe ayırın ↗</a></div><div class="k-poster" role="img" aria-label="Paylaş, çoğalsın — dayanışma afişi"><div class="poster-ring"></div><span class="poster-badge">BİRLİKTE<br>DAHA<br>GÜÇLÜYÜZ</span><div class="poster-word">PAYLAŞ.<br><b>ÇOĞAL</b><br>SIN.</div><span class="poster-foot">KARDEŞLİK PAYI / BİR İYİLİK HAREKETİ</span></div></section><nav class="wrap k-category" aria-label="Bağış kategorileri">${[['◡','Gıda'],['◒','Su'],['▧','Eğitim'],['✳','Genel']].map(([icon,name]) => `<a href="${base}/kampanyalar?category=${encodeURIComponent(name)}"><span aria-hidden="true">${icon}</span>${name} desteği ↗</a>`).join('')}</nav><div class="wrap">${quick('kardeslik',base)}</div>${campaignSection('kardeslik',base)}<section class="wrap"><div class="k-band"><div><span class="eyebrow" style="color:#ecd091">BAZEN EN KIYMETLİ DESTEK ZAMANINIZDIR.</span><h2>İyiliği birlikte<br>organize edelim.</h2><p>Gönüllülük ve dayanışma çalışmalarını keşfedin.</p></div><a class="btn light" href="${base}/gonullu">Gönüllülüğü keşfet ↗</a></div></section><section class="wrap section"><span class="eyebrow">DESTEK KANALLARI</span><h2>Size en uygun yolu seçin.</h2><div class="channel-grid">${[['Online bağış','Projeleri seçin, sepetinizi oluşturun.','kampanyalar'],['Havale / EFT','Doğrulanmış kurum hesaplarını inceleyin.','banka-hesaplari'],['İletişim ve destek','Sorularınız için iletişim kanallarına ulaşın.','iletisim']].map(([title,description,path]) => `<article class="channel"><h3>${title}</h3><p>${description}</p><a class="text-link" href="${base}/${path}">İnceleyin ↗</a></article>`).join('')}</div></section>${trust(base)}<section class="wrap section split"><div><span class="eyebrow">AKLINIZDA SORU KALMASIN</span><h2>İyiliğin yolu<br>açık olsun.</h2></div>${faq()}</section>`
}

function platformHome(local) {
  return `<section class="wrap p-hero"><span class="p-tag">KURUMLAR İÇİN TASARLANDI. İYİLİK İÇİN GELİŞTİRİLİYOR.</span><h1>İyiliğin arkasında<br><span>sağlam bir sistem.</span></h1><p>Bağış, kampanya ve kurum yönetimini bir araya getiren yeni platform. Her kurumun kendi kimliği, her desteğin açık bir yolculuğu.</p><div class="actions"><a class="btn" href="#kurumlar">Kurumlarımızı keşfedin ↗</a><a class="btn outline" href="#cozumler">Platformu tanıyın</a></div><div class="p-dashboard" aria-label="Yönetim paneli tasarım örneği"><aside class="p-sidebar"><b>e‑infak / yönetim</b><span>◉ Genel görünüm</span><span>▤ Kampanyalar</span><span>♡ Bağışlar</span><span>▥ Raporlar</span><span>⚙ Kurum ayarları</span></aside><div class="p-screen"><span class="demo">PANEL TASARIM ÖRNEĞİ · CANLI VERİ DEĞİL</span><h3 style="margin-top:20px">İyiliğin her adımı, bir arada.</h3><div class="p-flow"><div><strong>01</strong>Kampanya oluştur</div><div><strong>02</strong>Desteği doğrula</div><div><strong>03</strong>Şeffafça raporla</div></div><div class="p-row"><span>Kurum web sitesi</span><em>Önizleme hazır</em></div><div class="p-row"><span>Ödeme ve makbuz altyapısı</span><em>Geliştirme aşamasında</em></div><div class="p-row"><span>Kurum yönetim paneli</span><em>Planlanan modül</em></div></div></div></section><section id="cozumler" class="wrap section"><span class="eyebrow">TEK ALTYAPI, KURUMA ÖZEL DENEYİM</span><h2>Operasyon sadeleşsin.<br>İyiliğe daha çok zaman kalsın.</h2><div class="p-features">${[['01 / WEB','Her kurum kendi kimliğiyle','Kuruma özgü siteler; ortak, anlaşılır bir bağış deneyimi.'],['02 / BAĞIŞ','İzlenebilir süreç','Kampanya, sepet, banka doğrulaması ve makbuz için birbirini tamamlayan yapı.'],['03 / YÖNETİM','Bilgi doğru kişinin elinde','Kurum ayrımı, yetki sınırları ve raporlama üzerine kurulan yönetim yaklaşımı.']].map(([label,title,description]) => `<article class="p-feature"><span class="eyebrow">${label}</span><h3>${title}</h3><p>${description}</p></article>`).join('')}</div></section><section id="kurumlar" class="wrap section"><span class="eyebrow">KURUMLARIMIZ</span><h2>Farklı hikâyeler.<br>Ortak bir iyilik amacı.</h2><div class="p-orgs">${Object.entries(organizations).map(([id,org]) => `<article class="p-org"><span class="eyebrow">${id === 'hicret' ? 'EĞİTİM VE ÖĞRENCİ DESTEĞİ' : 'YARDIMLAŞMA VE DAYANIŞMA'}</span><h3>${e(org.name)}</h3><p>${e(org.description)}</p><a class="btn outline" href="${local ? '/' + id : 'https://' + org.domain}">Kurum sitesine git ↗</a></article>`).join('')}</div></section><section id="yaklasim" class="wrap section"><span class="eyebrow">ADIM ADIM, DOĞRULAYARAK</span><h2>Güven, bir tasarım kararıdır.</h2><p>Yeni platform; kurum ayrımı, doğrulanmış ödeme ve izlenebilir kayıtlar üzerine kuruluyor.<br>Canlı ödeme ve yönetim özellikleri, testleri tamamlandığında kullanıma açılacak.</p></section>`
}

export function renderPage(site, base = '') {
  const local = base === '/preview'
  if (local) base = ''
  return shell(site,base,'Ana sayfa',site !== 'platform' ? ngoHome(site,base,campaignSection(site,base),trust(base),faq()) : modernPlatformHome(local))
}

function heading(base,label,title,description='') {
  return `<div class="wrap page-heading"><div class="breadcrumb"><a href="${base || '/'}">Ana sayfa</a><span>/</span><span>${e(label)}</span></div><span class="eyebrow">${e(label.toLocaleUpperCase('tr-TR'))}</span><h1>${e(title)}</h1>${description ? `<p>${e(description)}</p>` : ''}</div>`
}

export function renderRoute(site,base,path,params) {
  if (!organizations[site]) return null
  if (path === '/kampanyalar') {
    const q = (params.get('q') || '').slice(0,100)
    const category = params.get('category') || ''
    const own = campaigns.filter(c => c.site === site)
    const filtered = own.filter(c => (!category || c.category === category) && `${c.title} ${c.summary}`.toLocaleLowerCase('tr-TR').includes(q.toLocaleLowerCase('tr-TR')))
    return shell(site,base,'Kampanyalar',`${heading(base,'Kampanyalar','İyiliğinize bir yön verin.','Örnek projeleri inceleyin ve destek sepetinizi oluşturun.')}<section class="wrap section" style="padding-top:15px"><form class="filters" method="get"><div><label for="q">Proje ara</label><input id="q" name="q" maxlength="100" value="${e(q)}" placeholder="Proje adı veya anahtar kelime"></div><div><label for="category">Destek alanı</label><select id="category" name="category"><option value="">Tüm alanlar</option>${[...new Set(own.map(c => c.category))].map(x => `<option${x === category ? ' selected' : ''}>${e(x)}</option>`).join('')}</select></div><button class="btn">Filtrele</button><a class="btn outline" href="${base}/kampanyalar">Temizle</a></form><p class="muted">${filtered.length} örnek proje</p><div class="cards">${filtered.map(c => card(c,base)).join('')}</div>${!filtered.length ? '<div class="empty">Aramanızla eşleşen proje bulunamadı. Filtreleri değiştirerek tekrar deneyin.</div>' : sampleNote}</section>`)
  }
  if (path.startsWith('/kampanyalar/')) {
    if (path.split('/').length !== 3) return null
    const c = campaignFor(site,path.split('/')[2])
    if (!c) return null
    return shell(site,base,c.title,`${heading(base,c.category,c.title)}<section class="wrap section detail-grid" style="padding-top:10px"><div>${art(c,true)}<div class="detail-copy"><span class="demo">ÖRNEK PROJE · BAĞIŞA AÇIK DEĞİL</span><h2 style="margin-top:25px">Birlikte mümkün.</h2><p>${e(c.summary)}</p><p>Bu sayfa bağış deneyimini değerlendirmek için hazırlanmıştır. Proje kapsamı, uygulama bölgesi, bütçesi ve faaliyet takvimi kurum onayından sonra yayımlanacaktır.</p><a class="text-link" href="${base}/seffaflik">Kurumun belgelerini inceleyin ↗</a></div></div><form class="donation-panel" data-add-cart data-campaign="${c.id}"><span class="eyebrow">DESTEK SEPETİNİZİ HAZIRLAYIN</span><h2>İyilik için bir adım.</h2><div class="amounts">${['100','250','500','1000'].map(a => `<button type="button" data-amount="${a}">${money(a)}</button>`).join('')}</div><div class="field"><label for="amount">Bağış tutarı (TL)</label><input id="amount" name="amount" inputmode="decimal" value="${c.amount}" required maxlength="12"></div><button class="btn full">Örnek sepete ekle →</button><p class="status" role="status" aria-live="polite" data-add-status></p><a class="text-link" href="${base}/sepet">Sepeti görüntüle</a><p class="inline-note">Bu aşamada ödeme alınmaz. Kişisel bilgi veya kart bilgisi istenmez.</p><noscript><p>Sepeti denemek için JavaScript’i etkinleştirin.</p></noscript></form></section>`)
  }
  if (path === '/sepet' || path === '/odeme') {
    const checkout = path === '/odeme'
    return shell(site,base,checkout ? 'Bağış özeti' : 'Bağış sepeti',`${heading(base,'Bağış',checkout ? 'Desteğinizi gözden geçirin.' : 'İyiliği bir araya getirin.')}<section class="wrap section reading" style="padding-top:0"><div class="steps"><span>01 — Proje seçimi</span><strong>${checkout ? '03 — Bağış özeti' : '02 — Sepetiniz'}</strong></div><div data-cart-view></div><noscript><div class="empty">Sepeti görüntülemek için JavaScript’i etkinleştirin.</div></noscript>${checkout ? '<div class="checkout-note">Önizleme burada sona erer. Gerçek ödeme, havale talimatı veya makbuz oluşturulmaz.</div><h3>Ödeme seçenekleri</h3><p>Banka entegrasyonu tamamlandığında kart ve havale seçenekleri burada açılacak.</p><button class="btn full" disabled>Ödeme henüz kullanıma açık değil</button><p class="inline-note">Kişisel veri ve kart bilgisi toplanmaz.</p>' : `<a class="btn" data-checkout-link href="${base}/odeme">Bağış özetine geç →</a>`}<p><a class="text-link" href="${base}/kampanyalar">← Kampanyalara dön</a></p></section>`)
  }
  if (path === '/sss') return shell(site,base,'Sık sorulan sorular',`${heading(base,'Bilgi merkezi','Sorularınıza açık cevaplar.')}<section class="wrap section reading">${faq()}</section>`)
  const page = pages[path.slice(1)]
  if (page) return shell(site,base,page[0],`${heading(base,page[0],page[1])}<section class="wrap section reading" style="padding-top:10px"><div class="empty"><p>${e(page[2])}</p></div>${path === '/seffaflik' ? '<div class="documents" style="margin-top:25px">'+['Tüzük','Yönetim ve denetim','Faaliyet raporu','İzin belgeleri'].map(x => `<div class="document">${x}<small>Henüz yayımlanmadı</small></div>`).join('')+'</div>' : ''}<div class="actions"><a class="btn" href="${base}/kampanyalar">Projeleri inceleyin ↗</a><a class="btn outline" href="${base}/sss">Sık sorulan sorular</a></div></section>`)
  return null
}
