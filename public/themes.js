/* ============================================================
   E-İNFAK THEME LAYOUTS — 10 Unique STK Website Clones
   Each theme provides: home(o, list), about(o, list), contact(o, list)
   ============================================================ */

const themeLayouts = {};

/* ──────────────────────────────────────────────────────────────
   SHARED HELPERS
   ────────────────────────────────────────────────────────────── */
function themeHeader(o, cfg = {}) {
  const topBg = cfg.topBg || '#0f172a';
  const topColor = cfg.topColor || '#cbd5e1';
  const headBg = cfg.headBg || 'rgba(255,255,255,0.95)';
  const navStyle = cfg.navStyle || '';
  const topLeft = cfg.topLeft || 'İnsani Yardım Portalı';
  const topRight = cfg.topRight || '';
  const extraNav = cfg.extraNav || '';
  const logoStyle = cfg.logoStyle || `background:var(--p);`;
  const fontFamily = cfg.font || 'inherit';
  const showLang = cfg.showLang !== false;
  const ctaText = cfg.ctaText || 'Bağış Yap';
  const ctaStyle = cfg.ctaStyle || `background:var(--p); color:#fff;`;

  return `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:6px clamp(18px,5vw,72px); background:${topBg}; color:${topColor}; font-size:11px; font-weight:600; width:100%; box-sizing:border-box; font-family:${fontFamily};">
      <div>${topLeft}</div>
      <div style="display:flex; gap:16px; align-items:center;">
        ${topRight}
        <button type="button" data-action="toggleDarkMode" style="background:transparent; border:0; color:${topColor}; cursor:pointer; font-size:11px; font-weight:600; display:inline-flex; align-items:center; gap:4px; padding:0; font-family:sans-serif;">
          ${state.darkMode ? '☀️ Aydınlık' : '🌙 Karanlık'}
        </button>
        <span>|</span>
        <a href="#/bagisci" style="color:${topColor}; text-decoration:none; display:flex; align-items:center; gap:4px;">👤 Bağışçı</a>
        ${showLang ? '<span>|</span><span style="cursor:pointer;">🌐 TR</span>' : ''}
      </div>
    </div>
    <header class="site-head" style="box-shadow:0 4px 20px rgba(0,0,0,0.03); width:100%; background:${headBg}; backdrop-filter:blur(12px); font-family:${fontFamily}; ${navStyle}">
      <a class="brand" href="#/demo/${o.slug}">
        <span style="${logoStyle}">${esc(o.name[0])}</span>
        <b>${esc(o.name)}</b>
      </a>
      <nav style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
        <a href="#/demo/${o.slug}" class="nav-item">Ana Sayfa</a>
        <a href="#/demo/${o.slug}/bagis/kurban" class="nav-item">Kurban</a>
        <a href="#/demo/${o.slug}/bagis/zekat" class="nav-item">Zekat</a>
        <a href="#/demo/${o.slug}/bagis/acil-yardim" class="nav-item">Acil Yardım</a>
        ${extraNav}
        <a href="#/demo/${o.slug}/hakkimizda" class="nav-item">Hakkımızda</a>
        <a href="#/demo/${o.slug}/iletisim" class="nav-item">İletişim</a>
      </nav>
      <a class="primary" href="#/demo/${o.slug}/bagis/acil-yardim" style="${ctaStyle} box-shadow:0 4px 12px rgba(0,0,0,0.08); font-size:13px; min-height:36px; display:inline-flex; align-items:center; justify-content:center; padding:0 16px; border-radius:var(--r); font-weight:bold;">${ctaText}</a>
    </header>
  `;
}

function themeFooter(o, cfg = {}) {
  const bg = cfg.bg || '#0f172a';
  const color = cfg.color || '#94a3b8';
  const headColor = cfg.headColor || '#fff';
  const fontFamily = cfg.font || 'sans-serif';
  const cols = cfg.columns || 4;
  const extraCol = cfg.extraColumn || '';
  const bottomBg = cfg.bottomBg || '#1e293b';

  return `
    <footer style="background:${bg}; color:${color}; padding:60px clamp(18px,5vw,72px) 30px; font-family:${fontFamily}; margin-top:60px; box-sizing:border-box;">
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:40px; margin-bottom:40px;">
        <div>
          <h3 style="color:${headColor}; margin-top:0; margin-bottom:16px; font-size:1.3rem; display:flex; align-items:center; gap:8px;">
            <span style="background:var(--p); color:#fff; width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center; border-radius:8px; font-weight:bold;">${esc(o.name[0])}</span>
            ${esc(o.name)}
          </h3>
          <p style="font-size:12px; line-height:1.6; margin-bottom:20px; color:#64748b;">${esc(o.description || 'Küresel insani yardım projeleriyle yeryüzünde iyiliği yaymaya adanmış sivil toplum kuruluşu.')}</p>
          <div style="display:flex; gap:12px;">
            <span style="width:32px; height:32px; border-radius:50%; background:#1e293b; display:flex; align-items:center; justify-content:center; color:#fff; font-size:13px; cursor:pointer;">🌐</span>
            <span style="width:32px; height:32px; border-radius:50%; background:#1e293b; display:flex; align-items:center; justify-content:center; color:#fff; font-size:13px; cursor:pointer;">📸</span>
            <span style="width:32px; height:32px; border-radius:50%; background:#1e293b; display:flex; align-items:center; justify-content:center; color:#fff; font-size:13px; cursor:pointer;">🎥</span>
          </div>
        </div>
        <div>
          <h4 style="color:${headColor}; font-size:14px; margin-top:0; margin-bottom:18px; text-transform:uppercase; letter-spacing:0.5px;">Kurumsal</h4>
          <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; font-size:12.5px;">
            <li><a href="#/demo/${o.slug}" style="color:${color}; text-decoration:none;">Ana Sayfa</a></li>
            <li><a href="#/demo/${o.slug}/hakkimizda" style="color:${color}; text-decoration:none;">Hakkımızda</a></li>
            <li><a href="#/demo/${o.slug}/iletisim" style="color:${color}; text-decoration:none;">İletişim</a></li>
            <li><a href="#/demo/${o.slug}" style="color:${color}; text-decoration:none;">Yönetim Kurulu</a></li>
            <li><a href="#/demo/${o.slug}" style="color:${color}; text-decoration:none;">Denetim Raporları</a></li>
          </ul>
        </div>
        <div>
          <h4 style="color:${headColor}; font-size:14px; margin-top:0; margin-bottom:18px; text-transform:uppercase; letter-spacing:0.5px;">Faaliyetler</h4>
          <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; font-size:12.5px;">
            <li><a href="#/demo/${o.slug}/bagis/acil-yardim" style="color:${color}; text-decoration:none;">Acil Yardım</a></li>
            <li><a href="#/demo/${o.slug}/bagis/kurban" style="color:${color}; text-decoration:none;">Kurban Hissesi</a></li>
            <li><a href="#/demo/${o.slug}/bagis/zekat" style="color:${color}; text-decoration:none;">Zekat & Sadaka</a></li>
            <li><a href="#/demo/${o.slug}" style="color:${color}; text-decoration:none;">Su Kuyuları</a></li>
            <li><a href="#/demo/${o.slug}" style="color:${color}; text-decoration:none;">Yetim Destekleri</a></li>
          </ul>
        </div>
        <div>
          <h4 style="color:${headColor}; font-size:14px; margin-top:0; margin-bottom:18px; text-transform:uppercase; letter-spacing:0.5px;">Hesap Bilgileri</h4>
          <div style="font-size:12px; margin-bottom:14px;">
            <strong style="color:#cbd5e1; display:block; margin-bottom:4px;">Ziraat Katılım IBAN:</strong>
            <span style="font-family:monospace; background:${bottomBg}; padding:4px 6px; border-radius:4px; display:inline-block; color:#fff; font-size:11px; user-select:all;">${esc(o.iban)}</span>
          </div>
          <div style="font-size:12px; margin-bottom:18px;">
            <strong style="color:#cbd5e1; display:block; margin-bottom:4px;">Destek Hattı:</strong>
            <span style="color:#cbd5e1;">${esc(o.phone)}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px; opacity:0.65; flex-wrap:wrap;">
            <span style="border:1px solid #334155; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:bold; color:#fff;">SSL SECURE</span>
            <span style="border:1px solid #334155; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:bold; color:#fff;">3D SECURE</span>
            <span style="border:1px solid #334155; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:bold; color:#fff;">VISA / MC</span>
          </div>
        </div>
        ${extraCol}
      </div>
      <div style="border-top:1px solid #1e293b; padding-top:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; font-size:11.5px; color:#64748b;">
        <div>© 2026 ${esc(o.name)}. Tüm Hakları Saklıdır.</div>
        <div style="display:flex; gap:16px;">
          <a href="#/demo/${o.slug}" style="color:#64748b; text-decoration:none;">KVKK Politikası</a>
          <a href="#/demo/${o.slug}" style="color:#64748b; text-decoration:none;">Kullanım Koşulları</a>
        </div>
      </div>
    </footer>
  `;
}

function themeHeroSlider(o, list, cfg = {}) {
  const featured = list.filter(c => c.featured).slice(0, 5);
  const cs = state.currentSlideIndex || 0;
  const overlayStyle = cfg.overlay || 'linear-gradient(135deg, rgba(0,0,0,0.6), rgba(0,0,0,0.3))';
  const contentPos = cfg.contentPos || 'left';
  const fontFamily = cfg.font || 'inherit';
  const showDots = cfg.showDots !== false;
  const btnStyle = cfg.btnStyle || `background:var(--a); color:#fff; padding:14px 28px; border-radius:var(--r); font-weight:bold; font-size:14px; display:inline-flex; align-items:center; gap:8px; text-decoration:none; box-shadow:0 4px 15px rgba(0,0,0,0.2);`;
  const height = cfg.height || '520px';

  return `
    <div style="position:relative; min-height:${height}; overflow:hidden;">
      ${featured.map((c, i) => `
        <div style="display:${i === cs ? 'flex' : 'none'}; position:relative; min-height:${height}; background:url('${c.visual}') center/cover no-repeat; align-items:center; ${contentPos === 'center' ? 'justify-content:center; text-align:center;' : ''}">
          <div style="position:absolute; inset:0; background:${overlayStyle};"></div>
          <div style="position:relative; z-index:2; padding:60px clamp(18px,5vw,72px); max-width:700px; font-family:${fontFamily}; ${contentPos === 'center' ? 'text-align:center;' : ''}">
            <span style="display:inline-block; background:var(--a); color:#fff; padding:4px 14px; border-radius:20px; font-size:12px; font-weight:bold; margin-bottom:16px; letter-spacing:0.5px;">${esc(labels[c.category] || c.category)}</span>
            <h1 style="color:#fff; font-size:clamp(1.8rem, 4vw, 2.8rem); line-height:1.2; margin:0 0 16px; text-shadow:0 2px 4px rgba(0,0,0,0.3);">${esc(c.title)}</h1>
            <p style="color:rgba(255,255,255,0.85); font-size:16px; line-height:1.6; margin:0 0 24px; max-width:500px;">${esc(c.summary)}</p>
            <a href="#/demo/${o.slug}/bagis/${c.slug}" style="${btnStyle}">Hemen Bağış Yap <span>➔</span></a>
          </div>
        </div>
      `).join('')}
      ${showDots ? `
        <div style="position:absolute; bottom:20px; left:50%; transform:translateX(-50%); display:flex; gap:8px; z-index:5;">
          ${featured.map((_, i) => `
            <span data-slide-dot="${i}" style="width:${i === cs ? '24px' : '10px'}; height:10px; border-radius:5px; background:${i === cs ? 'var(--a)' : 'rgba(255,255,255,0.5)'}; cursor:pointer; transition:all 0.3s;"></span>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function themeCampaignGrid(o, list, cfg = {}) {
  const activeCat = state.selectedCategory || 'all';
  const cats = [
    { label: 'Tümü', value: 'all' },
    { label: 'Acil Yardım', value: 'acil-yardim' },
    { label: 'Kurban', value: 'kurban' },
    { label: 'Zekat & Eğitim', value: 'zekat' },
    { label: 'Yetim 👶', value: 'yetim' }
  ];
  const filtered = list.filter(c => activeCat === 'all' || c.category === activeCat);
  const cols = cfg.cols || 'three';
  const tabStyle = cfg.tabStyle || 'pill';
  const fontFamily = cfg.font || 'inherit';
  const sectionBg = cfg.sectionBg || '#fff';
  const tabActiveBg = cfg.tabActiveBg || 'var(--brand)';
  const tabActiveColor = cfg.tabActiveColor || '#fff';

  const tabsHtml = tabStyle === 'underline' ? `
    <div style="display:flex; gap:0; border-bottom:2px solid var(--line); margin-bottom:24px; overflow:auto;">
      ${cats.map(c => `
        <button type="button" data-category-tab="${c.value}" style="padding:10px 20px; font-size:13px; font-weight:600; border:0; background:transparent; cursor:pointer; color:${activeCat === c.value ? 'var(--brand)' : 'var(--muted)'}; border-bottom:${activeCat === c.value ? '3px solid var(--brand)' : '3px solid transparent'}; margin-bottom:-2px; font-family:${fontFamily};">
          ${c.label}
        </button>
      `).join('')}
    </div>
  ` : `
    <div style="display:flex; gap:8px; margin-bottom:24px; overflow:auto; padding-bottom:4px;">
      ${cats.map(c => `
        <button type="button" data-category-tab="${c.value}" style="min-height:32px; padding:0 16px; font-size:12px; border-radius:99px; cursor:pointer; border:1px solid var(--line); font-weight:bold; background:${activeCat === c.value ? tabActiveBg : sectionBg}; color:${activeCat === c.value ? tabActiveColor : 'var(--ink)'}; font-family:${fontFamily};">
          ${c.label}
        </button>
      `).join('')}
    </div>
  `;

  return `
    <section class="section" style="font-family:${fontFamily}; background:${sectionBg};">
      <h2 style="text-align:center; margin-bottom:24px;">Bağış Kalemleri</h2>
      ${tabsHtml}
      <div class="cards ${cols}">
        ${activeCat === 'yetim'
          ? (state.data.orphans || []).filter(ch => ch.organizationId === o.id).map(ch => orphanCard(o, ch)).join('')
          : filtered.map(c => campaignCard(o, c)).join('')
        }
      </div>
    </section>
  `;
}

function themeImpactStats(o, list, cfg = {}) {
  const bg = cfg.bg || 'var(--p)';
  const color = cfg.color || '#fff';
  const total = list.reduce((s, c) => s + c.collected, 0);
  return `
    <section style="background:${bg}; color:${color}; padding:40px clamp(18px,5vw,72px); display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:24px; text-align:center;">
      <div><b style="font-size:1.8rem; display:block;">${money(total)}</b><small style="font-size:12px; opacity:0.8;">Toplam Bağış</small></div>
      <div><b style="font-size:1.8rem; display:block;">${donations(o.slug).length}</b><small style="font-size:12px; opacity:0.8;">Bağış Kaydı</small></div>
      <div><b style="font-size:1.8rem; display:block;">${animals(o.slug).length}</b><small style="font-size:12px; opacity:0.8;">Kurban Operasyonu</small></div>
      <div><b style="font-size:1.8rem; display:block;">${shares(o.slug).length}</b><small style="font-size:12px; opacity:0.8;">Atanmış Hisse</small></div>
    </section>
  `;
}

function themeAboutPage(o, cfg = {}) {
  const fontFamily = cfg.font || 'inherit';
  const headFont = cfg.headFont || fontFamily;
  const heroBg = cfg.heroBg || 'var(--p)';
  const heroImg = cfg.heroImg || 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1200&h=400&fit=crop';

  return `<div class="site" data-theme="${o.theme}" style="--p:${o.primaryColor};--a:${o.accentColor}; font-family:${fontFamily};">
    ${themeHeader(o, cfg.headerCfg || { font: fontFamily })}
    <main>
      <div style="position:relative; height:280px; background:url('${heroImg}') center/cover; display:flex; align-items:center; justify-content:center;">
        <div style="position:absolute; inset:0; background:linear-gradient(135deg, ${heroBg}dd, ${heroBg}99);"></div>
        <h1 style="position:relative; z-index:2; color:#fff; font-size:2.5rem; font-family:${headFont}; text-shadow:0 2px 8px rgba(0,0,0,0.3);">Hakkımızda</h1>
      </div>
      <div style="max-width:900px; margin:0 auto; padding:40px 20px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:32px; margin-bottom:40px;">
          <div style="background:#fff; border:1px solid var(--line); border-radius:var(--r); padding:28px;">
            <h3 style="color:var(--p); margin-top:0; font-family:${headFont};">🎯 Misyonumuz</h3>
            <p style="font-size:14px; line-height:1.7; color:var(--muted);">Savaş, doğal afet ve kuraklık gibi kriz bölgelerindeki insan onurunu koruyacak temel yaşam desteklerini en hızlı şekilde ulaştırmak ve bölge halkının kalkınmasını sağlayacak kalıcı projeler inşa etmek.</p>
          </div>
          <div style="background:#fff; border:1px solid var(--line); border-radius:var(--r); padding:28px;">
            <h3 style="color:var(--p); margin-top:0; font-family:${headFont};">👁️ Vizyonumuz</h3>
            <p style="font-size:14px; line-height:1.7; color:var(--muted);">Yeryüzünde adaletin ve paylaşma bilincinin yaygınlaştığı, kimsesiz çocukların eğitim haklarına tam erişim sağlayabildiği refah dolu bir dünya.</p>
          </div>
        </div>
        <div style="background:var(--soft); border:1px solid var(--line); border-radius:var(--r); padding:24px; display:flex; gap:16px; align-items:center;">
          <div style="font-size:2.5rem;">🛡️</div>
          <div>
            <h4 style="margin:0 0 4px; font-size:14px; color:var(--ink);">Fıkhi Denetim ve Güvence</h4>
            <p style="margin:0; font-size:13px; color:var(--muted); line-height:1.5;">Zekat, kurban ve sadaka bağışlarınız uzman fıkhi kurullarımızın gözetiminde şart koştuğunuz amaç ve bölgeye tam uygun olarak sahaya sevk edilir.</p>
          </div>
        </div>
        <div style="margin-top:32px; display:grid; grid-template-columns:repeat(3, 1fr); gap:20px; text-align:center;">
          <div style="background:#fff; border:1px solid var(--line); border-radius:var(--r); padding:24px;">
            <b style="font-size:2rem; color:var(--p); display:block;">47</b>
            <span style="font-size:12px; color:var(--muted);">Faaliyet Ülkesi</span>
          </div>
          <div style="background:#fff; border:1px solid var(--line); border-radius:var(--r); padding:24px;">
            <b style="font-size:2rem; color:var(--p); display:block;">1.2M+</b>
            <span style="font-size:12px; color:var(--muted);">Kişiye Ulaştık</span>
          </div>
          <div style="background:#fff; border:1px solid var(--line); border-radius:var(--r); padding:24px;">
            <b style="font-size:2rem; color:var(--p); display:block;">350+</b>
            <span style="font-size:12px; color:var(--muted);">Aktif Proje</span>
          </div>
        </div>
      </div>
    </main>
    ${themeFooter(o, cfg.footerCfg || { font: fontFamily })}
  </div>`;
}

function themeContactPage(o, cfg = {}) {
  const fontFamily = cfg.font || 'inherit';
  const headFont = cfg.headFont || fontFamily;
  const heroBg = cfg.heroBg || 'var(--p)';

  return `<div class="site" data-theme="${o.theme}" style="--p:${o.primaryColor};--a:${o.accentColor}; font-family:${fontFamily};">
    ${themeHeader(o, cfg.headerCfg || { font: fontFamily })}
    <main>
      <div style="background:${heroBg}; color:#fff; padding:60px clamp(18px,5vw,72px); text-align:center;">
        <h1 style="font-family:${headFont}; margin:0 0 8px; font-size:2rem;">İletişim</h1>
        <p style="opacity:0.8; font-size:14px;">Bizimle her zaman iletişime geçebilirsiniz</p>
      </div>
      <div style="max-width:1000px; margin:0 auto; padding:40px 20px; display:grid; grid-template-columns:1.2fr 1fr; gap:28px;">
        <div style="background:#fff; border:1px solid var(--line); border-radius:var(--r); padding:32px;">
          <h2 style="margin-top:0; font-size:1.3rem; color:var(--ink); font-family:${headFont};">📞 İletişim Bilgileri</h2>
          <div style="display:flex; flex-direction:column; gap:16px; margin-top:20px;">
            <div style="display:flex; gap:12px; align-items:center;"><span style="font-size:1.3rem;">📍</span><div style="font-size:13px;"><strong>Merkez Ofis:</strong> Merkez Mah. Vatan Cad. No: 12, ${esc(o.city)}</div></div>
            <div style="display:flex; gap:12px; align-items:center;"><span style="font-size:1.3rem;">☎️</span><div style="font-size:13px;"><strong>Telefon:</strong> ${esc(o.phone)}</div></div>
            <div style="display:flex; gap:12px; align-items:center;"><span style="font-size:1.3rem;">✉️</span><div style="font-size:13px;"><strong>E-Posta:</strong> info@${o.slug}.org</div></div>
          </div>
          <div style="margin-top:24px; border:1px solid var(--line); border-radius:var(--r); overflow:hidden; background:#e2e8f0; height:200px; position:relative; display:flex; align-items:center; justify-content:center;">
            <div style="text-align:center; color:#475569; z-index:2;"><span style="font-size:2rem; display:block;">🗺️</span><strong style="font-size:12.5px;">Harita — ${esc(o.city)}</strong></div>
            <div style="position:absolute; inset:0; opacity:0.15; background:radial-gradient(circle, #000 10%, transparent 11%), radial-gradient(circle, #000 10%, transparent 11%); background-size:20px 20px; background-position:0 0, 10px 10px;"></div>
          </div>
        </div>
        <div style="background:#fff; border:1px solid var(--line); border-radius:var(--r); padding:32px;">
          <h2 style="margin-top:0; font-size:1.3rem; color:var(--ink); font-family:${headFont};">Bize Yazın</h2>
          <form data-form="contact" style="display:flex; flex-direction:column; gap:12px; margin:0;">
            <input type="hidden" name="orgSlug" value="${o.slug}">
            <div><label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Ad Soyad</label><input type="text" name="name" required placeholder="Adınız Soyadınız" style="padding:8px 10px; font-size:13px; border-radius:var(--r); border:1px solid var(--line); width:100%;"></div>
            <div><label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">E-Posta</label><input type="email" name="email" required placeholder="ornek@mail.com" style="padding:8px 10px; font-size:13px; border-radius:var(--r); border:1px solid var(--line); width:100%;"></div>
            <div><label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Konu</label><input type="text" name="subject" required placeholder="Konunuz" style="padding:8px 10px; font-size:13px; border-radius:var(--r); border:1px solid var(--line); width:100%;"></div>
            <div><label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Mesaj</label><textarea name="message" required placeholder="Mesajınız..." style="padding:8px 10px; font-size:13px; height:80px; border-radius:var(--r); border:1px solid var(--line); width:100%;"></textarea></div>
            <button class="primary" style="margin-top:8px; min-height:40px; border-radius:var(--r); font-weight:bold;">Gönder</button>
          </form>
        </div>
      </div>
    </main>
    ${themeFooter(o, cfg.footerCfg || { font: fontFamily })}
  </div>`;
}


/* ══════════════════════════════════════════════════════════════
   THEME 1: NEZIR (nezir.org) → Rahmet Eli
   Clean, minimalist, Quicksand font, green dominant
   ══════════════════════════════════════════════════════════════ */
themeLayouts.nezir = {
  home(o, list) {
    const hCfg = { font: "'Quicksand', sans-serif", topBg: '#064e3b', topLeft: '☪ İnsani Yardım Portalı', ctaText: 'Şimdi Bağış Yap', ctaStyle: 'background:#00764B; color:#fff;' };
    return `<div class="site" data-theme="nezir" style="--p:${o.primaryColor};--a:${o.accentColor}; font-family:'Quicksand', sans-serif;">
      ${themeHeader(o, hCfg)}
      <main>
        ${themeHeroSlider(o, list, { font: "'Quicksand', sans-serif", overlay: 'linear-gradient(135deg, rgba(0,118,75,0.7), rgba(0,0,0,0.4))', btnStyle: 'background:#00764B; color:#fff; padding:14px 28px; border-radius:8px; font-weight:700; font-size:15px; display:inline-flex; align-items:center; gap:8px; text-decoration:none; box-shadow:0 4px 15px rgba(0,118,75,0.3); font-family:Quicksand,sans-serif;' })}
        
        <div style="background:#f0fdf4; padding:20px clamp(18px,5vw,72px); display:flex; gap:12px; align-items:center; border-bottom:1px solid #bbf7d0;">
          <span style="font-size:1.5rem;">🚀</span>
          <span style="font-size:13px; color:#166534; font-weight:600;">Hızlı bağış yaparak acil yardım kampanyalarımıza destek olabilirsiniz.</span>
          <a href="#/demo/${o.slug}/bagis/acil-yardim" style="margin-left:auto; background:#00764B; color:#fff; padding:8px 20px; border-radius:6px; font-weight:bold; font-size:12px; text-decoration:none;">Hızlı Bağış →</a>
        </div>

        ${themeCampaignGrid(o, list, { font: "'Quicksand', sans-serif", tabStyle: 'pill', tabActiveBg: '#00764B', sectionBg: '#fff' })}

        <section class="section alt" style="background:#f8faf8; padding:48px clamp(18px,5vw,72px);">
          <h2 style="text-align:center; margin-bottom:8px;">🌍 Küresel Faaliyet Haritamız</h2>
          <p style="text-align:center; color:var(--muted); max-width:600px; margin:0 auto 28px; font-size:14px;">Yardım eli uzattığımız bölgeleri inceleyin.</p>
          <div class="split" style="gap:28px; align-items:center;">${renderWorldMap()}${renderImpactPanel(o)}</div>
        </section>

        <section class="section" style="padding:48px clamp(18px,5vw,72px);">
          <div class="split">${renderZekatCalculator(o)}${renderFaqAccordion()}</div>
        </section>

        ${themeImpactStats(o, list, { bg: '#064e3b' })}
      </main>
      ${themeFooter(o, { bg: '#022c22', font: "'Quicksand', sans-serif" })}
    </div>`;
  },
  about(o, list) { return themeAboutPage(o, { font: "'Quicksand', sans-serif", headFont: "'Quicksand', sans-serif", heroBg: '#00764B', headerCfg: { font: "'Quicksand', sans-serif", topBg: '#064e3b' }, footerCfg: { bg: '#022c22', font: "'Quicksand', sans-serif" } }); },
  contact(o, list) { return themeContactPage(o, { font: "'Quicksand', sans-serif", headFont: "'Quicksand', sans-serif", heroBg: '#00764B', headerCfg: { font: "'Quicksand', sans-serif", topBg: '#064e3b' }, footerCfg: { bg: '#022c22', font: "'Quicksand', sans-serif" } }); }
};


/* ══════════════════════════════════════════════════════════════
   THEME 2: HAKDER (hakder.org) → Umut Köprüsü
   Corporate blue, trust-oriented, Poppins font
   ══════════════════════════════════════════════════════════════ */
themeLayouts.hakder = {
  home(o, list) {
    const hCfg = { font: "'Poppins', sans-serif", topBg: '#1e3a5f', topLeft: '📞 0212 555 1020 | info@umut-koprusu.org', topRight: '<span style="background:#22c55e; color:#fff; padding:2px 8px; border-radius:4px; font-size:10px;">WhatsApp Destek</span>', ctaText: 'Bağış Yap', ctaStyle: 'background:#1d4ed8; color:#fff;' };
    return `<div class="site" data-theme="hakder" style="--p:${o.primaryColor};--a:${o.accentColor}; font-family:'Poppins', sans-serif;">
      ${themeHeader(o, hCfg)}
      <main>
        ${themeHeroSlider(o, list, { font: "'Poppins', sans-serif", overlay: 'linear-gradient(to right, rgba(29,78,216,0.8), rgba(0,0,0,0.3))', height: '480px' })}
        
        <div style="background:#eff6ff; padding:16px clamp(18px,5vw,72px); display:flex; gap:20px; justify-content:center; border-bottom:1px solid #bfdbfe;">
          <div style="display:flex; align-items:center; gap:8px; font-size:12px; color:#1e40af; font-weight:600;"><span>📩</span> Bağış sonrası WhatsApp video geri bildirimi</div>
          <div style="display:flex; align-items:center; gap:8px; font-size:12px; color:#1e40af; font-weight:600;"><span>🔒</span> 3D Secure güvenli ödeme</div>
          <div style="display:flex; align-items:center; gap:8px; font-size:12px; color:#1e40af; font-weight:600;"><span>🌐</span> 47 ülkede faaliyet</div>
        </div>

        ${themeCampaignGrid(o, list, { font: "'Poppins', sans-serif", tabStyle: 'underline', cols: 'three' })}

        <section class="section alt" style="background:#f0f5ff; padding:48px clamp(18px,5vw,72px);">
          <h2 style="text-align:center; margin-bottom:8px;">🌍 Faaliyet Haritası</h2>
          <p style="text-align:center; color:var(--muted); max-width:600px; margin:0 auto 28px; font-size:14px;">Küresel yardım ağımızı inceleyin.</p>
          <div class="split" style="gap:28px; align-items:center;">${renderWorldMap()}${renderImpactPanel(o)}</div>
        </section>

        <section class="section" style="padding:48px clamp(18px,5vw,72px);">
          <div class="split">${renderZekatCalculator(o)}${renderFaqAccordion()}</div>
        </section>

        ${themeImpactStats(o, list, { bg: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)' })}
      </main>
      ${themeFooter(o, { bg: '#0f172a', font: "'Poppins', sans-serif" })}
    </div>`;
  },
  about(o, list) { return themeAboutPage(o, { font: "'Poppins', sans-serif", heroBg: '#1d4ed8', headerCfg: { font: "'Poppins', sans-serif", topBg: '#1e3a5f' }, footerCfg: { bg: '#0f172a', font: "'Poppins', sans-serif" } }); },
  contact(o, list) { return themeContactPage(o, { font: "'Poppins', sans-serif", heroBg: '#1d4ed8', headerCfg: { font: "'Poppins', sans-serif", topBg: '#1e3a5f' }, footerCfg: { bg: '#0f172a', font: "'Poppins', sans-serif" } }); }
};


/* ══════════════════════════════════════════════════════════════
   THEME 3: EFENDI (efendi.org.tr) → İlim Yolu
   Traditional warm brown, Playfair Display headings, education focus
   ══════════════════════════════════════════════════════════════ */
themeLayouts.efendi = {
  home(o, list) {
    const hCfg = { font: "'Inter', sans-serif", topBg: '#451a03', topLeft: '📖 Eğitim ve Hayır Portalı | WhatsApp: 0532 xxx xx xx', ctaText: 'Bağış Yap', ctaStyle: 'background:#7c2d12; color:#fff;' };
    return `<div class="site" data-theme="efendi" style="--p:${o.primaryColor};--a:${o.accentColor}; font-family:'Inter', sans-serif;">
      ${themeHeader(o, hCfg)}
      <main>
        ${themeHeroSlider(o, list, { font: "'Playfair Display', serif", overlay: 'linear-gradient(135deg, rgba(124,45,18,0.75), rgba(0,0,0,0.4))', height: '500px', btnStyle: 'background:#d97706; color:#fff; padding:14px 28px; border-radius:6px; font-weight:700; font-size:14px; display:inline-flex; align-items:center; gap:8px; text-decoration:none; box-shadow:0 4px 15px rgba(217,119,6,0.3); font-family:Inter,sans-serif;' })}
        
        <div style="background:#fef3c7; padding:16px clamp(18px,5vw,72px); text-align:center; border-bottom:1px solid #fcd34d;">
          <span style="font-size:13px; color:#92400e; font-weight:600;">📚 Hafızlık ve Medrese eğitim destekleri — Eğitime destek verin, geleceğe yatırım yapın</span>
        </div>

        <section class="section" style="padding:48px clamp(18px,5vw,72px);">
          <h2 style="text-align:center; font-family:'Playfair Display', serif; margin-bottom:8px;">Eğitim & Hayır Projeleri</h2>
          <p style="text-align:center; color:var(--muted); font-size:14px; margin-bottom:24px;">Hafızlık, medrese, külliye ve yetim eğitim desteklerimiz</p>
          <div class="cards three">${list.map(c => campaignCard(o, c)).join('')}</div>
        </section>

        <section class="section alt" style="background:#fffbeb; padding:48px clamp(18px,5vw,72px);">
          <div class="split">${renderZekatCalculator(o)}${renderFaqAccordion()}</div>
        </section>

        <section class="section" style="padding:48px clamp(18px,5vw,72px);">
          <h2 style="text-align:center; margin-bottom:8px;">🌍 Faaliyet Alanlarımız</h2>
          <div class="split" style="gap:28px; align-items:center;">${renderWorldMap()}${renderImpactPanel(o)}</div>
        </section>

        ${themeImpactStats(o, list, { bg: 'linear-gradient(135deg, #451a03, #7c2d12)' })}
      </main>
      ${themeFooter(o, { bg: '#1c1917', font: "'Inter', sans-serif" })}
    </div>`;
  },
  about(o, list) { return themeAboutPage(o, { font: "'Inter', sans-serif", headFont: "'Playfair Display', serif", heroBg: '#7c2d12', headerCfg: { font: "'Inter', sans-serif", topBg: '#451a03' }, footerCfg: { bg: '#1c1917' } }); },
  contact(o, list) { return themeContactPage(o, { font: "'Inter', sans-serif", headFont: "'Playfair Display', serif", heroBg: '#7c2d12', headerCfg: { font: "'Inter', sans-serif", topBg: '#451a03' }, footerCfg: { bg: '#1c1917' } }); }
};


/* ══════════════════════════════════════════════════════════════
   THEME 4: VUSLAT (vuslat.org.tr) → Vuslat Kapısı
   Indigo/purple modern, Outfit font, donor dashboard focus
   ══════════════════════════════════════════════════════════════ */
themeLayouts.vuslat = {
  home(o, list) {
    const hCfg = { font: "'Outfit', sans-serif", topBg: '#312e81', topLeft: '🕌 Vuslat Kapısı Yardım Vakfı', topRight: '<a href="#/demo/' + o.slug + '" style="color:#c4b5fd; text-decoration:none; font-size:11px;">🌐 TR</a><span style="color:#818cf8;">|</span><a href="#/demo/' + o.slug + '" style="color:#c4b5fd; text-decoration:none; font-size:11px;">EN</a><span style="color:#818cf8;">|</span><a href="#/demo/' + o.slug + '" style="color:#c4b5fd; text-decoration:none; font-size:11px;">AR</a>', ctaStyle: 'background:#4f46e5; color:#fff;', extraNav: '<a href="#/demo/' + o.slug + '/bagis/su-kuyusu" class="nav-item">Su Kuyusu</a><a href="#/demo/' + o.slug + '/bagis/yetim" class="nav-item">Yetim</a>' };
    return `<div class="site" data-theme="vuslat" style="--p:${o.primaryColor};--a:${o.accentColor}; font-family:'Outfit', sans-serif;">
      ${themeHeader(o, hCfg)}
      <main>
        ${themeHeroSlider(o, list, { font: "'Outfit', sans-serif", overlay: 'linear-gradient(135deg, rgba(79,70,229,0.75), rgba(6,182,212,0.4))', height: '540px', contentPos: 'center' })}

        ${themeCampaignGrid(o, list, { font: "'Outfit', sans-serif", tabStyle: 'pill', tabActiveBg: '#4f46e5', sectionBg: '#fff' })}

        <section class="section alt" style="background:#eef2ff; padding:48px clamp(18px,5vw,72px);">
          <h2 style="text-align:center; margin-bottom:8px;">🌍 Küresel Varlığımız</h2>
          <div class="split" style="gap:28px; align-items:center;">${renderWorldMap()}${renderImpactPanel(o)}</div>
        </section>

        <section class="section" style="padding:48px clamp(18px,5vw,72px);">
          <div class="split">${renderZekatCalculator(o)}${renderFaqAccordion()}</div>
        </section>

        ${renderTransparencyChart(o)}

        ${themeImpactStats(o, list, { bg: 'linear-gradient(135deg, #312e81, #4f46e5)' })}
      </main>
      ${themeFooter(o, { bg: '#1e1b4b', font: "'Outfit', sans-serif" })}
    </div>`;
  },
  about(o, list) { return themeAboutPage(o, { font: "'Outfit', sans-serif", heroBg: '#4f46e5', headerCfg: { font: "'Outfit', sans-serif", topBg: '#312e81' }, footerCfg: { bg: '#1e1b4b', font: "'Outfit', sans-serif" } }); },
  contact(o, list) { return themeContactPage(o, { font: "'Outfit', sans-serif", heroBg: '#4f46e5', headerCfg: { font: "'Outfit', sans-serif", topBg: '#312e81' }, footerCfg: { bg: '#1e1b4b', font: "'Outfit', sans-serif" } }); }
};


/* ══════════════════════════════════════════════════════════════
   THEME 5: IHH (ihh.org.tr) → Mazlumlara Umut
   Red/urgent, high contrast, minimalist, Inter font, crisis-focused
   ══════════════════════════════════════════════════════════════ */
themeLayouts.ihh = {
  home(o, list) {
    const hCfg = { font: "'Inter', sans-serif", topBg: '#7f1d1d', topLeft: '🆘 Acil Yardım Hattı: 0212 631 21 21', topRight: '<a href="#/demo/' + o.slug + '" style="color:#fca5a5; text-decoration:none; font-size:11px;">TR</a><span style="color:#991b1b;">|</span><a href="#/demo/' + o.slug + '" style="color:#fca5a5; text-decoration:none; font-size:11px;">EN</a><span style="color:#991b1b;">|</span><a href="#/demo/' + o.slug + '" style="color:#fca5a5; text-decoration:none; font-size:11px;">AR</a>', ctaText: '❤️ Bağış Yap', ctaStyle: 'background:#b91c1c; color:#fff;', extraNav: '<a href="#/demo/' + o.slug + '/bagis/su-kuyusu" class="nav-item">Su Kuyusu</a><a href="#/demo/' + o.slug + '/bagis/yetim" class="nav-item">Yetim Sponsorluk</a>' };
    return `<div class="site" data-theme="ihh" style="--p:${o.primaryColor};--a:${o.accentColor}; font-family:'Inter', sans-serif;">
      ${themeHeader(o, hCfg)}
      <main>
        <div style="background:#fef2f2; padding:10px clamp(18px,5vw,72px); display:flex; align-items:center; gap:12px; border-bottom:2px solid #fecaca; animation:pulse 2s ease-in-out infinite;">
          <span style="font-size:1.2rem;">🚨</span>
          <span style="font-size:13px; color:#991b1b; font-weight:700;">ACİL ÇAĞRI: Gazze'ye insani yardım devam ediyor — Desteğiniz hayat kurtarıyor!</span>
          <a href="#/demo/${o.slug}/bagis/gazze-yardim" style="margin-left:auto; background:#b91c1c; color:#fff; padding:8px 20px; border-radius:6px; font-weight:bold; font-size:12px; text-decoration:none; white-space:nowrap;">Acil Bağış Yap</a>
        </div>

        ${themeHeroSlider(o, list, { font: "'Inter', sans-serif", overlay: 'linear-gradient(135deg, rgba(185,28,28,0.75), rgba(0,0,0,0.5))', height: '560px', btnStyle: 'background:#f97316; color:#fff; padding:16px 32px; border-radius:8px; font-weight:800; font-size:15px; display:inline-flex; align-items:center; gap:8px; text-decoration:none; box-shadow:0 6px 20px rgba(249,115,22,0.4); text-transform:uppercase; letter-spacing:0.5px; font-family:Inter,sans-serif;' })}

        ${themeCampaignGrid(o, list, { font: "'Inter', sans-serif", tabStyle: 'underline', tabActiveBg: '#b91c1c' })}

        <section class="section alt" style="background:#fff7ed; padding:48px clamp(18px,5vw,72px);">
          <h2 style="text-align:center; margin-bottom:8px;">🧮 Zekat Hesaplayıcı</h2>
          <p style="text-align:center; color:var(--muted); font-size:14px; margin-bottom:24px;">Diyanet İşleri Başkanlığı standartlarına uygun zekat hesaplama</p>
          <div class="split">${renderZekatCalculator(o)}${renderFaqAccordion()}</div>
        </section>

        <section class="section" style="padding:48px clamp(18px,5vw,72px);">
          <h2 style="text-align:center; margin-bottom:8px;">🌍 123 Ülkede Faaliyet</h2>
          <div class="split" style="gap:28px; align-items:center;">${renderWorldMap()}${renderImpactPanel(o)}</div>
        </section>

        ${renderTransparencyChart(o)}

        ${themeImpactStats(o, list, { bg: 'linear-gradient(135deg, #7f1d1d, #b91c1c)' })}
      </main>
      ${themeFooter(o, { bg: '#1c1917', font: "'Inter', sans-serif" })}
    </div>`;
  },
  about(o, list) { return themeAboutPage(o, { font: "'Inter', sans-serif", heroBg: '#b91c1c', heroImg: 'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?w=1200&h=400&fit=crop', headerCfg: { font: "'Inter', sans-serif", topBg: '#7f1d1d' }, footerCfg: { bg: '#1c1917' } }); },
  contact(o, list) { return themeContactPage(o, { font: "'Inter', sans-serif", heroBg: '#b91c1c', headerCfg: { font: "'Inter', sans-serif", topBg: '#7f1d1d' }, footerCfg: { bg: '#1c1917' } }); }
};


/* ══════════════════════════════════════════════════════════════
   THEME 6: IDDEF (iddef.org) → Emanet Vakfı
   Emerald green, Poppins font, federation structure, multi-currency
   ══════════════════════════════════════════════════════════════ */
themeLayouts.iddef = {
  home(o, list) {
    const hCfg = { font: "'Poppins', sans-serif", topBg: '#064e3b', topLeft: '🏛️ Emanet Vakfı — 45 Dernek Federasyonu', topRight: '<span style="font-size:10px; color:#a7f3d0;">₺ TL</span><span style="color:#065f46;">|</span><span style="font-size:10px; color:#a7f3d0;">$ USD</span><span style="color:#065f46;">|</span><span style="font-size:10px; color:#a7f3d0;">€ EUR</span>', ctaText: 'Hızlı Bağış', ctaStyle: 'background:#047857; color:#fff;' };
    return `<div class="site" data-theme="iddef" style="--p:${o.primaryColor};--a:${o.accentColor}; font-family:'Poppins', sans-serif;">
      ${themeHeader(o, hCfg)}
      <main>
        ${themeHeroSlider(o, list, { font: "'Poppins', sans-serif", overlay: 'linear-gradient(135deg, rgba(4,120,87,0.8), rgba(0,0,0,0.3))', height: '500px' })}

        <div style="background:#ecfdf5; padding:20px clamp(18px,5vw,72px); display:grid; grid-template-columns:repeat(4, 1fr); gap:16px; border-bottom:1px solid #a7f3d0;">
          ${['🕌 Zekat', '🐄 Kurban', '📿 Sadaka', '🆘 Acil Yardım'].map(label => `
            <a href="#/demo/${o.slug}/bagis/${label.includes('Zekat') ? 'zekat' : label.includes('Kurban') ? 'kurban' : label.includes('Sadaka') ? 'sadaka' : 'acil-yardim'}" style="text-align:center; padding:12px; background:#fff; border-radius:var(--r); border:1px solid #d1fae5; text-decoration:none; color:var(--ink); font-weight:600; font-size:13px;">${label}</a>
          `).join('')}
        </div>

        ${themeCampaignGrid(o, list, { font: "'Poppins', sans-serif", tabStyle: 'pill', tabActiveBg: '#047857' })}

        <section class="section alt" style="background:#f0fdf4; padding:48px clamp(18px,5vw,72px);">
          <div class="split">${renderZekatCalculator(o)}${renderFaqAccordion()}</div>
        </section>

        <section class="section" style="padding:48px clamp(18px,5vw,72px);">
          <h2 style="text-align:center; margin-bottom:8px;">🌍 55 Ülkede Faaliyet</h2>
          <div class="split" style="gap:28px; align-items:center;">${renderWorldMap()}${renderImpactPanel(o)}</div>
        </section>

        ${themeImpactStats(o, list, { bg: 'linear-gradient(135deg, #064e3b, #047857)' })}
      </main>
      ${themeFooter(o, { bg: '#022c22', font: "'Poppins', sans-serif" })}
    </div>`;
  },
  about(o, list) { return themeAboutPage(o, { font: "'Poppins', sans-serif", heroBg: '#047857', headerCfg: { font: "'Poppins', sans-serif", topBg: '#064e3b' }, footerCfg: { bg: '#022c22', font: "'Poppins', sans-serif" } }); },
  contact(o, list) { return themeContactPage(o, { font: "'Poppins', sans-serif", heroBg: '#047857', headerCfg: { font: "'Poppins', sans-serif", topBg: '#064e3b' }, footerCfg: { bg: '#022c22', font: "'Poppins', sans-serif" } }); }
};


/* ══════════════════════════════════════════════════════════════
   THEME 7: VERENEL (verenel.org) → Veren El
   Burgundy/red, Roboto font, gift card system, social market
   ══════════════════════════════════════════════════════════════ */
themeLayouts.verenel = {
  home(o, list) {
    const hCfg = { font: "'Roboto', sans-serif", topBg: '#881337', topLeft: '🌐 TR | EN | AR — Ankara İnsani Yardım', topRight: '<span style="background:#14b8a6; color:#fff; padding:2px 8px; border-radius:4px; font-size:10px;">🛒 Sepetim</span>', ctaText: 'Bağış Yap', ctaStyle: 'background:#be123c; color:#fff;', extraNav: '<a href="#/demo/' + o.slug + '" class="nav-item">Sosyal Market</a><a href="#/demo/' + o.slug + '" class="nav-item">Hediye Kartı</a>' };
    return `<div class="site" data-theme="verenel" style="--p:${o.primaryColor};--a:${o.accentColor}; font-family:'Roboto', sans-serif;">
      ${themeHeader(o, hCfg)}
      <main>
        ${themeHeroSlider(o, list, { font: "'Roboto', sans-serif", overlay: 'linear-gradient(135deg, rgba(190,18,60,0.75), rgba(0,0,0,0.4))', height: '480px' })}

        <div style="background:#fff1f2; padding:20px clamp(18px,5vw,72px); text-align:center; border-bottom:1px solid #fecdd3;">
          <span style="font-size:1.5rem;">🎁</span>
          <span style="font-size:13px; color:#be123c; font-weight:600; margin-left:8px;">Hediye Kartı ile Bağış — Sevdikleriniz adına bağış hediyesi verin!</span>
        </div>

        ${themeCampaignGrid(o, list, { font: "'Roboto', sans-serif", tabStyle: 'pill', tabActiveBg: '#be123c' })}

        <section class="section alt" style="background:#fdf2f8; padding:48px clamp(18px,5vw,72px);">
          <h2 style="text-align:center; margin-bottom:8px;">🛒 Sosyal Market Projesi</h2>
          <p style="text-align:center; color:var(--muted); font-size:14px; max-width:600px; margin:0 auto 24px;">İhtiyaç sahibi ailelerin market alışverişini karşılayın.</p>
          <div class="split">${renderZekatCalculator(o)}${renderFaqAccordion()}</div>
        </section>

        <section class="section" style="padding:48px clamp(18px,5vw,72px);">
          <div class="split" style="gap:28px; align-items:center;">${renderWorldMap()}${renderImpactPanel(o)}</div>
        </section>

        ${themeImpactStats(o, list, { bg: 'linear-gradient(135deg, #881337, #be123c)' })}
      </main>
      ${themeFooter(o, { bg: '#1c1917', font: "'Roboto', sans-serif" })}
    </div>`;
  },
  about(o, list) { return themeAboutPage(o, { font: "'Roboto', sans-serif", heroBg: '#be123c', headerCfg: { font: "'Roboto', sans-serif", topBg: '#881337' }, footerCfg: { bg: '#1c1917', font: "'Roboto', sans-serif" } }); },
  contact(o, list) { return themeContactPage(o, { font: "'Roboto', sans-serif", heroBg: '#be123c', headerCfg: { font: "'Roboto', sans-serif", topBg: '#881337' }, footerCfg: { bg: '#1c1917', font: "'Roboto', sans-serif" } }); }
};


/* ══════════════════════════════════════════════════════════════
   THEME 8: BESIR (besir.org.tr) → Bereket Derneği
   Teal/turquoise, Inter font, fast donation focus, mobile app highlight
   ══════════════════════════════════════════════════════════════ */
themeLayouts.besir = {
  home(o, list) {
    const hCfg = { font: "'Inter', sans-serif", topBg: '#134e4a', topLeft: '📱 Mobil Uygulamamızı İndirin!', ctaText: 'Hızlı Bağış', ctaStyle: 'background:#0e7490; color:#fff;' };
    return `<div class="site" data-theme="besir" style="--p:${o.primaryColor};--a:${o.accentColor}; font-family:'Inter', sans-serif;">
      ${themeHeader(o, hCfg)}
      <main>
        ${themeHeroSlider(o, list, { font: "'Inter', sans-serif", overlay: 'linear-gradient(135deg, rgba(14,116,144,0.8), rgba(0,0,0,0.3))', height: '500px' })}

        <div style="background:#ecfeff; padding:16px clamp(18px,5vw,72px); display:flex; gap:20px; justify-content:center; border-bottom:1px solid #a5f3fc;">
          <div style="display:flex; align-items:center; gap:8px; font-size:12px; color:#0e7490; font-weight:600;"><span>📱</span> iOS & Android Uygulama</div>
          <div style="display:flex; align-items:center; gap:8px; font-size:12px; color:#0e7490; font-weight:600;"><span>🎥</span> Video Galeri</div>
          <div style="display:flex; align-items:center; gap:8px; font-size:12px; color:#0e7490; font-weight:600;"><span>🏛️</span> Kamu Yararına Dernek</div>
        </div>

        ${themeCampaignGrid(o, list, { font: "'Inter', sans-serif", tabStyle: 'pill', tabActiveBg: '#0e7490' })}

        <section class="section alt" style="background:#f0fdfa; padding:48px clamp(18px,5vw,72px);">
          <div class="split">${renderZekatCalculator(o)}${renderFaqAccordion()}</div>
        </section>

        <section class="section" style="padding:48px clamp(18px,5vw,72px);">
          <div class="split" style="gap:28px; align-items:center;">${renderWorldMap()}${renderImpactPanel(o)}</div>
        </section>

        ${renderTransparencyChart(o)}
        ${themeImpactStats(o, list, { bg: 'linear-gradient(135deg, #134e4a, #0e7490)' })}
      </main>
      ${themeFooter(o, { bg: '#042f2e', font: "'Inter', sans-serif" })}
    </div>`;
  },
  about(o, list) { return themeAboutPage(o, { font: "'Inter', sans-serif", heroBg: '#0e7490', headerCfg: { font: "'Inter', sans-serif", topBg: '#134e4a' }, footerCfg: { bg: '#042f2e' } }); },
  contact(o, list) { return themeContactPage(o, { font: "'Inter', sans-serif", heroBg: '#0e7490', headerCfg: { font: "'Inter', sans-serif", topBg: '#134e4a' }, footerCfg: { bg: '#042f2e' } }); }
};


/* ══════════════════════════════════════════════════════════════
   THEME 9: HAYRAT (hayratyardim.org) → Hayrat Köprüsü
   Forest green, Quicksand, sponsorship tracking, preset donations
   ══════════════════════════════════════════════════════════════ */
themeLayouts.hayrat = {
  home(o, list) {
    const hCfg = { font: "'Quicksand', sans-serif", topBg: '#14532d', topLeft: '📖 Dünya Kur\'an Okuyor — 70 Ülkede Faaliyet', topRight: '<span style="font-size:10px; color:#86efac;">TR</span><span style="color:#166534;">|</span><span style="font-size:10px; color:#86efac;">EN</span>', ctaText: 'Hızlı Bağış', ctaStyle: 'background:#166534; color:#fff;' };
    return `<div class="site" data-theme="hayrat" style="--p:${o.primaryColor};--a:${o.accentColor}; font-family:'Quicksand', sans-serif;">
      ${themeHeader(o, hCfg)}
      <main>
        <div style="background:#166534; padding:10px clamp(18px,5vw,72px); display:flex; justify-content:center; gap:12px; align-items:center;">
          <span style="color:#fff; font-size:12px; font-weight:700;">⚡ Hızlı Bağış:</span>
          ${[50, 100, 200, 500].map(amt => `
            <a href="#/demo/${o.slug}/bagis/acil-yardim" style="background:#fff; color:#166534; padding:6px 14px; border-radius:6px; font-weight:bold; font-size:12px; text-decoration:none;">${amt}₺</a>
          `).join('')}
        </div>

        ${themeHeroSlider(o, list, { font: "'Quicksand', sans-serif", overlay: 'linear-gradient(135deg, rgba(22,101,52,0.75), rgba(0,0,0,0.4))', height: '500px' })}

        <div style="background:#f0fdf4; padding:24px clamp(18px,5vw,72px); display:grid; grid-template-columns:repeat(4, 1fr); gap:16px; text-align:center; border-bottom:1px solid #bbf7d0;">
          <div><b style="font-size:1.8rem; color:#166534; display:block;">70</b><span style="font-size:12px; color:var(--muted);">Ülke</span></div>
          <div><b style="font-size:1.8rem; color:#166534; display:block;">300+</b><span style="font-size:12px; color:var(--muted);">Koordinasyon Merkezi</span></div>
          <div><b style="font-size:1.8rem; color:#166534; display:block;">3.7M</b><span style="font-size:12px; color:var(--muted);">Kişiye Ulaşıldı</span></div>
          <div><b style="font-size:1.8rem; color:#166534; display:block;">1000+</b><span style="font-size:12px; color:var(--muted);">Aktif Hamil</span></div>
        </div>

        ${themeCampaignGrid(o, list, { font: "'Quicksand', sans-serif", tabStyle: 'pill', tabActiveBg: '#166534' })}

        <section class="section alt" style="background:#f8faf8; padding:48px clamp(18px,5vw,72px);">
          <div class="split">${renderZekatCalculator(o)}${renderFaqAccordion()}</div>
        </section>

        <section class="section" style="padding:48px clamp(18px,5vw,72px);">
          <div class="split" style="gap:28px; align-items:center;">${renderWorldMap()}${renderImpactPanel(o)}</div>
        </section>

        ${themeImpactStats(o, list, { bg: 'linear-gradient(135deg, #14532d, #166534)' })}
      </main>
      ${themeFooter(o, { bg: '#052e16', font: "'Quicksand', sans-serif" })}
    </div>`;
  },
  about(o, list) { return themeAboutPage(o, { font: "'Quicksand', sans-serif", heroBg: '#166534', headerCfg: { font: "'Quicksand', sans-serif", topBg: '#14532d' }, footerCfg: { bg: '#052e16', font: "'Quicksand', sans-serif" } }); },
  contact(o, list) { return themeContactPage(o, { font: "'Quicksand', sans-serif", heroBg: '#166534', headerCfg: { font: "'Quicksand', sans-serif", topBg: '#14532d' }, footerCfg: { bg: '#052e16', font: "'Quicksand', sans-serif" } }); }
};


/* ══════════════════════════════════════════════════════════════
   THEME 10: GOZYASI (gozyasi.org) → Gözyaşı İyilik
   Purple/violet, Outfit font, emotional imagery, Hafiz sponsorship
   ══════════════════════════════════════════════════════════════ */
themeLayouts.gozyasi = {
  home(o, list) {
    const hCfg = { font: "'Outfit', sans-serif", topBg: '#3b0764', topLeft: '💜 Gözyaşı İyilik Vakfı — Ankara', ctaText: 'Bağış Yap', ctaStyle: 'background:#6d28d9; color:#fff;' };
    return `<div class="site" data-theme="gozyasi" style="--p:${o.primaryColor};--a:${o.accentColor}; font-family:'Outfit', sans-serif;">
      ${themeHeader(o, hCfg)}
      <main>
        ${themeHeroSlider(o, list, { font: "'Outfit', sans-serif", overlay: 'linear-gradient(135deg, rgba(109,40,217,0.75), rgba(251,113,133,0.3))', height: '520px', contentPos: 'center' })}

        <div style="background:#faf5ff; padding:16px clamp(18px,5vw,72px); text-align:center; border-bottom:1px solid #e9d5ff;">
          <span style="font-size:13px; color:#6d28d9; font-weight:600;">📖 Hafız Sponsorluk Programı — Bir hafızın eğitimine destek olun</span>
        </div>

        ${themeCampaignGrid(o, list, { font: "'Outfit', sans-serif", tabStyle: 'pill', tabActiveBg: '#6d28d9' })}

        <section class="section alt" style="background:#faf5ff; padding:48px clamp(18px,5vw,72px);">
          <div class="split">${renderZekatCalculator(o)}${renderFaqAccordion()}</div>
        </section>

        <section class="section" style="padding:48px clamp(18px,5vw,72px);">
          <h2 style="text-align:center; margin-bottom:8px;">🌍 Faaliyet Alanlarımız</h2>
          <div class="split" style="gap:28px; align-items:center;">${renderWorldMap()}${renderImpactPanel(o)}</div>
        </section>

        ${themeImpactStats(o, list, { bg: 'linear-gradient(135deg, #3b0764, #6d28d9)' })}
      </main>
      ${themeFooter(o, { bg: '#1e1b4b', font: "'Outfit', sans-serif" })}
    </div>`;
  },
  about(o, list) { return themeAboutPage(o, { font: "'Outfit', sans-serif", heroBg: '#6d28d9', headerCfg: { font: "'Outfit', sans-serif", topBg: '#3b0764' }, footerCfg: { bg: '#1e1b4b', font: "'Outfit', sans-serif" } }); },
  contact(o, list) { return themeContactPage(o, { font: "'Outfit', sans-serif", heroBg: '#6d28d9', headerCfg: { font: "'Outfit', sans-serif", topBg: '#3b0764' }, footerCfg: { bg: '#1e1b4b', font: "'Outfit', sans-serif" } }); }
};


/* ══════════════════════════════════════════════════════════════
   THEME 11: HICRET DERNEGI (hicretdernegi.org)
   Islamic Education School Theme, Emerald Green & Blue highlights
   ══════════════════════════════════════════════════════════════ */
themeLayouts.hicretdernegi = {
  home(o, list) {
    const headCfg = {
      font: "'Poppins', sans-serif",
      topBg: '#043425',
      topLeft: '📖 Hicret Medresesi İslami Eğitim Kurumu',
      ctaText: 'GÖNÜLDEN BAĞIŞ',
      logoStyle: `background:url('/images/hicret/logooo.png') center/cover; border-radius:50%;`,
      ctaStyle: 'background:#059669; color:#fff; border-radius:99px; padding:8px 24px;',
      extraNav: `<a href="#/demo/${o.slug}/hakkimizda" class="nav-item" style="color:#047857; font-weight:700;">Medresemiz</a>`
    };

    // Custom Hero Slides directly referencing their local copied images
    const slides = [
      { visual: "/images/hicret/talebe 1.png", title: "HİCRET DERNEĞİ", subtitle: "Eğitim Yuvamıza Hoş Geldiniz", desc: "Modern pedagoji ile geleneksel İslami değerleri buluşturan eğitim anlayışımızla geleceğin Müslüman nesillerini yetiştiriyoruz." },
      { visual: "/images/hicret/talebe 2.png", title: "KALİTELİ EĞİTİM", subtitle: "Deneyimli Kadromuzla", desc: "15+ tecrübeli eğitimcimiz ile İslami değerleri modern öğretim yöntemleriyle harmanlayan eğitim programları sunuyoruz." },
      { visual: "/images/hicret/talebe 3.png", title: "4 FARKLI BÖLÜM", subtitle: "Her Yaş İçin Özel Program", desc: "Sıbyan, İbtida, Hafızlık ve Arapça bölümlerimizle çocuğunuzun yaşına uygun kapsamlı İslami eğitim veriyoruz." },
      { visual: "/images/hicret/talebe 4.png", title: "GÜVENLİ ÇEVRE", subtitle: "Aile Ortamında Eğitim", desc: "Huzurlu ve güvenli medrese ortamımızda çocuklarınız hem dinî eğitimlerini alıyor hem de karakter gelişimlerini tamamlıyor." }
    ];

    const cs = state.currentSlideIndex || 0;

    return `<div class="site" data-theme="hicretdernegi" style="--p:#065f46;--a:#0284c7; font-family:'Poppins', sans-serif; background:#f9fafb;">
      
      <!-- Custom Header matching Next.js design -->
      <div style="background:#043425; color:#cbd5e1; padding:6px 20px; display:flex; justify-content:space-between; align-items:center; font-size:11px; font-weight:600; font-family:'Poppins',sans-serif;">
        <div>📖 Hicret Medresesi İslami Eğitim Kurumu</div>
        <div style="display:flex; gap:16px;">
          <a href="#/bagisci" style="color:#cbd5e1; text-decoration:none;">👤 Bağışçı Girişi</a>
          <span>|</span>
          <a href="#/admin" style="color:#cbd5e1; text-decoration:none;">⚙️ Otomasyon</a>
        </div>
      </div>
      
      <header class="site-head" style="background:#fff; border-bottom:2px solid #059669; padding:12px 24px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
        <a class="brand" href="#/demo/${o.slug}" style="display:flex; align-items:center; gap:12px; text-decoration:none;">
          <img src="/images/hicret/logooo.png" style="width:50px; height:50px; border-radius:50%; border:2px solid #059669;" />
          <div>
            <h1 style="font-size:1.15rem; font-weight:800; color:#065f46; margin:0; line-height:1.2;">HİCRET DERNEĞİ</h1>
            <p style="font-size:10px; color:#0284c7; font-weight:700; margin:0; text-transform:uppercase; letter-spacing:0.5px;">İslami Eğitim Kurumu</p>
          </div>
        </a>
        <nav style="display:flex; gap:20px; align-items:center;">
          <a href="#/demo/${o.slug}" style="color:#065f46; font-weight:700; text-decoration:none; font-size:14px;">Ana Sayfa</a>
          <a href="#/demo/${o.slug}/bagis/zekat" style="color:#475569; font-weight:600; text-decoration:none; font-size:14px;">Zekat</a>
          <a href="#/demo/${o.slug}/bagis/kurban" style="color:#475569; font-weight:600; text-decoration:none; font-size:14px;">Kurban</a>
          <a href="#/demo/${o.slug}/hakkimizda" style="color:#475569; font-weight:600; text-decoration:none; font-size:14px;">Hakkımızda</a>
          <a href="#/demo/${o.slug}/iletisim" style="color:#475569; font-weight:600; text-decoration:none; font-size:14px;">İletişim</a>
        </nav>
        <div style="display:flex; gap:10px;">
          <a href="#/demo/${o.slug}/iletisim" style="background:#2563eb; color:#fff; text-decoration:none; font-size:12px; font-weight:700; padding:8px 18px; border-radius:99px; box-shadow:0 4px 10px rgba(37,99,235,0.2);">BAŞVURU YAP</a>
          <a href="#/demo/${o.slug}/bagis/acil-yardim" style="background:#059669; color:#fff; text-decoration:none; font-size:12px; font-weight:700; padding:8px 18px; border-radius:99px; box-shadow:0 4px 10px rgba(5,150,105,0.2);">BAĞIŞ YAP</a>
        </div>
      </header>

      <main>
        <!-- Custom Hero Slider -->
        <section style="position:relative; height:500px; overflow:hidden; background:#043425;">
          ${slides.map((s, idx) => `
            <div style="display:${idx === cs ? 'flex' : 'none'}; position:absolute; inset:0; background:linear-gradient(rgba(4,52,37,0.85), rgba(4,52,37,0.4)), url('${s.visual}') center/cover no-repeat; align-items:center; padding:0 clamp(20px,8vw,100px); transition:opacity 1s ease-in-out;">
              <div style="max-width:650px; color:#fff;">
                <span style="background:#0284c7; color:#fff; font-size:10px; font-weight:800; padding:4px 12px; border-radius:20px; text-transform:uppercase; letter-spacing:1px; display:inline-block; margin-bottom:16px;">${s.title}</span>
                <h1 style="font-size:2.8rem; font-weight:800; line-height:1.2; margin:0 0 12px; text-shadow:0 2px 4px rgba(0,0,0,0.3);">${s.subtitle}</h1>
                <p style="font-size:15px; line-height:1.6; color:#e2e8f0; margin-bottom:24px;">${s.desc}</p>
                <a href="#/demo/${o.slug}/bagis/acil-yardim" style="background:#059669; color:#fff; font-size:13px; font-weight:700; padding:12px 28px; border-radius:99px; text-decoration:none; display:inline-flex; align-items:center; gap:8px; box-shadow:0 6px 15px rgba(5,150,105,0.3);">Hemen Bağış Yap ➔</a>
              </div>
            </div>
          `).join('')}
          <!-- Slide dots -->
          <div style="position:absolute; bottom:20px; left:50%; transform:translateX(-50%); display:flex; gap:8px;">
            ${slides.map((_, idx) => `
              <span data-slide-dot="${idx}" style="width:${idx === cs ? '24px' : '8px'}; height:8px; border-radius:4px; background:${idx === cs ? '#059669' : 'rgba(255,255,255,0.4)'}; cursor:pointer; transition:all 0.3s;"></span>
            `).join('')}
          </div>
        </section>

        <!-- Slider altı hızlı bildirim -->
        <div style="background:#ecfdf5; border-bottom:1px solid #d1fae5; padding:16px clamp(18px,5vw,72px); display:flex; align-items:center; gap:12px; justify-content:space-between; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:8px; color:#065f46; font-size:13px; font-weight:700;">
            <span>📢</span> Kış dönemi talebe kayıtlarımız devam etmektedir. Detaylı bilgi için başvuru yapabilirsiniz.
          </div>
          <a href="#/demo/${o.slug}/iletisim" style="background:#065f46; color:#fff; text-decoration:none; font-size:11px; font-weight:700; padding:6px 16px; border-radius:20px;">Başvuru Sayfası ➔</a>
        </div>

        <!-- Medrese Eğitim Bölümleri Bölgesi -->
        <section class="section" style="background:#fff; padding:60px clamp(18px,5vw,72px);">
          <div style="text-align:center; max-width:700px; margin:0 auto 40px;">
            <span style="color:#0284c7; font-size:11px; font-weight:800; letter-spacing:1px; text-transform:uppercase;">EĞİTİM PROGRAMLARIMIZ</span>
            <h2 style="font-size:2rem; font-weight:800; color:#065f46; margin:8px 0 0;">Yavrularımız İçin 4 Özel Eğitim Bölümü</h2>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:20px;">
            <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:16px; padding:24px; text-align:center;">
              <span style="font-size:2rem; display:block; margin-bottom:12px;">👶</span>
              <h3 style="font-size:1.1rem; font-weight:700; color:#065f46; margin:0 0 8px;">Sıbyan Mektebi</h3>
              <p style="font-size:12px; color:#64748b; line-height:1.6; margin:0;">4-7 yaş grubu miniklerimiz için eğlenerek öğrenme, Kur'an harfleri ve adap dersleri.</p>
            </div>
            <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:16px; padding:24px; text-align:center;">
              <span style="font-size:2rem; display:block; margin-bottom:12px;">📖</span>
              <h3 style="font-size:1.1rem; font-weight:700; color:#065f46; margin:0 0 8px;">İbtida Sınıfı</h3>
              <p style="font-size:12px; color:#64748b; line-height:1.6; margin:0;">8-12 yaş grubu öğrencilerimiz için temel dini bilgiler, Kur'an-ı Kerim tecvidli okuma.</p>
            </div>
            <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:16px; padding:24px; text-align:center;">
              <span style="font-size:2rem; display:block; margin-bottom:12px;">🕌</span>
              <h3 style="font-size:1.1rem; font-weight:700; color:#065f46; margin:0 0 8px;">Hafızlık Eğitimi</h3>
              <p style="font-size:12px; color:#64748b; line-height:1.6; margin:0;">Ezber yeteneği güçlü talebelerimiz için yatılı ve gündüzlü hafızlık hazırlık ve ezber sınıfları.</p>
            </div>
            <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:16px; padding:24px; text-align:center;">
              <span style="font-size:2rem; display:block; margin-bottom:12px;">📚</span>
              <h3 style="font-size:1.1rem; font-weight:700; color:#065f46; margin:0 0 8px;">Arapça ve İslami İlimler</h3>
              <p style="font-size:12px; color:#64748b; line-height:1.6; margin:0;">Hafızlığını tamamlayan veya lise çağındaki öğrencilerimiz için emsile, bina, maksut ve fıkıh dersleri.</p>
            </div>
          </div>
        </section>

        <!-- Dinamik Kampanyalar -->
        ${themeCampaignGrid(o, list, { font: "'Poppins', sans-serif", tabStyle: 'pill', tabActiveBg: '#059669', sectionBg: '#f9fafb' })}

        <!-- Zekat Hesaplayıcı ve İletişim -->
        <section class="section" style="background:#fff; padding:60px clamp(18px,5vw,72px);">
          <div class="split">${renderZekatCalculator(o)}${renderFaqAccordion()}</div>
        </section>

        ${themeImpactStats(o, list, { bg: 'linear-gradient(135deg, #043425, #059669)' })}
      </main>
      ${themeFooter(o, { bg: '#032017', font: "'Poppins', sans-serif" })}
    </div>`;
  },
  about(o, list) { return themeAboutPage(o, { font: "'Poppins', sans-serif", heroBg: '#059669', headerCfg: { font: "'Poppins', sans-serif", topBg: '#043425' }, footerCfg: { bg: '#032017' } }); },
  contact(o, list) { return themeContactPage(o, { font: "'Poppins', sans-serif", heroBg: '#059669', headerCfg: { font: "'Poppins', sans-serif", topBg: '#043425' }, footerCfg: { bg: '#032017' } }); }
};


/* ══════════════════════════════════════════════════════════════
   THEME 12: KARDESLIK PAYI (kardeslikpayi.org)
   Modern Turkuaz/Teal NGO, soft cards, quick donation widget
   ══════════════════════════════════════════════════════════════ */
themeLayouts.kardeslikpayi = {
  home(o, list) {
    const headCfg = {
      font: "'Outfit', sans-serif",
      topBg: '#0d1b1e',
      topLeft: '🤝 Paylaşmak Kardeşliktir | Kardeşlik Payı Derneği',
      logoStyle: `background:url('/images/kardeslik/logo.png') center/cover;`,
      ctaText: 'Hızlı Bağış',
      ctaStyle: 'background:#0f766e; color:#fff;'
    };

    const cs = state.currentSlideIndex || 0;
    const slides = [
      { visual: "/images/kardeslik/genel-bagislar.png", title: "GENEL BAĞIŞLAR", subtitle: "Paylaşmak Kardeşliktir", desc: "Zekat, sadaka, gıda kolisi ve eğitim bursu yardımlarınızla binlerce ihtiyaç sahibi ailenin yüzünü güldürüyoruz." },
      { visual: "/images/kardeslik/mahmud-ustaosmanoglu-hazretleri-ks-su-kuyusu-projesi.png", title: "SU KUYUSU PROJESİ", subtitle: "Mahmud Ustaosmanoğlu Hz. Su Kuyuları", desc: "Afrika ve Asya'nın kurak topraklarında temiz suya erişimi olmayan kardeşlerimize can suyu oluyoruz." },
      { visual: "/images/kardeslik/haci-ali-elcin-camii-insaati.png", title: "KALICI ESERLER", subtitle: "Cami ve Mescit İnşaatları", desc: "Müslümanların cemaatle ibadet edebileceği, yavrularımızın Kur'an eğitimi alabileceği cami ve külliyeler inşa ediyoruz." }
    ];

    return `<div class="site" data-theme="kardeslikpayi" style="--p:#0f766e;--a:#f59e0b; font-family:'Outfit', sans-serif; background:#f8fafc;">
      
      <!-- Custom Header matching original style -->
      <div style="background:#0d1b1e; color:#cbd5e1; padding:6px 24px; display:flex; justify-content:space-between; align-items:center; font-size:11px; font-weight:600; font-family:'Outfit',sans-serif;">
        <div>🤝 Paylaşmak Kardeşliktir | Kardeşlik Payı Derneği</div>
        <div style="display:flex; gap:16px;">
          <a href="#/bagisci" style="color:#cbd5e1; text-decoration:none;">👤 Bağışçı Paneli</a>
          <span>|</span>
          <a href="#/admin" style="color:#cbd5e1; text-decoration:none;">⚙️ Yönetici Girişi</a>
        </div>
      </div>

      <header class="site-head" style="background:#fff; border-bottom:3px solid #0f766e; padding:14px 28px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 4px 15px rgba(0,0,0,0.03);">
        <a class="brand" href="#/demo/${o.slug}" style="display:flex; align-items:center; gap:10px; text-decoration:none;">
          <img src="/images/kardeslik/logo.png" style="width:48px; height:48px; border-radius:8px;" />
          <div>
            <h1 style="font-size:1.2rem; font-weight:900; color:#0f766e; margin:0; line-height:1.2;">KARDEŞLİK PAYI</h1>
            <p style="font-size:10px; color:#f59e0b; font-weight:800; margin:0; letter-spacing:1px; text-transform:uppercase;">Yardımlaşma Derneği</p>
          </div>
        </a>
        <nav style="display:flex; gap:20px; align-items:center;">
          <a href="#/demo/${o.slug}" style="color:#0f766e; font-weight:800; text-decoration:none; font-size:14.5px;">Ana Sayfa</a>
          <a href="#/demo/${o.slug}/bagis/su-kuyusu" style="color:#475569; font-weight:600; text-decoration:none; font-size:14.5px;">Su Kuyusu</a>
          <a href="#/demo/${o.slug}/bagis/yetim" style="color:#475569; font-weight:600; text-decoration:none; font-size:14.5px;">Yetim</a>
          <a href="#/demo/${o.slug}/bagis/kurban" style="color:#475569; font-weight:600; text-decoration:none; font-size:14.5px;">Kurban</a>
          <a href="#/demo/${o.slug}/iletisim" style="color:#475569; font-weight:600; text-decoration:none; font-size:14.5px;">İletişim</a>
        </nav>
        <a href="#/demo/${o.slug}/bagis/acil-yardim" style="background:#0f766e; color:#fff; text-decoration:none; font-size:12.5px; font-weight:800; padding:10px 24px; border-radius:8px; box-shadow:0 4px 12px rgba(15,118,110,0.25);">ŞİMDİ BAĞIŞ YAP</a>
      </header>

      <main>
        <!-- Custom Hero Slider -->
        <section style="position:relative; height:520px; overflow:hidden; background:#0d1b1e;">
          ${slides.map((s, idx) => `
            <div style="display:${idx === cs ? 'flex' : 'none'}; position:absolute; inset:0; background:linear-gradient(to right, rgba(13,27,30,0.9), rgba(13,27,30,0.5)), url('${s.visual}') center/cover no-repeat; align-items:center; padding:0 clamp(20px,8vw,100px);">
              <div style="max-width:650px; color:#fff;">
                <span style="background:#f59e0b; color:#1e293b; font-size:10px; font-weight:800; padding:4px 14px; border-radius:4px; text-transform:uppercase; letter-spacing:1px; display:inline-block; margin-bottom:18px;">${s.title}</span>
                <h1 style="font-size:2.8rem; font-weight:900; line-height:1.15; margin:0 0 16px; text-shadow:0 2px 4px rgba(0,0,0,0.4);">${s.subtitle}</h1>
                <p style="font-size:15.5px; line-height:1.6; color:#94a3b8; margin-bottom:28px;">${s.desc}</p>
                <a href="#/demo/${o.slug}/bagis/acil-yardim" style="background:#0f766e; color:#fff; font-size:13.5px; font-weight:800; padding:14px 32px; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:8px; box-shadow:0 6px 20px rgba(15,118,110,0.3);">Gönülden Destek Ol ➔</a>
              </div>
            </div>
          `).join('')}
          <!-- Slide dots -->
          <div style="position:absolute; bottom:20px; left:50%; transform:translateX(-50%); display:flex; gap:8px;">
            ${slides.map((_, idx) => `
              <span data-slide-dot="${idx}" style="width:${idx === cs ? '24px' : '8px'}; height:8px; border-radius:4px; background:${idx === cs ? '#f59e0b' : 'rgba(255,255,255,0.4)'}; cursor:pointer; transition:all 0.3s;"></span>
            `).join('')}
          </div>
        </section>

        <!-- Kardeşlik Şeridi -->
        <div style="background:#f0fdfa; border-bottom:1px solid #ccfbf1; padding:20px clamp(18px,5vw,72px); display:flex; justify-content:center; align-items:center; gap:32px; flex-wrap:wrap;">
          <div style="font-size:13px; color:#0f766e; font-weight:700; display:flex; align-items:center; gap:6px;"><span>✓</span> Güvenli Altyapı</div>
          <div style="font-size:13px; color:#0f766e; font-weight:700; display:flex; align-items:center; gap:6px;"><span>✓</span> Resmi Kurul Onaylı</div>
          <div style="font-size:13px; color:#0f766e; font-weight:700; display:flex; align-items:center; gap:6px;"><span>✓</span> Fotoğraflı & Videolu Geri Bildirim</div>
        </div>

        <!-- Dinamik Kampanya Kartları -->
        ${themeCampaignGrid(o, list, { font: "'Outfit', sans-serif", tabStyle: 'pill', tabActiveBg: '#0f766e', sectionBg: '#fff' })}

        <!-- Zekat Paneli -->
        <section class="section alt" style="background:#f8fafc; padding:60px clamp(18px,5vw,72px);">
          <div class="split">${renderZekatCalculator(o)}${renderFaqAccordion()}</div>
        </section>

        <!-- Faaliyet Haritası -->
        <section class="section" style="background:#fff; padding:60px clamp(18px,5vw,72px);">
          <h2 style="text-align:center; color:#0f766e; font-weight:800; margin-bottom:32px;">🌍 Dünyada Kardeşlik Köprüleri</h2>
          <div class="split" style="gap:28px; align-items:center;">${renderWorldMap()}${renderImpactPanel(o)}</div>
        </section>

        ${themeImpactStats(o, list, { bg: 'linear-gradient(135deg, #0d1b1e, #0f766e)' })}
      </main>
      ${themeFooter(o, { bg: '#0a1416', font: "'Outfit', sans-serif" })}
    </div>`;
  },
  about(o, list) { return themeAboutPage(o, { font: "'Outfit', sans-serif", heroBg: '#0f766e', headerCfg: { font: "'Outfit', sans-serif", topBg: '#0d1b1e' }, footerCfg: { bg: '#0a1416' } }); },
  contact(o, list) { return themeContactPage(o, { font: "'Outfit', sans-serif", heroBg: '#0f766e', headerCfg: { font: "'Outfit', sans-serif", topBg: '#0d1b1e' }, footerCfg: { bg: '#0a1416' } }); }
};

