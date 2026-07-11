/* ============================================================
   E-İNFAK THEME LAYOUTS — 10 Unique STK Website Clones
   Each theme provides: home(o, list), about(o, list), contact(o, list)
   ============================================================ */

const themeLayouts = {};

/* ──────────────────────────────────────────────────────────────
   DYNAMIC WIDGET HELPERS FOR NEXT.JS ALIGNMENT
   ────────────────────────────────────────────────────────────── */
function renderKpQuickDonation(o) {
  const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
  const donationId = state.kp_donationId || 'acil-yardim';
  const amount = state.kp_amount || '100';
  const dropdown = !!state.kp_dropdown;

  const donationOptions = [
    { id: 'acil-yardim', title: 'ACİL YARDIM', description: 'En acil ihtiyaç duyulan afet bölgelerine', color: '#174C3B', icon: '❤️' },
    { id: 'zekat', title: 'ZEKAT', description: 'Dini hassasiyetler gözetilerek ihtiyaç sahiplerine', color: '#174C3B', icon: '🌙' },
    { id: 'fitre-fidye', title: 'FİTRE & FİDYE', description: 'Ramazan ayı fitre ve fidye bağışları', color: '#174C3B', icon: '🎁' },
    { id: 'sadaka', title: 'SADAKA', description: 'Gönüllü olarak verilen hayır ve sadakalar', color: '#174C3B', icon: '✨' },
    { id: 'hafizlik', title: 'EĞİTİM BURSU', description: 'Afrika medrese talebelerine eğitim desteği', color: '#174C3B', icon: '📖' },
    { id: 'kuran-hediye', title: 'KİTAP YARDIMI', description: 'Medrese öğrencileri için Kur\'an hediyesi', color: '#174C3B', icon: '📚' },
    { id: 'kurban', title: 'KURBAN BAĞIŞI', description: 'Afrika ülkelerinde kurban organizasyonu', color: '#B91C1C', icon: '🌍' },
    { id: 'su-kuyusu', title: 'SU KUYUSU', description: 'Afrika ve Asya\'da temiz su kuyusu projeleri', color: '#174C3B', icon: '💧' }
  ];

  const selected = donationOptions.find(opt => opt.id === donationId) || donationOptions[0];

  return `
    <section style="position:relative; padding:60px 24px; background:linear-gradient(to bottom right, #f8fafc, #fff, #f0fdf4);">
      <div style="max-width:1100px; margin:0 auto;">
        
        <div style="text-align:center; margin-bottom:48px;">
          <div style="display:inline-flex; align-items:center; gap:12px; background:#fff; padding:12px 28px; border-radius:99px; border:1px solid #ccfbf1; box-shadow:0 10px 25px rgba(0,0,0,0.03); margin-bottom:20px;">
            <div style="width:40px; height:40px; background:#174C3B; color:#fff; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">❤️</div>
            <div style="text-align:left;">
              <div style="font-size:10px; font-weight:700; color:#174C3B; text-transform:uppercase;">Hayırseverlik</div>
              <div style="font-size:15px; font-weight:800; color:#174C3B;">Hızlı Bağış</div>
            </div>
          </div>
          <h2 style="font-size:2.2rem; font-weight:900; color:#174C3B; margin:0 0 8px;">Umuda Dokunun</h2>
          <p style="font-size:14px; color:#475569; max-width:600px; margin:0 auto;">Afrika'daki kardeşlerimize ulaştırdığımız yardımlarda siz de yer alın.<br>Birkaç tıkla bağış yapın, hayat değiştirin.</p>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:40px; align-items:center;">
          
          <div style="background:#fff; border:1px solid #e2e8f0; padding:32px; border-radius:24px; box-shadow:0 15px 35px rgba(0,0,0,0.02); position:relative;">
            <div style="margin-bottom:20px; position:relative;">
              <label style="display:block; font-size:14px; font-weight:800; color:#174C3B; margin-bottom:8px;">Bağış Kategorisi Seçin</label>
              
              <button onclick="state.kp_dropdown = !state.kp_dropdown; render();" style="width:100%; text-align:left; background:#fff; border:2px solid rgba(23,76,59,0.2); padding:16px; border-radius:16px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                <div style="display:flex; align-items:center; gap:12px;">
                  <div style="width:40px; height:40px; background:${selected.color}; color:#fff; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:1.3rem;">${selected.icon}</div>
                  <div>
                    <div style="font-weight:700; color:#1e293b; font-size:13.5px;">${selected.title}</div>
                    <div style="font-size:11.5px; color:#64748b;">${selected.description}</div>
                  </div>
                </div>
                <span style="font-size:12px; color:#64748b;">▼</span>
              </button>

              ${dropdown ? `
                <div style="position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid #e2e8f0; border-radius:16px; box-shadow:0 15px 30px rgba(0,0,0,0.1); z-index:100; max-height:280px; overflow-y:auto; margin-top:8px; padding:8px;">
                  ${donationOptions.map(opt => `
                    <button onclick="state.kp_donationId = '${opt.id}'; state.kp_dropdown = false; render();" style="width:100%; border:0; background:none; text-align:left; padding:10px 12px; border-radius:8px; display:flex; align-items:center; gap:12px; cursor:pointer; hover:background:#f8fafc;">
                      <div style="width:36px; height:36px; background:${opt.color}; color:#fff; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0;">${opt.icon}</div>
                      <div>
                        <div style="font-weight:700; color:#1e293b; font-size:12.5px;">${opt.title}</div>
                        <div style="font-size:11px; color:#64748b;">${opt.description}</div>
                      </div>
                    </button>
                  `).join('')}
                </div>
              ` : ''}
            </div>

            <div style="margin-bottom:20px;">
              <label style="display:block; font-size:14px; font-weight:800; color:#1e293b; margin-bottom:10px;">Bağış Miktarı</label>
              <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:8px; margin-bottom:12px;">
                ${[50, 100, 250, 500, 1000].map(amt => `
                  <button onclick="state.kp_amount = '${amt}'; render();" style="border:${amount === amt.toString() ? '2px solid #174C3B' : '2px solid rgba(23,76,59,0.1)'}; background:${amount === amt.toString() ? '#174C3B' : '#fff'}; color:${amount === amt.toString() ? '#fff' : '#1e293b'}; font-weight:700; padding:10px 4px; border-radius:12px; font-size:12px; cursor:pointer; text-align:center; box-sizing:border-box;">${amt}₺</button>
                `).join('')}
              </div>
              <div style="position:relative;">
                <input type="number" value="${amount}" oninput="state.kp_amount = this.value; render();" placeholder="Özel miktar girin" style="width:100%; border:2px solid rgba(23,76,59,0.2); padding:12px 36px 12px 16px; border-radius:16px; font-size:14px; font-weight:700; color:#1e293b; outline:none; box-sizing:border-box;" />
                <span style="position:absolute; right:16px; top:50%; transform:translateY(-50%); font-weight:700; color:#64748b;">₺</span>
              </div>
            </div>

            <a href="${prefix}/bagis/${donationId}?amount=${amount}" style="display:flex; justify-content:center; align-items:center; gap:8px; width:100%; background:#93740C; color:#fff; text-decoration:none; padding:16px; border-radius:16px; font-weight:800; font-size:16px; box-shadow:0 8px 20px rgba(147,116,12,0.2); text-align:center; box-sizing:border-box;">Bağış Yap ➔</a>

          </div>

          <div style="display:flex; flex-direction:column; gap:20px;">
            <div style="background:rgba(255,255,255,0.7); border:1px solid #e2e8f0; padding:24px; border-radius:20px; display:flex; gap:16px; align-items:start; box-shadow:0 10px 25px rgba(0,0,0,0.01);">
              <div style="width:48px; height:48px; background:#174C3B; color:#fff; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.5rem; flex-shrink:0;">⚡</div>
              <div>
                <h4 style="font-size:15px; font-weight:800; color:#1e293b; margin:0 0 6px;">Anında İşlem</h4>
                <p style="font-size:12.5px; color:#64748b; line-height:1.5; margin:0;">Bağışınız anında işleme alınır ve hızla ihtiyaç sahiplerine ulaştırılır.</p>
              </div>
            </div>
            <div style="background:rgba(255,255,255,0.7); border:1px solid #e2e8f0; padding:24px; border-radius:20px; display:flex; gap:16px; align-items:start; box-shadow:0 10px 25px rgba(0,0,0,0.01);">
              <div style="width:48px; height:48px; background:#174C3B; color:#fff; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.5rem; flex-shrink:0;">✨</div>
              <div>
                <h4 style="font-size:15px; font-weight:800; color:#1e293b; margin:0 0 6px;">Şeffaf Süreç</h4>
                <p style="font-size:12.5px; color:#64748b; line-height:1.5; margin:0;">Bağışınızın nereye gittiğini fotoğraf ve video raporlarıyla takip edebilirsiniz.</p>
              </div>
            </div>
            <div style="background:rgba(255,255,255,0.7); border:1px solid #e2e8f0; padding:24px; border-radius:20px; display:flex; gap:16px; align-items:start; box-shadow:0 10px 25px rgba(0,0,0,0.01);">
              <div style="width:48px; height:48px; background:#174C3B; color:#fff; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.5rem; flex-shrink:0;">🌍</div>
              <div>
                <h4 style="font-size:15px; font-weight:800; color:#1e293b; margin:0 0 6px;">Küresel Etki</h4>
                <p style="font-size:12.5px; color:#64748b; line-height:1.5; margin:0;">Afrika ve Asya'da temiz su, kurban ve eğitim projeleriyle binlerce hayata dokunuyoruz.</p>
              </div>
            </div>
          </div>

        </div>

      </div>
    </section>
  `;
}

function renderHicretQuickDonation(o) {
  const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
  const popular = [
    { name: 'Hafız Yetiştiriyorum', price: '1.200₺', slug: 'hafizlik' },
    { name: 'Genel Bağış', price: 'Serbest Miktar', slug: 'acil-yardim' },
    { name: 'Büyükbaş Kurban', price: '3.500₺', slug: 'kurban' },
    { name: 'Su Kuyusu', price: '15.000₺', slug: 'su-kuyusu' }
  ];

  return `
    <section style="padding:60px 24px; background:linear-gradient(to bottom right, #f9fafb, #fff);">
      <div style="max-width:1100px; margin:0 auto;">
        
        <div style="text-align:center; margin-bottom:48px;">
          <span style="background:#d1fae5; color:#065f46; font-size:11px; font-weight:800; padding:6px 16px; border-radius:99px; text-transform:uppercase; letter-spacing:1px; display:inline-block; margin-bottom:16px;">Bağış Yap</span>
          <h2 style="font-size:2.2rem; font-weight:900; color:#065f46; margin:0 0 8px;">Hayırlı İşlere Vesile Olun</h2>
          <p style="font-size:14px; color:#64748b; max-width:600px; margin:0 auto;">İslami eğitim ve yardım faaliyetlerimize destek olmak için online bağış yapabilirsiniz.</p>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:24px; margin-bottom:48px;">
          <div style="background:#fff; border:1px solid #e5e7eb; border-radius:20px; padding:28px; text-align:center; box-shadow:0 4px 15px rgba(0,0,0,0.02);">
            <h3 style="font-size:1.3rem; font-weight:800; color:#065f46; margin:0 0 8px;">Genel Bağış</h3>
            <p style="font-size:12.5px; color:#64748b; margin-bottom:16px;">En acil ihtiyaç duyulan eğitim ve gıda alanları için.</p>
            <a href="${prefix}/bagis/acil-yardim" style="color:#059669; font-weight:700; font-size:13px; text-decoration:none;">Detayları Gör ➔</a>
          </div>
          <div style="background:#fff; border:1px solid #e5e7eb; border-radius:20px; padding:28px; text-align:center; box-shadow:0 4px 15px rgba(0,0,0,0.02);">
            <h3 style="font-size:1.3rem; font-weight:800; color:#059669; margin:0 0 8px;">Eğitim</h3>
            <p style="font-size:12.5px; color:#64748b; margin-bottom:16px;">Hafızlık ve talebe eğitim faaliyetlerine katkı.</p>
            <a href="${prefix}/bagis/hafizlik" style="color:#059669; font-weight:700; font-size:13px; text-decoration:none;">Detayları Gör ➔</a>
          </div>
          <div style="background:#fff; border:1px solid #e5e7eb; border-radius:20px; padding:28px; text-align:center; box-shadow:0 4px 15px rgba(0,0,0,0.02);">
            <h3 style="font-size:1.3rem; font-weight:800; color:#dc2626; margin:0 0 8px;">Kurban</h3>
            <p style="font-size:12.5px; color:#64748b; margin-bottom:16px;">Kurban, adak, akika ve şükür kurbanı bağışları.</p>
            <a href="${prefix}/bagis/kurban" style="color:#dc2626; font-weight:700; font-size:13px; text-decoration:none;">Detayları Gör ➔</a>
          </div>
        </div>

        <div style="background:#fff; border:1px solid #e5e7eb; border-radius:24px; padding:32px; box-shadow:0 10px 30px rgba(0,0,0,0.02);">
          <h3 style="font-size:1.5rem; font-weight:900; color:#043425; text-align:center; margin:0 0 24px;">Popüler Bağış Kalemleri</h3>
          
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom:32px;">
            ${popular.map(p => `
              <a href="${prefix}/bagis/${p.slug}" style="background:#f9fafb; border:1px solid #e5e7eb; padding:20px; border-radius:16px; text-decoration:none; display:block; text-align:center; transition:all 0.2s;">
                <div style="font-weight:700; color:#1e293b; font-size:13px; margin-bottom:4px;">${p.name}</div>
                <div style="font-size:15px; font-weight:800; color:#059669;">${p.price}</div>
              </a>
            `).join('')}
          </div>

          <div style="text-align:center;">
            <a href="${prefix}/bagis/acil-yardim" style="background:#059669; color:#fff; font-weight:800; text-decoration:none; padding:14px 32px; border-radius:12px; font-size:14px; display:inline-flex; align-items:center; gap:8px; box-shadow:0 6px 15px rgba(5,150,105,0.2);">Tüm Bağış Seçeneklerini Gör ➔</a>
          </div>

          <div style="border-top:1px solid #e5e7eb; margin-top:32px; padding-top:24px; display:flex; justify-content:center; gap:32px; flex-wrap:wrap; font-size:12.5px; color:#64748b;">
            <div><span style="color:#059669; font-weight:800;">✓</span> Güvenli Ödeme</div>
            <div><span style="color:#059669; font-weight:800;">✓</span> Şeffaf Raporlama</div>
            <div><span style="color:#059669; font-weight:800;">✓</span> Anında İşlem</div>
          </div>

        </div>

      </div>
    </section>
  `;
}

/* ──────────────────────────────────────────────────────────────
   SHARED HELPERS
   ────────────────────────────────────────────────────────────── */
function themeHeader(o, cfg = {}) {
  const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
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
      <a class="brand" href="${prefix}">
        <span style="${logoStyle}">${esc(o.name[0])}</span>
        <b>${esc(o.name)}</b>
      </a>
      <nav style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
        <a href="${prefix}" class="nav-item">Ana Sayfa</a>
        <a href="${prefix}/bagis/kurban" class="nav-item">Kurban</a>
        <a href="${prefix}/bagis/zekat" class="nav-item">Zekat</a>
        <a href="${prefix}/bagis/acil-yardim" class="nav-item">Acil Yardım</a>
        ${extraNav}
        <a href="${prefix}/hakkimizda" class="nav-item">Hakkımızda</a>
        <a href="${prefix}/iletisim" class="nav-item">İletişim</a>
      </nav>
      <a class="primary" href="${prefix}/bagis/acil-yardim" style="${ctaStyle} box-shadow:0 4px 12px rgba(0,0,0,0.08); font-size:13px; min-height:36px; display:inline-flex; align-items:center; justify-content:center; padding:0 16px; border-radius:var(--r); font-weight:bold;">${ctaText}</a>
    </header>
  `;
}

function themeFooter(o, cfg = {}) {
  const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
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
            <li><a href="${prefix}" style="color:${color}; text-decoration:none;">Ana Sayfa</a></li>
            <li><a href="${prefix}/hakkimizda" style="color:${color}; text-decoration:none;">Hakkımızda</a></li>
            <li><a href="${prefix}/iletisim" style="color:${color}; text-decoration:none;">İletişim</a></li>
            <li><a href="${prefix}" style="color:${color}; text-decoration:none;">Yönetim Kurulu</a></li>
            <li><a href="${prefix}" style="color:${color}; text-decoration:none;">Denetim Raporları</a></li>
          </ul>
        </div>
        <div>
          <h4 style="color:${headColor}; font-size:14px; margin-top:0; margin-bottom:18px; text-transform:uppercase; letter-spacing:0.5px;">Faaliyetler</h4>
          <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; font-size:12.5px;">
            <li><a href="${prefix}/bagis/acil-yardim" style="color:${color}; text-decoration:none;">Acil Yardım</a></li>
            <li><a href="${prefix}/bagis/kurban" style="color:${color}; text-decoration:none;">Kurban Hissesi</a></li>
            <li><a href="${prefix}/bagis/zekat" style="color:${color}; text-decoration:none;">Zekat & Sadaka</a></li>
            <li><a href="${prefix}" style="color:${color}; text-decoration:none;">Su Kuyuları</a></li>
            <li><a href="${prefix}" style="color:${color}; text-decoration:none;">Yetim Destekleri</a></li>
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
          <a href="${prefix}" style="color:#64748b; text-decoration:none;">KVKK Politikası</a>
          <a href="${prefix}" style="color:#64748b; text-decoration:none;">Kullanım Koşulları</a>
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
            <a href="${prefix}/bagis/${c.slug}" style="${btnStyle}">Hemen Bağış Yap <span>➔</span></a>
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
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    const hCfg = { font: "'Quicksand', sans-serif", topBg: '#064e3b', topLeft: '☪ İnsani Yardım Portalı', ctaText: 'Şimdi Bağış Yap', ctaStyle: 'background:#00764B; color:#fff;' };
    return `<div class="site" data-theme="nezir" style="--p:${o.primaryColor};--a:${o.accentColor}; font-family:'Quicksand', sans-serif;">
      ${themeHeader(o, hCfg)}
      <main>
        ${themeHeroSlider(o, list, { font: "'Quicksand', sans-serif", overlay: 'linear-gradient(135deg, rgba(0,118,75,0.7), rgba(0,0,0,0.4))', btnStyle: 'background:#00764B; color:#fff; padding:14px 28px; border-radius:8px; font-weight:700; font-size:15px; display:inline-flex; align-items:center; gap:8px; text-decoration:none; box-shadow:0 4px 15px rgba(0,118,75,0.3); font-family:Quicksand,sans-serif;' })}
        
        <div style="background:#f0fdf4; padding:20px clamp(18px,5vw,72px); display:flex; gap:12px; align-items:center; border-bottom:1px solid #bbf7d0;">
          <span style="font-size:1.5rem;">🚀</span>
          <span style="font-size:13px; color:#166534; font-weight:600;">Hızlı bağış yaparak acil yardım kampanyalarımıza destek olabilirsiniz.</span>
          <a href="${prefix}/bagis/acil-yardim" style="margin-left:auto; background:#00764B; color:#fff; padding:8px 20px; border-radius:6px; font-weight:bold; font-size:12px; text-decoration:none;">Hızlı Bağış →</a>
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
  about(o, list) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug; return themeAboutPage(o, { font: "'Quicksand', sans-serif", headFont: "'Quicksand', sans-serif", heroBg: '#00764B', headerCfg: { font: "'Quicksand', sans-serif", topBg: '#064e3b' }, footerCfg: { bg: '#022c22', font: "'Quicksand', sans-serif" } }); },
  contact(o, list) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug; return themeContactPage(o, { font: "'Quicksand', sans-serif", headFont: "'Quicksand', sans-serif", heroBg: '#00764B', headerCfg: { font: "'Quicksand', sans-serif", topBg: '#064e3b' }, footerCfg: { bg: '#022c22', font: "'Quicksand', sans-serif" } }); }
};

themeLayouts.hicretdernegi = {
  home(o, list) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    const cs = state.currentSlideIndex || 0;
    const slides = [
      { id: 1, bgImage: "/images/hicret/talebe 1.png", title: "HİCRET DERNEĞİ", subtitle: "Eğitim Yuvamıza Hoş Geldiniz", description: "Modern pedagoji ile geleneksel İslami değerleri buluşturan eğitim anlayışımızla, geleceğin Müslüman nesilleri yetiştiriyoruz.", stats: { number: "200+", label: "Öğrenci" }, buttonText: "Hakkımızda", buttonLink: `${prefix}/hakkimizda` },
      { id: 2, bgImage: "/images/hicret/talebe 2.png", title: "KALİTELİ EĞİTİM", subtitle: "Deneyimli Kadromuzla", description: "15+ tecrübeli eğitimcimiz ile İslami değerleri modern öğretim yöntemleriyle harmanlayan eğitim programları sunuyoruz.", stats: { number: "15+", label: "Eğitimci" }, buttonText: "Kadromuz", buttonLink: `${prefix}/hakkimizda` },
      { id: 3, bgImage: "/images/hicret/talebe 3.png", title: "4 FARKLI BÖLÜM", subtitle: "Her Yaş İçin Özel Program", description: "Sıbyan (4-7 yaş), İbtida (8-12 yaş), Hafızlık (7+ yaş) ve Arapça (10+ yaş) bölümlerimizle çocuğunuzun yaşına uygun kapsamlı İslami eğitim sunuyoruz.", stats: { number: "4", label: "Özel Program" }, buttonText: "Programlar", buttonLink: `${prefix}/faaliyetlerimiz` },
      { id: 4, bgImage: "/images/hicret/talebe 4.png", title: "GÜVENLİ ÇEVRE", subtitle: "Aile Ortamında Eğitim", description: "Güvenli ve huzurlu ortamımızda, çocuklarınız hem dinî eğitimlerini alıyor hem de karakter gelişimlerini tamamlıyor.", stats: { number: "8", label: "Yıl Tecrübe" }, buttonText: "Bize Ulaşın", buttonLink: `${prefix}/iletisim` }
    ];

    const slide = slides[cs] || slides[0];

    const cardsHtml = list.map(c => {
      const p = pct(c.collected, c.target);
      return `
        <div class="hicret-card" style="background:#fff; border-radius:20px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.03); border:1px solid #e5e7eb; display:flex; flex-direction:column; height:100%;">
          <div style="height:190px; background:url('${c.image || '/images/hicret/talebe 1.png'}') center/cover no-repeat; position:relative;">
            <div style="position:absolute; top:12px; left:12px;">
              <span style="background:#043425; color:#fff; font-size:10px; font-weight:700; padding:4px 10px; border-radius:20px;">${c.featured ? 'Acil' : 'Devam Ediyor'}</span>
            </div>
          </div>
          <div style="padding:20px; display:flex; flex-direction:column; flex-grow:1; justify-content:space-between;">
            <div>
              <h3 style="font-size:1.15rem; font-weight:800; color:#065f46; margin:0 0 8px;">${c.title}</h3>
              <p style="font-size:12.5px; color:#64748b; line-height:1.5; margin-bottom:16px; height:60px; overflow:hidden;">${c.description}</p>
              
              <div style="margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; font-size:10.5px; color:#64748b; margin-bottom:4px;">
                  <span>Hedef</span>
                  <span style="font-weight:700;">${money(c.target)}</span>
                </div>
                <div style="height:6px; background:#f1f5f9; border-radius:3px; overflow:hidden;">
                  <div style="width:${p}%; height:100%; background:#059669; border-radius:3px;"></div>
                </div>
                <div style="margin-top:8px; display:flex; justify-content:space-between; font-size:11px; color:#64748b;">
                  <span>Toplanan: ${money(c.collected)}</span>
                  <span style="font-weight:700; color:#059669;">%${p}</span>
                </div>
              </div>
            </div>
            
            <a href="${prefix}/bagis/${c.slug}" style="display:inline-flex; width:100%; justify-content:center; align-items:center; background:#059669; color:#fff; text-decoration:none; font-size:12.5px; font-weight:700; padding:10px; border-radius:8px; box-shadow:0 4px 10px rgba(5,150,105,0.15);">Hemen Destek Ol <span style="margin-left:4px;">➔</span></a>
          </div>
        </div>
      `;
    }).join('');

    return `<div class="site" data-theme="hicretdernegi" style="--p:#065f46;--a:#0284c7; font-family:'Poppins', sans-serif; background:#f9fafb;">
      
      <!-- Header -->
      <div style="background:#043425; color:#cbd5e1; padding:6px 20px; display:flex; justify-content:space-between; align-items:center; font-size:11px; font-weight:600;">
        <div>📖 Hicret Medresesi İslami Eğitim Kurumu</div>
        <div style="display:flex; gap:16px;">
          <a href="#/bagisci" style="color:#cbd5e1; text-decoration:none;">👤 Bağışçı Girişi</a>
          <span>|</span>
          <a href="#/admin" style="color:#cbd5e1; text-decoration:none;">⚙️ Otomasyon</a>
        </div>
      </div>
      
      <header class="site-head" style="background:#fff; border-bottom:2px solid #059669; padding:12px 24px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 4px 12px rgba(0,0,0,0.05); position:sticky; top:0; z-index:100;">
        <a class="brand" href="${prefix}" style="display:flex; align-items:center; gap:12px; text-decoration:none;">
          <img src="/images/hicret/logooo.png" style="width:50px; height:50px; border-radius:50%; border:2px solid #059669;" />
          <div>
            <h1 style="font-size:1.15rem; font-weight:800; color:#065f46; margin:0; line-height:1.2;">HİCRET DERNEĞİ</h1>
            <p style="font-size:10px; color:#0284c7; font-weight:700; margin:0; text-transform:uppercase; letter-spacing:0.5px;">İslami Eğitim Kurumu</p>
          </div>
        </a>
        <nav style="display:flex; gap:20px; align-items:center;">
          <a href="${prefix}" style="color:#065f46; font-weight:700; text-decoration:none; font-size:14px;">Ana Sayfa</a>
          <a href="${prefix}/faaliyetlerimiz" style="color:#475569; font-weight:600; text-decoration:none; font-size:14px;">Faaliyetlerimiz</a>
          <a href="${prefix}/hakkimizda" style="color:#475569; font-weight:600; text-decoration:none; font-size:14px;">Hakkımızda</a>
          <a href="${prefix}/iletisim" style="color:#475569; font-weight:600; text-decoration:none; font-size:14px;">İletişim</a>
        </nav>
        <div style="display:flex; gap:10px;">
          <a href="${prefix}/iletisim" style="background:#2563eb; color:#fff; text-decoration:none; font-size:12px; font-weight:700; padding:8px 18px; border-radius:99px; box-shadow:0 4px 10px rgba(37,99,235,0.2);">BAŞVURU YAP</a>
          <a href="${prefix}/bagis/acil-yardim" style="background:#059669; color:#fff; text-decoration:none; font-size:12px; font-weight:700; padding:8px 18px; border-radius:99px; box-shadow:0 4px 10px rgba(5,150,105,0.2);">BAĞIŞ YAP</a>
        </div>
      </header>

      <main>
        <!-- Vuslat Style Hero Slider Section -->
        <section style="position:relative; height:600px; overflow:hidden; background:#043425; display:flex; align-items:center; padding:0 clamp(20px,8vw,100px);">
          
          <!-- Background image fade -->
          <div style="position:absolute; inset:0; background:linear-gradient(rgba(4,52,37,0.9), rgba(4,52,37,0.5)), url('${slide.bgImage}') center/cover no-repeat; transition:all 1s ease-in-out; z-index:1;"></div>

          <div style="max-width:1200px; margin:0 auto; width:100%; display:grid; grid-template-columns:1.2fr 0.8fr; gap:40px; position:relative; z-index:2; align-items:center;">
            
            <!-- Left Info Panel -->
            <div style="color:#fff;">
              <span style="background:linear-gradient(to right, #059669, #047857); color:#fff; px:4px; font-size:11px; font-weight:700; padding:6px 16px; border-radius:20px; text-transform:uppercase; letter-spacing:1px; display:inline-block; margin-bottom:18px; box-shadow:0 4px 12px rgba(5,150,105,0.3); border:1px solid rgba(255,255,255,0.15);">${slide.subtitle}</span>
              <h1 style="font-size:3.2rem; font-weight:900; line-height:1.2; margin:0 0 16px; text-shadow:0 2px 4px rgba(0,0,0,0.3);">${slide.title}</h1>
              <p style="font-size:16px; line-height:1.6; color:#e2e8f0; margin-bottom:28px; max-width:600px;">${slide.description}</p>
              <div style="display:flex; gap:12px; flex-wrap:wrap;">
                <a href="${slide.buttonLink}" style="background:linear-gradient(to right, #059669, #047857); color:#fff; font-size:13.5px; font-weight:800; padding:14px 32px; border-radius:30px; text-decoration:none; display:inline-flex; align-items:center; gap:8px; box-shadow:0 6px 20px rgba(5,150,105,0.3); border:1px solid rgba(255,255,255,0.15);">${slide.buttonText.toUpperCase()} ➔</a>
                <a href="${prefix}/iletisim" style="background:linear-gradient(to right, #2563eb, #1d4ed8); color:#fff; font-size:13.5px; font-weight:800; padding:14px 32px; border-radius:30px; text-decoration:none; display:inline-flex; align-items:center; gap:8px; box-shadow:0 6px 20px rgba(37,99,235,0.3);">BAŞVURU YAP ➔</a>
              </div>
            </div>

            <!-- Right Stats Grid Panel (Glassmorphism) -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
              <div style="background:rgba(255,255,255,0.1); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.25); border-radius:16px; padding:20px; text-align:center; color:#fff; box-shadow:0 10px 25px rgba(0,0,0,0.15);">
                <div style="font-size:2rem; font-weight:900; margin-bottom:4px; color:#fff;">${slide.stats.number}</div>
                <div style="font-size:12px; opacity:0.9;">${slide.stats.label}</div>
              </div>
              <div style="background:rgba(255,255,255,0.1); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.25); border-radius:16px; padding:20px; text-align:center; color:#fff; box-shadow:0 10px 25px rgba(0,0,0,0.15);">
                <div style="font-size:2rem; font-weight:900; margin-bottom:4px; color:#fff;">8+</div>
                <div style="font-size:12px; opacity:0.9;">Yıl Tecrübe</div>
              </div>
              <div style="background:rgba(255,255,255,0.1); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.25); border-radius:16px; padding:20px; text-align:center; color:#fff; box-shadow:0 10px 25px rgba(0,0,0,0.15);">
                <div style="font-size:2rem; font-weight:900; margin-bottom:4px; color:#fff;">%98</div>
                <div style="font-size:12px; opacity:0.9;">Memnuniyet</div>
              </div>
              <div style="background:rgba(255,255,255,0.1); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.25); border-radius:16px; padding:20px; text-align:center; color:#fff; box-shadow:0 10px 25px rgba(0,0,0,0.15);">
                <div style="font-size:2rem; font-weight:900; margin-bottom:4px; color:#fff;">8</div>
                <div style="font-size:12px; opacity:0.9;">Şube</div>
              </div>
            </div>

          </div>

          <!-- Vertical Slide indicators (Right Side Thumbnails) -->
          <div style="position:absolute; right:20px; top:50%; transform:translateY(-50%); display:flex; flex-direction:column; gap:16px; z-index:10;">
            ${slides.map((s, idx) => `
              <button onclick="state.currentSlideIndex = ${idx}; render();" style="border:none; background:none; padding:0; cursor:pointer; outline:none; text-align:right;">
                <div style="width:120px; height:70px; background:url('${s.bgImage}') center/cover no-repeat; border-radius:10px; border:${idx === cs ? '3px solid #059669' : '1px solid rgba(255,255,255,0.3)'}; opacity:${idx === cs ? '1' : '0.65'}; transition:all 0.2s; box-shadow:0 4px 10px rgba(0,0,0,0.25);"></div>
                <span style="font-size:10px; font-weight:800; color:#fff; display:block; margin-top:4px; text-shadow:0 1px 2px rgba(0,0,0,0.8);">${s.title}</span>
              </button>
            `).join('')}
          </div>

        </section>

        <!-- Notification Bar -->
        <div style="background:#ecfdf5; border-bottom:1px solid #d1fae5; padding:16px clamp(18px,5vw,72px); display:flex; align-items:center; gap:12px; justify-content:space-between; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:8px; color:#065f46; font-size:13px; font-weight:700;">
            <span>📢</span> Kış dönemi talebe kayıtlarımız devam etmektedir. Detaylı bilgi için başvuru yapabilirsiniz.
          </div>
          <a href="${prefix}/iletisim" style="background:#065f46; color:#fff; text-decoration:none; font-size:11px; font-weight:700; padding:6px 16px; border-radius:20px;">Başvuru Sayfası ➔</a>
        </div>

        <!-- Sections -->
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

        <!-- Hicret Quick Donation Widget -->
        ${renderHicretQuickDonation(o)}

        <!-- Custom Campaign Grid matching Next.js -->
        <section class="section" style="padding:60px clamp(18px,5vw,72px); background:#f9fafb;">
          <div style="display:flex; justify-content:space-between; align-items:end; margin-bottom:32px;">
            <h2 style="font-size:2rem; font-weight:900; color:#065f46; margin:0;">Güncel Kampanyalar</h2>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:32px;">
            ${cardsHtml}
          </div>
        </section>

        <section class="section" style="background:#fff; padding:60px clamp(18px,5vw,72px);">
          <div class="split">${renderZekatCalculator(o)}${renderFaqAccordion()}</div>
        </section>

        ${themeImpactStats(o, list, { bg: 'linear-gradient(135deg, #043425, #059669)' })}
      </main>
      ${themeFooter(o, { bg: '#032017', font: "'Poppins', sans-serif" })}
    </div>`;
  },
  about(o, list) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    const programs = [
      { icon: "👶", title: 'Sıbyan Mektebi', description: "4-7 yaş arası çocuklarımız için temel İslami bilgiler, ahlak ve adap eğitimi ile Kur'an öğretimi.", duration: '1-2 Yıl', color: 'background:#f59e0b;' },
      { icon: "🏫", title: 'İbtida Programı', description: "8-12 yaş arası öğrencilerimiz için temel İslami bilgiler, Kur'an okuma, temel Arapça ve dini değerler eğitimi.", duration: '2-3 Yıl', color: 'background:#a855f7;' },
      { icon: "🕌", title: 'Hafızlık Programı', description: "Kur'an-ı Kerim'i ezberleme programımızda, öğrencilerimiz tecvid kuralları ile birlikte Kur'an'ı hafızalarına nakşederler.", duration: '3-4 Yıl', color: 'background:#10b981;' },
      { icon: "📚", title: 'Arapça Dil Eğitimi', description: "Arapça gramer, sarf, nahiv dersleri ile öğrencilerimiz Arapça'yı konuşma ve anlama düzeyinde öğrenirler.", duration: '2-3 Yıl', color: 'background:#3b82f6;' }
    ];

    const features = [
      { icon: "❤️", title: 'Köklü Gelenek', description: 'Asırlık medrese geleneğini modern eğitim yöntemleri ile harmanlayarak sürdürüyoruz.' },
      { icon: "✨", title: 'Bireysel İlgi', description: 'Her öğrencimize özel ilgi göstererek onların potansiyellerini en üst düzeyde geliştiriyoruz.' },
      { icon: "✓", title: 'Güvenilir Eğitim', description: 'Deneyimli hocalarımız ve kaliteli müfredatımız ile güvenilir bir eğitim ortamı sunuyoruz.' },
      { icon: "⭐", title: 'Manevi Gelişim', description: 'Sadece ilmi değil, aynı zamanda manevi ve ahlaki gelişimi de hedefleyen bir eğitim anlayışı.' }
    ];

    return `<div class="site" data-theme="hicretdernegi" style="--p:#065f46;--a:#0284c7; font-family:'Poppins', sans-serif; background:#f9fafb;">
      ${this.headerHtml(o)}
      
      <section style="background:linear-gradient(135deg, #043425, #065f46); color:#fff; padding:80px 24px; text-align:center; position:relative; overflow:hidden;">
        <div style="max-width:800px; margin:0 auto; position:relative; z-index:2;">
          <span style="background:rgba(255,255,255,0.1); padding:6px 16px; border-radius:99px; font-size:11px; font-weight:700; letter-spacing:1px; display:inline-block; margin-bottom:16px;">📖 İSLAMİ EĞİTİM MERKEZİ</span>
          <h1 style="font-size:clamp(2.2rem,5vw,3.5rem); font-weight:850; line-height:1.2; margin:0 0 16px;">Hicret İslami İlimler Medresesi</h1>
          <p style="font-size:16px; color:#cbd5e1; line-height:1.6; margin:0;">İslami ilimler, hafızlık, Arapça ve sıbyan eğitimi veren köklü medresemizde geleneksel bilgi modern pedagoji ile buluşuyor.</p>
        </div>
      </section>

      <section class="section" style="padding:60px 24px; background:#fff;">
        <div style="max-width:900px; margin:0 auto;">
          <div style="text-align:center; margin-bottom:48px;">
            <h2 style="font-size:2rem; font-weight:800; color:#065f46;">Medresemiz Hakkında</h2>
            <p style="color:#64748b; font-size:14px; line-height:1.6; margin-top:8px;">Hicret İslami İlimler Medresesi, İslami ilimlerin öğretildiği, hafızlık eğitimi verildiği ve Arapça dil eğitiminin sağlandığı köklü bir eğitim kurumudur. Sıbyan mektebimizden yüksek medrese seviyesine kadar farklı yaş gruplarına hitap eden programlarımızla, öğrencilerimizin hem dünyevi hem de uhrevi hayatlarına katkı sağlamayı hedefliyoruz.</p>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:48px;">
            <div style="background:#f9fafb; border:1px solid #e5e7eb; padding:32px; border-radius:16px;">
              <h3 style="font-size:1.3rem; font-weight:800; color:#065f46; margin:0 0 12px;">Misyonumuz</h3>
              <p style="font-size:13px; color:#475569; line-height:1.6; margin:0;">Kur'an ve Sünnet rehberliğinde, İslami ilimleri öğreten, hafızlık eğitimi veren ve Arapça dil becerileri kazandıran kaliteli bir medrese eğitimi sunarak, topluma faydalı, ahlaklı ve bilgili bireyler yetiştirmek.</p>
            </div>
            <div style="background:#f9fafb; border:1px solid #e5e7eb; padding:32px; border-radius:16px;">
              <h3 style="font-size:1.3rem; font-weight:800; color:#065f46; margin:0 0 12px;">Vizyonumuz</h3>
              <p style="font-size:13px; color:#475569; line-height:1.6; margin:0;">Geleneksel medrese eğitimini modern pedagojik yöntemlerle harmanlayarak, İslami ilimlerde uzman, hafız ve Arapça bilen nesiller yetiştiren, örnek bir eğitim kurumu olmak.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Programs Grid -->
      <section style="padding:60px 24px; background:#f3f4f6;">
        <div style="max-width:1100px; margin:0 auto;">
          <h2 style="font-size:2rem; font-weight:800; color:#065f46; text-align:center; margin-bottom:32px;">Eğitim Programlarımız</h2>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:20px;">
            ${programs.map(p => `
              <div style="background:#fff; padding:28px; border-radius:16px; box-shadow:0 4px 10px rgba(0,0,0,0.03); display:flex; flex-direction:column; justify-content:between;">
                <div>
                  <span style="font-size:2.2rem; display:block; margin-bottom:12px;">${p.icon}</span>
                  <h3 style="font-size:1.15rem; font-weight:800; color:#065f46; margin:0 0 8px;">${p.title}</h3>
                  <p style="font-size:12px; color:#64748b; line-height:1.5; margin-bottom:16px;">${p.description}</p>
                </div>
                <div style="font-size:11px; font-weight:700; color:#059669;">⏱ Süre: ${p.duration}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      <!-- Why Us -->
      <section style="padding:60px 24px; background:#fff;">
        <div style="max-width:1000px; margin:0 auto; text-align:center;">
          <h2 style="font-size:2rem; font-weight:800; color:#065f46; margin-bottom:40px;">Neden Hicret İslami İlimler Medresesi?</h2>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:32px;">
            ${features.map(f => `
              <div>
                <div style="width:50px; height:50px; background:#e6f4ea; color:#059669; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.4rem; margin:0 auto 16px;">${f.icon}</div>
                <h3 style="font-size:1.1rem; font-weight:800; color:#065f46; margin:0 0 8px;">${f.title}</h3>
                <p style="font-size:12px; color:#64748b; line-height:1.5; margin:0;">${f.description}</p>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      <!-- CTA -->
      <section style="background:linear-gradient(135deg, #059669, #065f46); color:#fff; padding:60px 24px; text-align:center;">
        <h2 style="font-size:1.8rem; font-weight:850; margin:0 0 12px;">Medresemize Katılın</h2>
        <p style="font-size:14px; color:#cbd5e1; max-width:600px; margin:0 auto 24px;">İslami ilimleri öğrenmek, hafızlık yapmak veya Arapça öğrenmek istiyorsanız medresemizle iletişime geçin.</p>
        <div style="display:flex; justify-content:center; gap:12px;">
          <a href="${prefix}/iletisim" style="background:#fff; color:#065f46; padding:12px 28px; border-radius:99px; font-weight:700; text-decoration:none; font-size:13px;">Başvuru Yap</a>
          <a href="${prefix}/iletisim" style="border:2px solid rgba(255,255,255,0.3); color:#fff; padding:12px 28px; border-radius:99px; font-weight:700; text-decoration:none; font-size:13px;">İletişim</a>
        </div>
      </section>

      ${themeFooter(o, { bg: '#032017', font: "'Poppins', sans-serif" })}
    </div>`;
  },
  contact(o, list) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    return `<div class="site" data-theme="hicretdernegi" style="--p:#065f46;--a:#0284c7; font-family:'Poppins', sans-serif; background:#f9fafb;">
      ${this.headerHtml(o)}
      
      <section style="background:linear-gradient(135deg, #043425, #065f46); color:#fff; padding:80px 24px; text-align:center;">
        <div style="max-width:800px; margin:0 auto;">
          <span style="background:rgba(255,255,255,0.1); padding:6px 16px; border-radius:99px; font-size:11px; font-weight:700; display:inline-block; margin-bottom:16px;">✉ BİZİMLE İLETİŞİME GEÇİN</span>
          <h1 style="font-size:2.8rem; font-weight:850; margin:0 0 12px;">İletişim</h1>
          <p style="font-size:15px; color:#cbd5e1; margin:0;">Sorularınız, önerileriniz veya başvurularınız için bizimle iletişime geçin. Size yardımcı olmaktan mutluluk duyarız.</p>
        </div>
      </section>

      <section class="section" style="padding:60px 24px; background:#fff;">
        <div style="max-width:1100px; margin:0 auto; display:grid; grid-template-columns:1.2fr 1.8fr; gap:40px;">
          
          <!-- Info -->
          <div>
            <div style="background:#f9fafb; border:1px solid #e5e7eb; padding:28px; border-radius:20px; box-shadow:0 4px 12px rgba(0,0,0,0.02);">
              <h2 style="font-size:1.4rem; font-weight:800; color:#065f46; margin:0 0 20px;">İletişim Bilgileri</h2>
              
              <div style="display:flex; flex-direction:column; gap:20px;">
                <div>
                  <h4 style="font-weight:700; color:#065f46; margin:0 0 4px; font-size:13px;">📍 Adresimiz</h4>
                  <p style="font-size:12.5px; color:#475569; margin:0; line-height:1.5;">Hicret İslami İlimler Medresesi<br>71 Evler Mh. Esenyazı Sk. No:41<br>Odunpazarı, Eskişehir, Türkiye</p>
                </div>
                <div>
                  <h4 style="font-weight:700; color:#065f46; margin:0 0 4px; font-size:13px;">📞 Telefon & WhatsApp</h4>
                  <p style="font-size:12.5px; color:#475569; margin:0;">+90 542 641 26 26</p>
                </div>
                <div>
                  <h4 style="font-weight:700; color:#065f46; margin:0 0 4px; font-size:13px;">✉ E-posta</h4>
                  <p style="font-size:12.5px; color:#475569; margin:0;">hicretdernegi26@gmail.com</p>
                </div>
                <div>
                  <h4 style="font-weight:700; color:#065f46; margin:0 0 4px; font-size:13px;">⏱ Çalışma Saatleri</h4>
                  <p style="font-size:12px; color:#475569; margin:0; line-height:1.4;">Pazartesi - Cuma: 08:00 - 17:00<br>Cumartesi: 09:00 - 14:00<br>Pazar: Kapalı</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Form -->
          <div>
            <div style="background:#fff; border:1px solid #e5e7eb; padding:32px; border-radius:24px; box-shadow:0 4px 20px rgba(0,0,0,0.03);">
              <h2 style="font-size:1.5rem; font-weight:800; color:#065f46; margin:0 0 8px; text-align:center;">Bize Ulaşın</h2>
              <p style="font-size:12px; color:#64748b; text-align:center; margin-bottom:24px;">Mesajınızı gönderin, en kısa sürede size dönüş yapalım.</p>
              
              <form data-form="contact" style="display:flex; flex-direction:column; gap:16px;">
                <input type="hidden" name="orgSlug" value="${o.slug}">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                  <div>
                    <label style="font-size:11px; font-weight:700; color:#475569; display:block; margin-bottom:4px;">Ad Soyad *</label>
                    <input type="text" name="name" required placeholder="Adınız" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px; font-size:13px;">
                  </div>
                  <div>
                    <label style="font-size:11px; font-weight:700; color:#475569; display:block; margin-bottom:4px;">E-Posta *</label>
                    <input type="email" name="email" required placeholder="E-Posta Adresiniz" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px; font-size:13px;">
                  </div>
                </div>
                <div>
                  <label style="font-size:11px; font-weight:700; color:#475569; display:block; margin-bottom:4px;">Telefon</label>
                  <input type="text" name="phone" placeholder="05xx xxx xx xx" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px; font-size:13px;">
                </div>
                <div>
                  <label style="font-size:11px; font-weight:700; color:#475569; display:block; margin-bottom:4px;">Mesajınız *</label>
                  <textarea name="message" required placeholder="Mesajınız..." style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px; font-size:13px; height:100px;"></textarea>
                </div>
                <button type="submit" style="background:#059669; color:#fff; border:0; padding:12px; font-weight:700; border-radius:8px; font-size:14px; cursor:pointer;">MESAJ GÖNDER</button>
              </form>
            </div>
          </div>

        </div>
      </section>

      <!-- Transportation & FAQ -->
      <section style="padding:60px 24px; background:#f9fafb; border-top:1px solid #e5e7eb;">
        <div style="max-width:1100px; margin:0 auto;">
          <h2 style="font-size:1.8rem; font-weight:800; color:#065f46; text-align:center; margin-bottom:32px;">Ulaşım & Sıkça Sorulan Sorular</h2>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:32px;">
            <div>
              <h3 style="font-size:1.2rem; font-weight:800; color:#065f46; margin-bottom:16px;">🚌 Ulaşım Bilgileri</h3>
              <ul style="padding:0; list-style:none; display:flex; flex-direction:column; gap:12px; font-size:13px; color:#475569;">
                <li><b>Otobüs Hatları:</b> 48 SİYAH, 43 SİYAH, 13 SİYAH hatları medrese yakınından geçmektedir.</li>
                <li><b>Tramvay:</b> 10 (Şehir Hastanesi - Kumlubel) veya 12 (75. Yıl - OGÜ) tramvay hatlarını kullanabilirsiniz.</li>
                <li><b>Taksi / Navigasyon:</b> Navigasyona 'Hicret Medresesi Odunpazarı' yazarak kolayca rota oluşturabilirsiniz.</li>
              </ul>
            </div>
            <div>
              <h3 style="font-size:1.2rem; font-weight:800; color:#065f46; margin-bottom:16px;">❓ Sıkça Sorulan Sorular</h3>
              <div style="display:flex; flex-direction:column; gap:12px; font-size:12.5px; color:#475569;">
                <div>
                  <b style="color:#065f46;">Evli olmayan talebelerimiz için yatılı imkanınız var mı?</b>
                  <p style="margin:2px 0 0;">Evet, evli olmayan talebelerimiz için yatılı eğitim imkanımız mevcuttur.</p>
                </div>
                <div>
                  <b style="color:#065f46;">Hangi yaş grupları için eğitim veriyorsunuz?</b>
                  <p style="margin:2px 0 0;">4 yaş ve üzeri tüm yavrularımız için eğitim programlarımız mevcuttur.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      ${themeFooter(o, { bg: '#032017', font: "'Poppins', sans-serif" })}
    </div>`;
  },
  activities(o, list) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    const activities = [
      { id: 'sibyan-mektebi', title: 'Sıbyan Mektebi', ageGroup: '4-7 yaş', duration: '1-2 Yıl', participants: '45+ Öğrenci', schedule: 'Pazartesi - Cuma', time: '09:00 - 12:00', description: 'Küçük yaş grubundaki çocuklarımız için temel İslami bilgiler, ahlak ve adap eğitimi.', features: ["Temel İslami bilgiler", "Kur'an-ı Kerim okuma", "Ahlak ve adap eğitimi"], image: "/images/hicret/talebe 1.png", color: "from-orange-500 to-orange-600" },
      { id: 'ibtida-programi', title: 'İbtida Programı', ageGroup: '8-12 yaş', duration: '2-3 Yıl', participants: '35+ Öğrenci', schedule: 'Pazartesi - Cuma', time: '09:00 - 15:00', description: 'Orta yaş grubundaki öğrencilerimiz için kapsamlı İslami eğitim programı.', features: ["Kur'an-ı Kerim tecvidi", "Temel Arapça dersleri", "İslam tarihi"], image: "/images/hicret/talebe 2.png", color: "from-purple-500 to-purple-600" },
      { id: 'hafizlik-programi', title: 'Hafızlık Programı', ageGroup: '7+ yaş', duration: '3-4 Yıl', participants: '60+ Hafız', schedule: 'Pazartesi - Cumartesi', time: '08:00 - 17:00', description: "Kur'an-ı Kerim'i ezberlemek isteyen öğrencilerimiz için özel program.", features: ["Kur'an-ı Kerim ezberi", "Tecvid kuralları", "Bireysel takip sistemi"], image: "/images/hicret/talebe 3.png", color: "from-emerald-500 to-emerald-600" },
      { id: 'arapca-egitimi', title: 'Arapça Dil Eğitimi', ageGroup: '10+ yaş', duration: '2-3 Yıl', participants: '40+ Öğrenci', schedule: 'Pazartesi - Perşembe', time: '14:00 - 17:00', description: 'Arapça dilini konuşma ve anlama düzeyinde öğrenmek isteyenler için.', features: ["Arapça gramer (Nahiv)", "Arapça morfoloji (Sarf)", "Konuşma pratiği"], image: "/images/hicret/talebe 4.png", color: "from-blue-500 to-blue-600" }
    ];

    return `<div class="site" data-theme="hicretdernegi" style="--p:#065f46;--a:#0284c7; font-family:'Poppins', sans-serif; background:#f9fafb;">
      ${this.headerHtml(o)}
      
      <section style="background:linear-gradient(135deg, #043425, #065f46); color:#fff; padding:80px 24px; text-align:center;">
        <div style="max-width:800px; margin:0 auto;">
          <span style="background:rgba(255,255,255,0.1); padding:6px 16px; border-radius:99px; font-size:11px; font-weight:700; display:inline-block; margin-bottom:16px;">✨ EĞİTİM FAALİYETLERİMİZ</span>
          <h1 style="font-size:2.8rem; font-weight:850; margin:0 0 12px;">Faaliyetlerimiz</h1>
          <p style="font-size:15px; color:#cbd5e1; margin:0;">Sıbyan mektebinden hafızlık programlarına, Arapça eğitiminden özel etkinliklere kadar geniş yelpazede İslami eğitim faaliyetlerimiz.</p>
        </div>
      </section>

      <section class="section" style="padding:60px 24px; background:#fff;">
        <div style="max-width:1100px; margin:0 auto;">
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:24px;">
            ${activities.map(a => `
              <div style="background:#fff; border:1px solid #e5e7eb; border-radius:20px; overflow:hidden; box-shadow:0 4px 15px rgba(0,0,0,0.02); display:flex; flex-direction:column; justify-content:between; height:100%;">
                <div style="height:180px; background:url('${a.image}') center/cover no-repeat; position:relative;">
                  <span style="position:absolute; top:12px; left:12px; background:#043425; color:#fff; font-size:10px; font-weight:700; padding:4px 10px; border-radius:20px;">${a.ageGroup}</span>
                </div>
                <div style="padding:20px; display:flex; flex-direction:column; flex-grow:1; justify-content:between;">
                  <div>
                    <h3 style="font-size:1.2rem; font-weight:800; color:#065f46; margin:0 0 8px;">${a.title}</h3>
                    <p style="font-size:12px; color:#64748b; line-height:1.5; margin-bottom:16px;">${a.description}</p>
                    <ul style="padding:0; list-style:none; font-size:11.5px; color:#475569; display:flex; flex-direction:column; gap:6px; margin-bottom:20px;">
                      ${a.features.map(f => `<li>• ${f}</li>`).join('')}
                    </ul>
                  </div>
                  <div style="font-size:11px; font-weight:700; color:#0284c7; border-top:1px solid #f3f4f6; pt:12px;">⏰ Zaman: ${a.schedule} (${a.time})</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      ${themeFooter(o, { bg: '#032017', font: "'Poppins', sans-serif" })}
    </div>`;
  },
  headerHtml(o) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    return `<div style="background:#043425; color:#cbd5e1; padding:6px 20px; display:flex; justify-content:space-between; align-items:center; font-size:11px; font-weight:600;">
        <div>📖 Hicret Medresesi İslami Eğitim Kurumu</div>
        <div style="display:flex; gap:16px;">
          <a href="${prefix}/portal" style="color:#cbd5e1; text-decoration:none;">👤 Veli Takip Portalı</a>
          <span>|</span>
          <a href="#/admin" style="color:#cbd5e1; text-decoration:none;">⚙️ Otomasyon</a>
        </div>
      </div>
      
      <header class="site-head" style="background:#fff; border-bottom:2px solid #059669; padding:12px 24px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 4px 12px rgba(0,0,0,0.05); position:sticky; top:0; z-index:100;">
        <a class="brand" href="${prefix}" style="display:flex; align-items:center; gap:12px; text-decoration:none;">
          <img src="/images/hicret/logooo.png" style="width:50px; height:50px; border-radius:50%; border:2px solid #059669;" />
          <div>
            <h1 style="font-size:1.15rem; font-weight:800; color:#065f46; margin:0; line-height:1.2;">HİCRET DERNEĞİ</h1>
            <p style="font-size:10px; color:#0284c7; font-weight:700; margin:0; text-transform:uppercase; letter-spacing:0.5px;">İslami Eğitim Kurumu</p>
          </div>
        </a>
        <nav style="display:flex; gap:20px; align-items:center;">
          <a href="${prefix}" style="color:#065f46; font-weight:700; text-decoration:none; font-size:14px;">Ana Sayfa</a>
          <a href="${prefix}/bolumler" style="color:#475569; font-weight:600; text-decoration:none; font-size:14px;">Eğitim Bölümleri</a>
          <a href="${prefix}/duyurular" style="color:#475569; font-weight:600; text-decoration:none; font-size:14px;">Duyurular</a>
          <a href="${prefix}/hakkimizda" style="color:#475569; font-weight:600; text-decoration:none; font-size:14px;">Hakkımızda</a>
          <a href="${prefix}/iletisim" style="color:#475569; font-weight:600; text-decoration:none; font-size:14px;">İletişim</a>
        </nav>
        <div style="display:flex; gap:10px;">
          <a href="${prefix}/basvuru" style="background:#2563eb; color:#fff; text-decoration:none; font-size:12px; font-weight:700; padding:8px 18px; border-radius:99px; box-shadow:0 4px 10px rgba(37,99,235,0.2);">BAŞVURU YAP</a>
          <a href="${prefix}/bagis/acil-yardim" style="background:#059669; color:#fff; text-decoration:none; font-size:12px; font-weight:700; padding:8px 18px; border-radius:99px; box-shadow:0 4px 10px rgba(5,150,105,0.2);">BAĞIŞ YAP</a>
        </div>
      </header>`;
  },

  checkout(o, c) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    const payMethod = state.hicret_paymethod || 'credit';
    const amount = state.hicret_amount || '200';
    const donor = state.hicret_donor || { firstName: '', lastName: '', email: '', phone: '', message: '' };
    const card = state.hicret_card || { number: '', expiry: '', cvv: '', name: '' };
    const loading = !!state.hicret_loading;
    const completed = !!state.hicret_completed;

    if (completed) {
      return `<div class="site" data-theme="hicretdernegi" style="--p:#065f46;--a:#0284c7; font-family:'Poppins', sans-serif; background:#f4f9f6; min-height:100vh; display:flex; flex-direction:column; justify-content:space-between;">
        ${this.headerHtml(o)}
        <main style="flex:1; display:flex; align-items:center; justify-content:center; padding:60px 24px;">
          <div style="max-width:480px; width:100%; background:#fff; border-radius:24px; box-shadow:0 20px 45px rgba(0,0,0,0.06); border:1px solid #d1fae5; padding:40px; text-align:center;">
            <div style="width:80px; height:80px; background:#ecfdf5; color:#047857; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:2.5rem; margin:0 auto 24px;">✓</div>
            <h2 style="font-size:1.75rem; font-weight:800; color:#065f46; margin:0 0 12px;">Ödemeniz Başarıyla Alındı</h2>
            <p style="font-size:14px; color:#4b5563; line-height:1.6; margin-bottom:32px;">Hicret Medresemize yaptığınız destek başarıyla sisteme kaydedilmiştir. Allah kabul etsin.</p>
            <div style="display:flex; flex-direction:column; gap:12px;">
              <a href="${prefix}" style="background:#059669; color:#fff; text-decoration:none; padding:14px; border-radius:12px; font-weight:700; font-size:14px; box-shadow:0 4px 12px rgba(5,150,105,0.25);">Ana Sayfaya Dön</a>
            </div>
          </div>
        </main>
        ${themeFooter(o, { bg: '#032017', font: "'Poppins', sans-serif" })}
      </div>`;
    }

    return `<div class="site" data-theme="hicretdernegi" style="--p:#065f46;--a:#0284c7; font-family:'Poppins', sans-serif; background:#f4f9f6; min-height:100vh;">
      ${this.headerHtml(o)}
      
      <section style="background:linear-gradient(135deg, #032017, #065f46); color:#fff; padding:60px 24px; text-align:center;">
        <div style="max-width:800px; margin:0 auto;">
          <h1 style="font-size:2.4rem; font-weight:800; margin:0 0 8px;">Medrese Güvenli Bağış Ödemesi</h1>
          <p style="font-size:14px; color:#a7f3d0; margin:0;">Talebe destekleri ve genel yardımlarınız için güvenli ödeme sayfası.</p>
        </div>
      </section>

      <section style="padding:48px 24px; max-width:1100px; margin:0 auto;">
        <div style="display:grid; grid-template-columns:1.8fr 1.2fr; gap:40px; align-items:start;">
          
          <div style="display:flex; flex-direction:column; gap:24px;">
            <div style="background:#fff; border:1px solid #e5e7eb; border-radius:24px; padding:32px; box-shadow:0 10px 30px rgba(0,0,0,0.01);">
              <h3 style="font-size:1.3rem; font-weight:800; color:#065f46; margin:0 0 20px;">1. Bağışçı Bilgileri</h3>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
                <input type="text" value="${esc(donor.firstName)}" oninput="state.hicret_donor = state.hicret_donor || {}; state.hicret_donor.firstName = this.value; render();" placeholder="Adınız *" style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" required />
                <input type="text" value="${esc(donor.lastName)}" oninput="state.hicret_donor = state.hicret_donor || {}; state.hicret_donor.lastName = this.value; render();" placeholder="Soyadınız *" style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" required />
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                <input type="email" value="${esc(donor.email)}" oninput="state.hicret_donor = state.hicret_donor || {}; state.hicret_donor.email = this.value; render();" placeholder="E-Posta Adresiniz *" style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" required />
                <input type="tel" value="${esc(donor.phone)}" oninput="state.hicret_donor = state.hicret_donor || {}; state.hicret_donor.phone = this.value; render();" placeholder="Telefon Numaranız *" style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" required />
              </div>
            </div>

            <div style="background:#fff; border:1px solid #e5e7eb; border-radius:24px; padding:32px; box-shadow:0 10px 30px rgba(0,0,0,0.01);">
              <h3 style="font-size:1.3rem; font-weight:800; color:#065f46; margin:0 0 20px;">2. Ödeme Metodu</h3>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                <button onclick="state.hicret_paymethod = 'credit'; render();" style="border:${payMethod === 'credit' ? '2px solid #059669' : '1px solid #cbd5e1'}; background:${payMethod === 'credit' ? '#ecfdf5' : '#fff'}; color:#065f46; padding:14px; border-radius:10px; font-weight:700; cursor:pointer;">💳 Kredi Kartı</button>
                <button onclick="state.hicret_paymethod = 'bank'; render();" style="border:${payMethod === 'bank' ? '2px solid #059669' : '1px solid #cbd5e1'}; background:${payMethod === 'bank' ? '#ecfdf5' : '#fff'}; color:#065f46; padding:14px; border-radius:10px; font-weight:700; cursor:pointer;">🏦 Havale / EFT</button>
              </div>
            </div>

            <div style="background:#fff; border:1px solid #e5e7eb; border-radius:24px; padding:32px; box-shadow:0 10px 30px rgba(0,0,0,0.01);">
              <h3 style="font-size:1.3rem; font-weight:800; color:#065f46; margin:0 0 20px;">3. Ödeme Detayları</h3>
              
              ${payMethod === 'credit' ? `
                <div style="display:flex; flex-direction:column; gap:16px;">
                  <input type="text" placeholder="Kart Numarası *" style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" />
                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                    <input type="text" placeholder="AA/YY *" style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" />
                    <input type="text" placeholder="CVV *" style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" />
                  </div>
                  <input type="text" placeholder="Kart Üzerindeki İsim *" style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" />
                </div>
              ` : `
                <div style="background:#f9fafb; border:1px solid #e5e7eb; padding:20px; border-radius:12px; font-size:13px; line-height:1.6; display:flex; flex-direction:column; gap:8px;">
                  <div><b>Banka:</b> Vakıf Katılım Bankası</div>
                  <div><b>Hesap Sahibi:</b> Hicret Derneği</div>
                  <div><b>IBAN:</b> TR98 0006 2000 0001 9876 5432 10</div>
                </div>
              `}

              <button onclick="state.hicret_loading = true; render(); setTimeout(() => { state.hicret_loading = false; state.hicret_completed = true; render(); }, 1200);" style="width:100%; background:#059669; color:#fff; border:0; padding:16px; border-radius:12px; font-weight:800; font-size:15px; margin-top:24px; cursor:pointer; box-shadow:0 4px 15px rgba(5,150,105,0.25);">
                ${loading ? 'İşleniyor...' : `Güvenli Ödeme Yap (₺${amount})`}
              </button>
            </div>
          </div>

          <div style="background:#fff; border:1px solid #e5e7eb; border-radius:24px; padding:32px; box-shadow:0 10px 30px rgba(0,0,0,0.01);">
            <h3 style="font-size:1.3rem; font-weight:800; color:#065f46; margin:0 0 20px; border-bottom:1px solid #f3f4f6; padding-bottom:12px;">Bağış Detayı</h3>
            <div style="display:flex; justify-content:space-between; font-size:13.5px; margin-bottom:12px;"><span style="color:#6b7280;">Proje:</span><span style="font-weight:700; color:#1f2937;">${esc(c.title)}</span></div>
            <div style="display:flex; justify-content:space-between; font-size:13.5px; margin-bottom:20px;"><span style="color:#6b7280;">Kategori:</span><span style="font-weight:700; color:#1f2937;">${esc(labels[c.category] || c.category)}</span></div>
            <div style="border-top:1px solid #f3f4f6; padding-top:16px; display:flex; justify-content:space-between; font-size:15px; font-weight:800; color:#065f46;">
              <span>TOPLAM:</span>
              <span>₺${amount}</span>
            </div>
          </div>

        </div>
      </section>

      ${themeFooter(o, { bg: '#032017', font: "'Poppins', sans-serif" })}
    </div>`;
  },

  basvuru(o) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    const sub = !!state.hicret_sub_app;
    if (sub) {
      return `<div class="site" data-theme="hicretdernegi" style="--p:#065f46;--a:#0284c7; font-family:'Poppins', sans-serif; background:#f4f9f6; min-height:100vh; display:flex; flex-direction:column; justify-content:space-between;">
        ${this.headerHtml(o)}
        <main style="flex:1; display:flex; align-items:center; justify-content:center; padding:60px 24px;">
          <div style="max-width:480px; width:100%; background:#fff; border-radius:24px; box-shadow:0 20px 45px rgba(0,0,0,0.06); border:1px solid #d1fae5; padding:40px; text-align:center;">
            <div style="width:80px; height:80px; background:#ecfdf5; color:#047857; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:2.5rem; margin:0 auto 24px;">✓</div>
            <h2 style="font-size:1.75rem; font-weight:800; color:#065f46; margin:0 0 12px;">Başvurunuz Kaydedildi</h2>
            <p style="font-size:14px; color:#4b5563; line-height:1.6; margin-bottom:32px;">Eğitim başvuru talebiniz başarıyla alınmıştır. Mülakat ve kayıt detayları veli telefonuna SMS ile iletilecektir.<br><b>Başvuru No:</b> <span style="font-weight:700; color:#065f46;">#BA2025001</span></p>
            <a href="${prefix}" style="display:block; background:#059669; color:#fff; text-decoration:none; padding:14px; border-radius:12px; font-weight:700; font-size:14px; box-shadow:0 4px 12px rgba(5,150,105,0.25);">Ana Sayfaya Dön</a>
          </div>
        </main>
        ${themeFooter(o, { bg: '#032017', font: "'Poppins', sans-serif" })}
      </div>`;
    }

    return `<div class="site" data-theme="hicretdernegi" style="--p:#065f46;--a:#0284c7; font-family:'Poppins', sans-serif; background:#f4f9f6; min-height:100vh;">
      ${this.headerHtml(o)}
      
      <section style="background:linear-gradient(135deg, #032017, #065f46); color:#fff; padding:60px 24px; text-align:center;">
        <div style="max-width:800px; margin:0 auto;">
          <h1 style="font-size:2.4rem; font-weight:800; margin:0 0 8px;">Öğrenci Kayıt Başvuru Formu</h1>
          <p style="font-size:14px; color:#a7f3d0; margin:0;">Hicret Medresesi Sıbyan, Hafızlık ve Arapça programları kayıt sayfası.</p>
        </div>
      </section>

      <section style="padding:48px 24px; max-width:800px; margin:0 auto;">
        <div style="background:#fff; border:1px solid #e5e7eb; border-radius:24px; padding:36px; box-shadow:0 10px 30px rgba(0,0,0,0.02);">
          
          <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-bottom:36px; text-align:center; border-bottom:1px solid #f3f4f6; padding-bottom:16px;">
            <div style="font-weight:700; font-size:12px; color:#065f46;">1. Başvuru</div>
            <div style="font-weight:600; font-size:12px; color:#9ca3af;">2. Değerlendirme</div>
            <div style="font-weight:600; font-size:12px; color:#9ca3af;">3. Mülakat</div>
            <div style="font-weight:600; font-size:12px; color:#9ca3af;">4. Kayıt</div>
          </div>

          <form onsubmit="event.preventDefault(); state.hicret_sub_app = true; render();" style="display:flex; flex-direction:column; gap:20px;">
            <div>
              <h4 style="font-size:13.5px; font-weight:800; color:#065f46; margin:0 0 12px; border-left:3px solid #059669; padding-left:8px;">Talebe (Öğrenci) Bilgileri</h4>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:12px;">
                <input type="text" placeholder="Talebe Adı Soyadı *" required style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" />
                <input type="text" placeholder="Doğum Yılı (Örn: 2015) *" required style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" />
              </div>
            </div>

            <div>
              <h4 style="font-size:13.5px; font-weight:800; color:#065f46; margin:0 0 12px; border-left:3px solid #059669; padding-left:8px;">Veli İletişim Bilgileri</h4>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:12px;">
                <input type="text" placeholder="Veli Adı Soyadı *" required style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" />
                <input type="tel" placeholder="Telefon Numarası *" required style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" />
              </div>
            </div>

            <div>
              <h4 style="font-size:13.5px; font-weight:800; color:#065f46; margin:0 0 12px; border-left:3px solid #059669; padding-left:8px;">Eğitim Programı & Tercih</h4>
              <select required style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;">
                <option value="">Medrese Programı Seçin... *</option>
                <option value="sibyan">Sıbyan Mektebi (4-7 Yaş Okul Öncesi)</option>
                <option value="ibtida">İbtida Mektebi (İlkokul Destek)</option>
                <option value="hafizlik">Hafızlık Hazırlık & Hafızlık Sınıfı</option>
                <option value="arapca">Arapça Hazırlık & İslami İlimler</option>
              </select>
            </div>

            <button type="submit" style="background:#059669; color:#fff; border:0; padding:16px; border-radius:12px; font-weight:800; font-size:15px; cursor:pointer; box-shadow:0 4px 12px rgba(5,150,105,0.25);">Kayıt Başvurusunu Gönder</button>
          </form>

        </div>
      </section>

      ${themeFooter(o, { bg: '#032017', font: "'Poppins', sans-serif" })}
    </div>`;
  },

  bolumler(o) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    const list = [
      { id: 'sibyan', title: 'Sıbyan Mektebi', age: '4 - 7 Yaş', desc: 'Erken yaşta Kur\'an-ı Kerim elif-bası, temel dini bilgiler, ahlak eğitimleri ve okul öncesi gelişim.', lessons: 'Kur\'an-ı Kerim, Dua Ezberi, Ahlak, Adab-ı Muaşeret' },
      { id: 'ibtida', title: 'İbtida Mektebi', age: '8 - 12 Yaş', desc: 'İlkokul çağındaki çocuklara okul dersleri ile birlikte temel tecvid, adab, ezber ve Kur\'an-ı Kerim eğitimi.', lessons: 'Mahreç, Tecvid, İlmihal, Temel Hadisler' },
      { id: 'hafizlik', title: 'Hafızlık Sınıfı', age: '10+ Yaş', desc: 'Kur\'an-ı Kerim\'i ezberleme metodolojisi, hafızlık hazırlık dersleri ve yoğun hafızlık ezber müfredatı.', lessons: 'Kur\'an Ezberi, Sağ-Sol Ezber Takibi, Hasıl Okuma' },
      { id: 'arapca', title: 'Arapça & İslami İlimler', age: '12+ Yaş', desc: 'Arapça dil bilgisi (Sarf-Nahiv), tefsir dersleri, fıkıh, akaid ve İslam tarihi usulleri eğitimi.', lessons: 'Sarf, Nahiv, Fıkıh Usulü, Hadis Usulü, Tefsir' }
    ];

    return `<div class="site" data-theme="hicretdernegi" style="--p:#065f46;--a:#0284c7; font-family:'Poppins', sans-serif; background:#f4f9f6; min-height:100vh;">
      ${this.headerHtml(o)}
      
      <section style="background:linear-gradient(135deg, #032017, #065f46); color:#fff; padding:60px 24px; text-align:center;">
        <div style="max-width:800px; margin:0 auto;">
          <h1 style="font-size:2.4rem; font-weight:800; margin:0 0 8px;">Eğitim Bölümlerimiz</h1>
          <p style="font-size:14px; color:#a7f3d0; margin:0;">Hicret Medresemizdeki tüm eğitim şubeleri ve program detayları.</p>
        </div>
      </section>

      <section style="padding:48px 24px; max-width:1100px; margin:0 auto;">
        <div style="display:grid; grid-template-columns:1fr; gap:32px;">
          ${list.map(l => `
            <div style="background:#fff; border:1px solid #e5e7eb; border-radius:24px; padding:32px; box-shadow:0 10px 30px rgba(0,0,0,0.01); display:grid; grid-template-columns:1.5fr 1fr; gap:24px; align-items:center;">
              <div>
                <span style="background:#ecfdf5; color:#047857; font-size:11px; font-weight:700; padding:4px 10px; border-radius:4px; display:inline-block; margin-bottom:12px;">${l.age}</span>
                <h3 style="font-size:1.6rem; font-weight:800; color:#065f46; margin:0 0 12px;">${l.title}</h3>
                <p style="font-size:13.5px; color:#4b5563; line-height:1.6; margin-bottom:16px;">${l.desc}</p>
                <div style="font-size:12.5px; color:#6b7280;"><b>Ders İçerikleri:</b> ${l.lessons}</div>
              </div>
              <div style="text-align:right;">
                <a href="${prefix}/basvuru" style="display:inline-block; background:#059669; color:#fff; text-decoration:none; padding:12px 24px; border-radius:8px; font-weight:700; font-size:13px; box-shadow:0 4px 12px rgba(5,150,105,0.25);">Kayıt Başvurusu Yap</a>
              </div>
            </div>
          `).join('')}
        </div>
      </section>

      ${themeFooter(o, { bg: '#032017', font: "'Poppins', sans-serif" })}
    </div>`;
  },

  duyurular(o) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    const list = [
      { id: 1, title: 'Yaz Dönemi Hafızlık Programı Başvuruları Başladı', excerpt: 'Yaz tatilini değerlendirmek isteyen öğrenciler için özel hafızlık programımıza başvurular başlamıştır.', date: '15 Mayıs 2025', author: 'Medrese İdaresi' },
      { id: 2, title: 'Yeni Eğitim Dönemi Kayıtları Hakkında Duyuru', excerpt: 'Yeni dönem kayıt koşulları, kontenjan durumu ve ders programları belirlendi.', date: '20 Nisan 2025', author: 'İdare' },
      { id: 3, title: 'Arapça Sınıfı Mezuniyet Merasimi Gerçekleştirildi', excerpt: '3 yıllık eğitimini tamamlayan Arapça bölümü talebelerimize icazetleri takdim edildi.', date: '25 Mart 2025', author: 'Arapça Bölümü' }
    ];

    return `<div class="site" data-theme="hicretdernegi" style="--p:#065f46;--a:#0284c7; font-family:'Poppins', sans-serif; background:#f4f9f6; min-height:100vh;">
      ${this.headerHtml(o)}
      
      <section style="background:linear-gradient(135deg, #032017, #065f46); color:#fff; padding:60px 24px; text-align:center;">
        <div style="max-width:800px; margin:0 auto;">
          <h1 style="font-size:2.4rem; font-weight:800; margin:0 0 8px;">Medrese Duyuruları</h1>
          <p style="font-size:14px; color:#a7f3d0; margin:0;">Hicret Medresesi duyuruları, haberleri ve bülten bildirimleri.</p>
        </div>
      </section>

      <section style="padding:48px 24px; max-width:900px; margin:0 auto;">
        <div style="display:flex; flex-direction:column; gap:24px;">
          ${list.map(d => `
            <article style="background:#fff; border:1px solid #e5e7eb; border-radius:20px; padding:28px; box-shadow:0 10px 30px rgba(0,0,0,0.01);">
              <div style="display:flex; justify-content:space-between; font-size:11.5px; color:#9ca3af; margin-bottom:12px;">
                <span>📅 ${d.date}</span>
                <span>✍ ${d.author}</span>
              </div>
              <h3 style="font-size:1.3rem; font-weight:800; color:#065f46; margin:0 0 8px;">${d.title}</h3>
              <p style="font-size:13px; color:#4b5563; line-height:1.6; margin:0;">${d.excerpt}</p>
            </article>
          `).join('')}
        </div>
      </section>

      ${themeFooter(o, { bg: '#032017', font: "'Poppins', sans-serif" })}
    </div>`;
  },

  portal(o) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    const active = state.hicret_portal_student || '1';
    const students = [
      { id: '1', name: 'Ahmet Yılmaz', class: 'Hafızlık - A Sınıfı', attendance: 95, grade: 88, progress: 85 },
      { id: '2', name: 'Fatma Kaya', class: 'Sıbyan - B Sınıfı', attendance: 88, grade: 92, progress: 95 }
    ];
    const s = students.find(st => st.id === active) || students[0];

    return `<div class="site" data-theme="hicretdernegi" style="--p:#065f46;--a:#0284c7; font-family:'Poppins', sans-serif; background:#f4f9f6; min-height:100vh;">
      ${this.headerHtml(o)}
      
      <section style="background:linear-gradient(135deg, #032017, #065f46); color:#fff; padding:48px 24px; text-align:center;">
        <h1 style="font-size:2.2rem; font-weight:800; margin:0 0 6px;">Öğrenci Veli Takip Portalı</h1>
        <p style="font-size:13px; color:#a7f3d0; margin:0;">Talebelerimizin devamsızlık, ders ilerleme ve başarı karnesini anlık takip edin.</p>
      </section>

      <section style="padding:20px 24px; background:#fff; border-bottom:1px solid #e5e7eb; display:flex; justify-content:center; gap:16px;">
        ${students.map(st => `
          <button onclick="state.hicret_portal_student = '${st.id}'; render();" style="border:0; background:${active === st.id ? '#059669' : '#f3f4f6'}; color:${active === st.id ? '#fff' : '#4b5563'}; font-weight:700; padding:10px 20px; border-radius:8px; cursor:pointer; font-size:13px; transition:0.2s;">
            ${st.name}
          </button>
        `).join('')}
      </section>

      <section style="padding:48px 24px; max-width:900px; margin:0 auto;">
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:20px; margin-bottom:32px;">
          <div style="background:#fff; border:1px solid #e5e7eb; padding:20px; border-radius:16px; text-align:center;">
            <div style="font-size:24px; font-weight:800; color:#059669; margin-bottom:4px;">${s.attendance}%</div>
            <div style="font-size:12.5px; color:#6b7280; font-weight:700;">Devam Oranı</div>
          </div>
          <div style="background:#fff; border:1px solid #e5e7eb; padding:20px; border-radius:16px; text-align:center;">
            <div style="font-size:24px; font-weight:800; color:#0284c7; margin-bottom:4px;">${s.grade}</div>
            <div style="font-size:12.5px; color:#6b7280; font-weight:700;">Genel Ortalama</div>
          </div>
          <div style="background:#fff; border:1px solid #e5e7eb; padding:20px; border-radius:16px; text-align:center;">
            <div style="font-size:24px; font-weight:800; color:#b45309; margin-bottom:4px;">%${s.progress}</div>
            <div style="font-size:12.5px; color:#6b7280; font-weight:700;">Ders İlerleme</div>
          </div>
        </div>

        <div style="background:#fff; border:1px solid #e5e7eb; border-radius:24px; padding:32px; box-shadow:0 10px 30px rgba(0,0,0,0.01);">
          <h3 style="font-size:1.3rem; font-weight:800; color:#065f46; margin:0 0 20px; border-bottom:1px solid #f3f4f6; padding-bottom:12px;">Haftalık Ders Takvimi</h3>
          <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:12px; text-align:center;">
            ${['Pzt', 'Sal', 'Çar', 'Per', 'Cum'].map(day => `
              <div style="border:1px solid #f3f4f6; padding:12px; border-radius:8px; background:#f9fafb;">
                <b style="font-size:12.5px; color:#1f2937; display:block; margin-bottom:6px;">${day}</b>
                <span style="font-size:10.5px; color:#059669; font-weight:700;">Kur'an-ı Kerim</span>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      ${themeFooter(o, { bg: '#032017', font: "'Poppins', sans-serif" })}
    </div>`;
  },

  gizlilik(o) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    return `<div class="site" data-theme="hicretdernegi" style="--p:#065f46;--a:#0284c7; font-family:'Poppins', sans-serif; background:#f4f9f6; min-height:100vh;">
      ${this.headerHtml(o)}
      
      <section style="background:linear-gradient(135deg, #032017, #065f46); color:#fff; padding:60px 24px; text-align:center;">
        <div style="max-width:800px; margin:0 auto;">
          <h1 style="font-size:2.4rem; font-weight:800; margin:0 0 8px;">Gizlilik Politikası</h1>
          <p style="font-size:14px; color:#a7f3d0; margin:0;">Medresemiz yasal aydınlatma ve gizlilik esasları.</p>
        </div>
      </section>

      <section style="padding:48px 24px; max-width:800px; margin:0 auto;">
        <div style="background:#fff; border:1px solid #e5e7eb; border-radius:24px; padding:36px; box-shadow:0 10px 30px rgba(0,0,0,0.01); line-height:1.6; font-size:13px; color:#4b5563;">
          <h4 style="font-weight:800; color:#065f46; font-size:14px; margin-top:0;">KVKK Bilgilendirmesi</h4>
          <p style="margin-bottom:16px;">Öğrenci başvuru ve veli takip platformlarında paylaştığınız tüm kişisel veriler, Kişisel Verilerin Korunması Kanunu uyarınca koruma altında olup hiçbir şekilde üçüncü taraflara aktarılmaz.</p>
          <h4 style="font-weight:800; color:#065f46; font-size:14px;">Çerez Politikası</h4>
          <p style="margin:0;">Veli takip portalı ve kayıt formlarında oturum güvenliği ve tercih takibi amacıyla zorunlu teknik çerezler kullanılmaktadır.</p>
        </div>
      </section>

      ${themeFooter(o, { bg: '#032017', font: "'Poppins', sans-serif" })}
    </div>`;
  }
};


/* ══════════════════════════════════════════════════════════════
   THEME 12: KARDESLIK PAYI (kardeslikpayi.org)
   Modern Turkuaz/Teal NGO, soft cards, quick donation widget
   ══════════════════════════════════════════════════════════════ */
themeLayouts.kardeslikpayi = {
  home(o, list) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    const cs = state.currentSlideIndex || 0;
    const slides = [
      { id: 1, image: "/images/kardeslik/genel-bagislar.png", title: "Afrika'da Umut Oluyoruz", subtitle: 'HAKDER', description: "İnsanî yardım ve eğitim faaliyetlerimizle Afrika'daki kardeşlerimize destek veriyoruz. Kurban organizasyonlarıyla ailelerin sofralarına sıcak yemek ulaştırıyoruz. Medrese öğrencilerine burs ve eğitim materyali sağlıyoruz." },
      { id: 2, image: "/images/kardeslik/mahmud-ustaosmanoglu-hazretleri-ks-su-kuyusu-projesi.png", title: 'Medrese Talebelerine Destek', subtitle: 'EĞİTİM', description: "Medrese talebelerine düzenli burs ve barınma desteği sağlıyoruz. Öğrencilerin eğitim materyalleri ve kırtasiye ihtiyaçlarını karşılıyoruz. Gelecek nesiller için sürdürülebilir eğitim fırsatları inşa ediyoruz." },
      { id: 3, image: "/images/kardeslik/haci-ali-elcin-camii-insaati.png", title: 'Su Kuyuları ile Hayat', subtitle: 'YARDIM', description: "Temiz su kuyuları açarak köy ve kasabalarda hijyen ve sağlık koşullarını iyileştiriyoruz. Suya erişim sayesinde çocuklarımızın okul devamlılığı ve günlük yaşam standardı yükseliyor." }
    ];

    const slide = slides[cs] || slides[0];

    const cardsHtml = list.map(c => {
      const p = pct(c.collected, c.target);
      return `
        <div class="kardeslik-card" style="background:#fff; border-radius:24px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.04); border:1px solid #e2e8f0; display:flex; flex-direction:column; height:100%;">
          <div style="height:200px; background:url('${c.image || '/images/kardeslik/genel-bagislar.png'}') center/cover no-repeat; position:relative;">
            <div style="position:absolute; top:12px; left:12px; display:flex; gap:8px;">
              <span style="background:${c.featured ? '#dc2626' : '#174C3B'}; color:#fff; font-size:10px; font-weight:700; padding:4px 10px; border-radius:6px; text-transform:uppercase;">${c.featured ? 'Acil' : 'Devam'}</span>
            </div>
          </div>
          <div style="padding:24px; display:flex; flex-direction:column; flex-grow:1; justify-content:space-between;">
            <div>
              <h3 style="font-size:1.15rem; font-weight:800; color:#1e293b; margin:0 0 8px; line-height:1.3;">${c.title}</h3>
              <p style="font-size:13px; color:#64748b; line-height:1.6; margin-bottom:20px; height:80px; overflow:hidden;">${c.description}</p>
              
              <div style="margin-bottom:20px;">
                <div style="display:flex; justify-content:space-between; font-size:11px; color:#64748b; margin-bottom:6px;">
                  <span>Hedef</span>
                  <span style="font-weight:700; color:#1e293b;">${money(c.target)}</span>
                </div>
                <div style="height:8px; background:#f1f5f9; border-radius:4px; overflow:hidden; position:relative;">
                  <div style="width:${p}%; height:100%; background:#174C3B; border-radius:4px;"></div>
                </div>
                <div style="margin-top:8px; display:flex; justify-content:space-between; font-size:11.5px; color:#64748b;">
                  <span>Toplanan: <b>${money(c.collected)}</b></span>
                  <span style="font-weight:700; color:#174C3B;">%${p}</span>
                </div>
              </div>
            </div>
            
            <a href="${prefix}/bagis/${c.slug}" style="display:inline-flex; width:100%; justify-content:center; align-items:center; background:#174C3B; color:#fff; text-decoration:none; font-size:13px; font-weight:700; padding:12px; border-radius:12px; box-shadow:0 4px 12px rgba(23,76,59,0.15); transition:all 0.2s;">Destek Ol <span style="margin-left:4px;">➔</span></a>
          </div>
        </div>
      `;
    }).join('');

    return `<div class="site" data-theme="kardeslikpayi" style="--p:#174C3B;--a:#93740C; font-family:'Outfit', sans-serif; background:#f8fafc;">
      ${this.headerHtml(o)}
      
      <main>
        <!-- ModernCompactHero Section from Next.js -->
        <section style="position:relative; background:#174C3B; padding:48px 24px 140px; overflow:hidden;">
          <div style="max-width:1200px; margin:0 auto; display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:32px; align-items:center; position:relative; z-index:2;">
            
            <!-- Content card (Left) -->
            <div style="background:rgba(255,255,255,0.98); backdrop-filter:blur(8px); padding:32px; border-radius:24px; box-shadow:0 20px 40px rgba(0,0,0,0.15); max-width:540px;">
              <span style="background:#0f5a42; color:#fff; font-size:10px; font-weight:700; padding:4px 12px; border-radius:4px; display:inline-block; margin-bottom:12px; text-transform:uppercase;">${slide.subtitle}</span>
              <h2 style="font-size:2rem; font-weight:900; color:#1e293b; line-height:1.2; margin:0 0 12px;">${slide.title}</h2>
              <p style="font-size:13.5px; color:#475569; line-height:1.6; margin-bottom:24px;">${slide.description}</p>
              
              <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:24px;">
                <a href="${prefix}/bagis/acil-yardim" style="background:#0f5a42; color:#fff; font-weight:700; text-decoration:none; padding:12px 24px; border-radius:30px; font-size:13px; display:inline-flex; align-items:center; gap:6px;">Hemen Bağış Yap ➔</a>
                <a href="${prefix}/projelerimiz" style="background:#93740C; color:#fff; font-weight:700; text-decoration:none; padding:12px 24px; border-radius:8px; font-size:13px;">Projelerimiz</a>
              </div>

              <!-- Quick donation presets -->
              <div style="border-top:1px solid #e2e8f0; pt:16px;">
                <div style="font-size:11px; font-weight:700; color:#64748b; margin-bottom:8px; text-transform:uppercase;">Hızlı Bağış</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  ${[50, 100, 250, 500].map(amt => `
                    <a href="${prefix}/bagis/acil-yardim?amount=${amt}" style="background:#f1f5f9; color:#1e293b; font-weight:700; text-decoration:none; padding:8px 16px; border-radius:20px; font-size:12px;">₺${amt}</a>
                  `).join('')}
                </div>
              </div>
            </div>

            <!-- Image (Right) -->
            <div style="position:relative; height:380px; border-radius:24px; overflow:hidden; box-shadow:0 20px 50px rgba(0,0,0,0.3);">
              <div style="position:absolute; inset:0; background:url('${slide.image}') center/cover no-repeat;"></div>
              <div style="position:absolute; inset:0; background:rgba(0,0,0,0.15);"></div>
            </div>

          </div>

          <!-- Slider detailed navigator (Bottom center overlay) -->
          <div style="position:absolute; bottom:-60px; left:0; right:0; z-index:10; display:flex; justify-content:center; padding:0 24px;">
            <div style="background:#fff; border-radius:24px; box-shadow:0 15px 35px rgba(0,0,0,0.1); border:1px solid #f1f5f9; padding:16px; display:flex; gap:16px; overflow-x:auto; max-width:850px; pointer-events:auto;">
              ${slides.map((s, idx) => `
                <button onclick="state.currentSlideIndex = ${idx}; render();" style="border:0; background:none; padding:0; display:flex; align-items:center; gap:12px; width:220px; text-align:left; cursor:pointer; flex-shrink:0; opacity:${idx === cs ? '1' : '0.65'}; transition:opacity 0.2s;">
                  <div style="width:70px; height:44px; background:url('${s.image}') center/cover no-repeat; border-radius:8px; flex-shrink:0;"></div>
                  <span style="font-size:12px; font-weight:800; color:#1e293b; line-height:1.2; display:block;">${s.title}</span>
                </button>
              `).join('')}
            </div>
          </div>

        </section>

        <!-- Spacer for Carousel navigator -->
        <div style="height:80px;"></div>

        <!-- SMS ile Bağış Şeridi -->
        <section style="background:linear-gradient(rgba(23,76,59,0.9), rgba(23,76,59,0.9)), url('/images/kardeslik/genel-bagislar.png') center/cover no-repeat; color:#fff; padding:60px 24px; text-align:center;">
          <h3 style="font-size:1.8rem; font-weight:800; margin:0 0 12px;">SMS ile Anında Bağış</h3>
          <p style="font-size:15px; margin:0 0 24px; color:#cbd5e1;"><b>HAKDER</b> yazıp <b>7230</b>'a göndererek 50₺ bağış yapabilirsiniz.</p>
          <div style="display:flex; justify-content:center; gap:16px; flex-wrap:wrap; max-width:800px; margin:0 auto;">
            <div style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); padding:16px; border-radius:16px; min-width:180px;">
              <div style="font-size:12px; font-weight:800; color:#f59e0b; margin-bottom:4px;">1. ADIM</div>
              <div style="font-size:13px;">HAKDER yazın</div>
            </div>
            <div style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); padding:16px; border-radius:16px; min-width:180px;">
              <div style="font-size:12px; font-weight:800; color:#f59e0b; margin-bottom:4px;">2. ADIM</div>
              <div style="font-size:13px;">7230'a gönderin</div>
            </div>
            <div style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); padding:16px; border-radius:16px; min-width:180px;">
              <div style="font-size:12px; font-weight:800; color:#f59e0b; margin-bottom:4px;">3. ADIM</div>
              <div style="font-size:13px;">50₺ bağış yapın</div>
            </div>
          </div>
        </section>

        <!-- Kardeşlik Payı Quick Donation Widget -->
        ${renderKpQuickDonation(o)}

        <!-- Custom Campaign Grid matching Next.js -->
        <section class="section" style="padding:60px clamp(18px,5vw,72px); background:#fff;">
          <div style="display:flex; justify-content:space-between; align-items:end; margin-bottom:32px;">
            <h2 style="font-size:2rem; font-weight:900; color:#174C3B; margin:0;">Güncel Projeler</h2>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:32px;">
            ${cardsHtml}
          </div>
        </section>

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
  about(o, list) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    const values = [
      { icon: "🛡️", title: "Güvenilirlik", description: "Tüm yardımlarımızı şeffaf ve hesap verebilir şekilde gerçekleştiriyoruz. Bağışçılarımızın güvenini korumak en önemli önceliğimizdir." },
      { icon: "🤝", title: "Dayanışma", description: "İnsanlık ailesinin bir parçası olarak, kardeşlerimizin acılarını paylaşıyor ve onlara yardım eli uzatıyoruz." },
      { icon: "📚", title: "Eğitim", description: "Afrika'daki İslami medreselerde okuyan talebelere eğitim desteği sağlayarak gelecek nesillere yatırım yapıyoruz." }
    ];

    return `<div class="site" data-theme="kardeslikpayi" style="--p:#174C3B;--a:#93740C; font-family:'Outfit', sans-serif; background:#f8fafc;">
      ${this.headerHtml(o)}
      
      <section style="background:linear-gradient(135deg, #0d1b1e, #174C3B); color:#fff; padding:80px 24px; text-align:center;">
        <div style="max-width:800px; margin:0 auto;">
          <span style="background:rgba(255,255,255,0.1); padding:6px 16px; border-radius:99px; font-size:11px; font-weight:700; display:inline-block; margin-bottom:16px;">❤️ HAKDER HAKKINDA</span>
          <h1 style="font-size:3rem; font-weight:900; margin:0 0 16px;">Hakkımızda</h1>
          <p style="font-size:16px; color:#cbd5e1; margin:0;">Afrika'da Umut Dağıtan Bir Yardım Köprüsü. İnsani yardım ve İslami değerleri yaşatma misyonumuz.</p>
        </div>
      </section>

      <section class="section" style="padding:60px 24px; background:#fff;">
        <div style="max-width:1000px; margin:0 auto;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:32px; align-items:center; margin-bottom:48px;">
            <div style="background:#f9fafb; border:1px solid #e5e7eb; padding:32px; border-radius:20px;">
              <h2 style="font-size:1.8rem; font-weight:800; color:#174C3B; margin:0 0 16px;">Misyonumuz</h2>
              <p style="font-size:13.5px; color:#475569; line-height:1.6; margin:0;">HAKDER (Hayra Açılan Kapı İnsanî Yardım ve Sosyal Dayanışma Derneği) olarak, Afrika kıtasında yaşayan kardeşlerimize insani yardım ulaştırma ve İslami değerleri yaşatma konusunda öncü bir kuruluş olmayı hedefliyoruz.</p>
            </div>
            <div style="background:#fff; border:2px solid #93740C; padding:32px; border-radius:20px; text-align:center;">
              <span style="font-size:2.5rem; display:block; margin-bottom:12px;">🌍</span>
              <h3 style="font-size:1.3rem; font-weight:800; color:#174C3B; margin:0 0 12px;">Afrika'ya Uzanan El</h3>
              <p style="font-size:13px; color:#64748b; line-height:1.5; margin:0;">2010 yılından bu yana Afrika'nın çeşitli ülkelerinde kurban hizmetleri ve İslami medrese talebelerine eğitim desteği sağlıyoruz.</p>
            </div>
          </div>

          <h2 style="font-size:2rem; font-weight:800; color:#174C3B; text-align:center; margin-bottom:32px;">Değerlerimiz</h2>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:24px;">
            ${values.map(v => `
              <div style="background:#f9fafb; border:1px solid #e5e7eb; padding:28px; border-radius:16px; text-align:center;">
                <div style="width:50px; height:50px; background:#93740C; color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.5rem; margin:0 auto 16px;">${v.icon}</div>
                <h3 style="font-size:1.15rem; font-weight:800; color:#174C3B; margin:0 0 8px;">${v.title}</h3>
                <p style="font-size:12.5px; color:#64748b; line-height:1.5; margin:0;">${v.description}</p>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      <!-- CTA -->
      <section style="background:#174C3B; color:#fff; padding:60px 24px; text-align:center;">
        <h2 style="font-size:2rem; font-weight:800; margin:0 0 12px;">Bize Katılın</h2>
        <p style="font-size:15px; color:#cbd5e1; max-width:600px; margin:0 auto 24px;">Afrika'daki kardeşlerimize umut olmak ve onların hayatlarına dokunmak için bizimle birlikte hareket edin.</p>
        <div style="display:flex; justify-content:center; gap:12px;">
          <a href="${prefix}/bagis/acil-yardim" style="background:#fff; color:#174C3B; padding:12px 28px; border-radius:8px; font-weight:700; text-decoration:none; font-size:13px;">Bağış Yap</a>
          <a href="${prefix}/iletisim" style="border:2px solid #fff; color:#fff; padding:12px 28px; border-radius:8px; font-weight:700; text-decoration:none; font-size:13px;">İletişime Geç</a>
        </div>
      </section>

      ${themeFooter(o, { bg: '#0a1416', font: "'Outfit', sans-serif" })}
    </div>`;
  },
  contact(o, list) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    return `<div class="site" data-theme="kardeslikpayi" style="--p:#174C3B;--a:#93740C; font-family:'Outfit', sans-serif; background:#f8fafc;">
      ${this.headerHtml(o)}
      
      <section style="background:linear-gradient(135deg, #0d1b1e, #174C3B); color:#fff; padding:80px 24px; text-align:center;">
        <div style="max-width:800px; margin:0 auto;">
          <span style="background:rgba(255,255,255,0.1); padding:6px 16px; border-radius:99px; font-size:11px; font-weight:700; display:inline-block; margin-bottom:16px;">✉ BİZİMLE İLETİŞİME GEÇİN</span>
          <h1 style="font-size:2.8rem; font-weight:900; margin:0 0 12px;">İletişim</h1>
          <p style="font-size:15px; color:#cbd5e1; margin:0;">Sorularınız, önerileriniz ve yardım talepleriniz için bizimle iletişime geçmekten çekinmeyin.</p>
        </div>
      </section>

      <section class="section" style="padding:60px 24px; background:#fff;">
        <div style="max-width:1100px; margin:0 auto; display:grid; grid-template-columns:1.2fr 1.8fr; gap:40px;">
          
          <!-- Info -->
          <div>
            <div style="background:#f9fafb; border:1px solid #e5e7eb; padding:28px; border-radius:20px; box-shadow:0 4px 12px rgba(0,0,0,0.02);">
              <h2 style="font-size:1.4rem; font-weight:800; color:#174C3B; margin:0 0 20px;">İletişim Bilgileri</h2>
              
              <div style="display:flex; flex-direction:column; gap:20px;">
                <div>
                  <h4 style="font-weight:700; color:#174C3B; margin:0 0 4px; font-size:13px;">📍 Adresimiz</h4>
                  <p style="font-size:12.5px; color:#475569; margin:0; line-height:1.5;">Hicret İslami İlimler Medresesi<br>71 Evler Mh. Esenyazı Sk. No:41<br>Odunpazarı, Eskişehir, Türkiye</p>
                </div>
                <div>
                  <h4 style="font-weight:700; color:#174C3B; margin:0 0 4px; font-size:13px;">📞 Telefon & WhatsApp</h4>
                  <p style="font-size:12.5px; color:#475569; margin:0;">+90 542 641 26 26</p>
                </div>
                <div>
                  <h4 style="font-weight:700; color:#174C3B; margin:0 0 4px; font-size:13px;">✉ E-posta</h4>
                  <p style="font-size:12.5px; color:#475569; margin:0;">hicretdernegi26@gmail.com</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Form -->
          <div>
            <div style="background:#fff; border:1px solid #e5e7eb; padding:32px; border-radius:24px; box-shadow:0 4px 20px rgba(0,0,0,0.03);">
              <h2 style="font-size:1.5rem; font-weight:800; color:#174C3B; margin:0 0 8px; text-align:center;">Bize Ulaşın</h2>
              <p style="font-size:12px; color:#64748b; text-align:center; margin-bottom:24px;">Mesajınızı gönderin, en kısa sürede size dönüş yapalım.</p>
              
              <form data-form="contact" style="display:flex; flex-direction:column; gap:16px;">
                <input type="hidden" name="orgSlug" value="${o.slug}">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                  <div>
                    <label style="font-size:11px; font-weight:700; color:#475569; display:block; margin-bottom:4px;">Ad Soyad *</label>
                    <input type="text" name="name" required placeholder="Adınız" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px; font-size:13px;">
                  </div>
                  <div>
                    <label style="font-size:11px; font-weight:700; color:#475569; display:block; margin-bottom:4px;">E-Posta *</label>
                    <input type="email" name="email" required placeholder="E-Posta Adresiniz" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px; font-size:13px;">
                  </div>
                </div>
                <div>
                  <label style="font-size:11px; font-weight:700; color:#475569; display:block; margin-bottom:4px;">Telefon</label>
                  <input type="text" name="phone" placeholder="05xx xxx xx xx" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px; font-size:13px;">
                </div>
                <div>
                  <label style="font-size:11px; font-weight:700; color:#475569; display:block; margin-bottom:4px;">Mesajınız *</label>
                  <textarea name="message" required placeholder="Mesajınız..." style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px; font-size:13px; height:100px;"></textarea>
                </div>
                <button type="submit" style="background:#174C3B; color:#fff; border:0; padding:12px; font-weight:700; border-radius:8px; font-size:14px; cursor:pointer;">MESAJ GÖNDER</button>
              </form>
            </div>
          </div>

        </div>
      </section>

      <!-- FAQ Section -->
      <section style="padding:60px 24px; background:#f9fafb; border-top:1px solid #e5e7eb;">
        <div style="max-width:900px; margin:0 auto;">
          <h2 style="font-size:1.8rem; font-weight:800; color:#174C3B; text-align:center; margin-bottom:32px;">Sıkça Sorulan Sorular</h2>
          <div style="display:flex; flex-direction:column; gap:16px;">
            <div style="background:#fff; border:1px solid #e5e7eb; padding:20px; border-radius:12px;">
              <b style="color:#174C3B; font-size:14px;">Kurban bağışımın gerçekten Afrika'da kesildiğinden nasıl emin olabilirim?</b>
              <p style="margin:6px 0 0; font-size:12.5px; color:#475569; line-height:1.5;">HAKDER olarak her kurban kesim faaliyetimizi fotoğraf ve video raporları ile belgelendiriyoruz. Kurban bağışçılarımıza kurbanlarının hangi bölgede kesildiğine dair bilgilendirme yapıyor ve görsel kanıtlar sunuyoruz.</p>
            </div>
            <div style="background:#fff; border:1px solid #e5e7eb; padding:20px; border-radius:12px;">
              <b style="color:#174C3B; font-size:14px;">Afrika'daki medrese talebelerine nasıl destek olabilirim?</b>
              <p style="margin:6px 0 0; font-size:12.5px; color:#475569; line-height:1.5;">Talebe sponsorluğu programımız ile aylık düzenli bağışlar yaparak bir talebenin eğitim, barınma ve beslenme ihtiyaçlarını karşılayabilirsiniz.</p>
            </div>
          </div>
        </div>
      </section>

      ${themeFooter(o, { bg: '#0a1416', font: "'Outfit', sans-serif" })}
    </div>`;
  },
  projects(o, list) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    const slides = [
      { id: 1, title: "Afrika'da Umut Oluyoruz", subtitle: 'HAKDER', description: "İnsanî yardım ve eğitim faaliyetlerimizle Afrika'daki kardeşlerimize destek veriyoruz. Kurban organizasyonlarıyla ailelerin sofralarına sıcak yemek ulaştırıyoruz.", image: "/images/kardeslik/genel-bagislar.png" },
      { id: 2, title: 'Medrese Talebelerine Destek', subtitle: 'EĞİTİM', description: "Medrese talebelerine düzenli burs ve barınma desteği sağlıyoruz. Öğrencilerin eğitim materyalleri ve kırtasiye ihtiyaçlarını karşılıyoruz.", image: "/images/kardeslik/mahmud-ustaosmanoglu-hazretleri-ks-su-kuyusu-projesi.png" },
      { id: 3, title: 'Su Kuyuları ile Hayat', subtitle: 'YARDIM', description: "Temiz su kuyuları açarak köy ve kasabalarda hijyen ve sağlık koşullarını iyileştiriyoruz.", image: "/images/kardeslik/haci-ali-elcin-camii-insaati.png" }
    ];

    return `<div class="site" data-theme="kardeslikpayi" style="--p:#174C3B;--a:#93740C; font-family:'Outfit', sans-serif; background:#f8fafc;">
      ${this.headerHtml(o)}
      
      <section style="background:linear-gradient(135deg, #0d1b1e, #174C3B); color:#fff; padding:80px 24px; text-align:center;">
        <div style="max-width:800px; margin:0 auto;">
          <span style="background:rgba(255,255,255,0.1); padding:6px 16px; border-radius:99px; font-size:11px; font-weight:700; display:inline-block; margin-bottom:16px;">🌍 PROJELERİMİZ</span>
          <h1 style="font-size:2.8rem; font-weight:900; margin:0 0 12px;">Projelerimiz</h1>
          <p style="font-size:15px; color:#cbd5e1; margin:0;">Sahada yürüttüğümüz eğitim, su kuyusu ve insani yardım projelerini buradan görebilirsiniz.</p>
        </div>
      </section>

      <section class="section" style="padding:60px 24px; background:#f9fafb;">
        <div style="max-width:1100px; margin:0 auto;">
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:24px;">
            ${slides.map(s => {
              const target = 100000;
              const collected = 68000;
              const pct = 68;
              return `
                <div style="background:#fff; border:1px solid #e5e7eb; border-radius:20px; overflow:hidden; box-shadow:0 4px 15px rgba(0,0,0,0.02); display:flex; flex-direction:column; height:100%;">
                  <div style="height:180px; background:url('${s.image}') center/cover no-repeat; position:relative;">
                    <span style="position:absolute; bottom:12px; left:12px; background:#174C3B; color:#fff; font-size:10px; font-weight:700; padding:4px 10px; border-radius:4px;">${s.subtitle}</span>
                  </div>
                  <div style="padding:20px; display:flex; flex-direction:column; flex-grow:1; justify-content:between;">
                    <div>
                      <h3 style="font-size:1.15rem; font-weight:800; color:#174C3B; margin:0 0 8px;">${s.title}</h3>
                      <p style="font-size:12px; color:#64748b; line-height:1.5; margin-bottom:16px;">${s.description}</p>
                      
                      <!-- Progress bar -->
                      <div style="margin-bottom:16px;">
                        <div style="display:flex; justify-content:between; font-size:10.5px; color:#64748b; margin-bottom:4px;">
                          <span>Toplanan: 68.000₺</span>
                          <span style="font-weight:700; color:#174C3B;">%68</span>
                        </div>
                        <div style="height:6px; background:#f1f5f9; border-radius:3px; overflow:hidden;">
                          <div style="width:68%; height:100%; background:#174C3B; border-radius:3px;"></div>
                        </div>
                      </div>
                    </div>
                    <div style="display:flex; gap:8px;">
                      <a href="${prefix}/bagis/acil-yardim" style="flex:1; text-align:center; background:#174C3B; color:#fff; text-decoration:none; font-size:11.5px; font-weight:700; padding:8px; border-radius:6px;">Destek Ol</a>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </section>

      ${themeFooter(o, { bg: '#0a1416', font: "'Outfit', sans-serif" })}
    </div>`;
  },
  headerHtml(o) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    return `<div style="background:#0d1b1e; color:#cbd5e1; padding:6px 24px; display:flex; justify-content:space-between; align-items:center; font-size:11px; font-weight:600;">
        <div>Paylaşmak Kardeşliktir | Kardeşlik Payı Derneği</div>
        <div style="display:flex; gap:16px;">
          <a href="#/bagisci" style="color:#cbd5e1; text-decoration:none;">👤 Bağışçı Paneli</a>
          <span>|</span>
          <a href="#/admin" style="color:#cbd5e1; text-decoration:none;">⚙️ Yönetici Girişi</a>
        </div>
      </div>
      <header class="site-head" style="background:#fff; border-bottom:3px solid #0f766e; padding:14px 28px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 4px 15px rgba(0,0,0,0.03); position:sticky; top:0; z-index:100;">
        <a class="brand" href="${prefix}" style="display:flex; align-items:center; gap:10px; text-decoration:none;">
          <img src="/images/kardeslik/logo.png" style="width:48px; height:48px; border-radius:8px;" />
          <div>
            <h1 style="font-size:1.2rem; font-weight:900; color:#0f766e; margin:0; line-height:1.2;">KARDEŞLİK PAYI</h1>
            <p style="font-size:10px; color:#f59e0b; font-weight:800; margin:0; letter-spacing:1px; text-transform:uppercase;">Yardımlaşma Derneği</p>
          </div>
        </a>
        <nav style="display:flex; gap:14px; align-items:center;">
          <a href="${prefix}" style="color:#0f766e; font-weight:800; text-decoration:none; font-size:13.5px;">Ana Sayfa</a>
          <a href="${prefix}/projelerimiz" style="color:#475569; font-weight:600; text-decoration:none; font-size:13.5px;">Projelerimiz</a>
          <a href="${prefix}/faaliyetlerimiz" style="color:#475569; font-weight:600; text-decoration:none; font-size:13.5px;">Faaliyetlerimiz</a>
          <a href="${prefix}/basvuru" style="color:#475569; font-weight:600; text-decoration:none; font-size:13.5px;">Kayıt</a>
          <a href="${prefix}/hesap-numaralarimiz" style="color:#475569; font-weight:600; text-decoration:none; font-size:13.5px;">Hesaplarımız</a>
          <a href="${prefix}/gonullu-ol" style="color:#475569; font-weight:600; text-decoration:none; font-size:13.5px;">Gönüllü Ol</a>
        </nav>
        <div style="display:flex; align-items:center; gap:12px;">
          <a href="${prefix}/sepet" style="color:#0f766e; text-decoration:none; font-size:18px; display:flex; align-items:center;">🛒</a>
          <a href="${prefix}/bagis/acil-yardim" style="background:#0f766e; color:#fff; text-decoration:none; font-size:12px; font-weight:800; padding:10px 20px; border-radius:8px; box-shadow:0 4px 12px rgba(15,118,110,0.25);">ŞİMDİ BAĞIŞ YAP</a>
        </div>
      </header>`;
  },
  
  checkout(o, c) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    const payMethod = state.kp_paymethod || 'credit';
    const amount = state.kp_amount || '100';
    const donor = state.kp_donor || { firstName: '', lastName: '', email: '', phone: '', message: '' };
    const card = state.kp_card || { number: '', expiry: '', cvv: '', name: '' };
    const loading = !!state.kp_loading;
    const completed = !!state.kp_completed;

    if (completed) {
      return `<div class="site" data-theme="kardeslikpayi" style="--p:#174C3B;--a:#93740C; font-family:'Outfit', sans-serif; background:#f8fafc; min-height:100vh; display:flex; flex-direction:column; justify-content:space-between;">
        ${this.headerHtml(o)}
        <main style="flex:1; display:flex; align-items:center; justify-content:center; padding:60px 24px;">
          <div style="max-width:480px; width:100%; background:#fff; border-radius:24px; box-shadow:0 20px 40px rgba(0,0,0,0.05); border:1px solid #e2e8f0; padding:40px; text-align:center;">
            <div style="width:80px; height:80px; background:#f0fdf4; color:#166534; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:2.5rem; margin:0 auto 24px;">✓</div>
            <h2 style="font-size:1.8rem; font-weight:900; color:#1e293b; margin:0 0 12px;">Bağışınız Başarıyla Alındı!</h2>
            <p style="font-size:14px; color:#64748b; line-height:1.6; margin-bottom:32px;">Kardeşlik köprüsüne sağladığınız katkı için teşekkür ederiz. Bağış makbuzunuz e-posta adresinize gönderilmiştir.</p>
            <div style="display:flex; flex-direction:column; gap:12px;">
              <a href="${prefix}" style="background:#174C3B; color:#fff; text-decoration:none; padding:14px; border-radius:12px; font-weight:700; font-size:14px;">Ana Sayfaya Dön</a>
              <button onclick="state.kp_completed = false; render();" style="border:1px solid #174C3B; background:none; color:#174C3B; padding:14px; border-radius:12px; font-weight:700; font-size:14px; cursor:pointer;">Yeni Bağış Yap</button>
            </div>
          </div>
        </main>
        ${themeFooter(o, { bg: '#0a1416', font: "'Outfit', sans-serif" })}
      </div>`;
    }

    return `<div class="site" data-theme="kardeslikpayi" style="--p:#174C3B;--a:#93740C; font-family:'Outfit', sans-serif; background:#f8fafc; min-height:100vh;">
      ${this.headerHtml(o)}
      
      <section style="background:linear-gradient(135deg, #0d1b1e, #174C3B); color:#fff; padding:60px 24px; text-align:center;">
        <div style="max-width:800px; margin:0 auto;">
          <h1 style="font-size:2.5rem; font-weight:900; margin:0 0 8px;">Güvenli Bağış Ödemesi</h1>
          <p style="font-size:14px; color:#cbd5e1; margin:0;">Bağışınızı güvenle tamamlayarak Afrika'da bir hayata dokunun.</p>
        </div>
      </section>

      <section style="padding:48px 24px; max-width:1100px; margin:0 auto;">
        <div style="display:grid; grid-template-columns:1.8fr 1.2fr; gap:40px; align-items:start;">
          
          <!-- Left Forms -->
          <div style="display:flex; flex-direction:column; gap:24px;">
            
            <!-- Step 1: Donor Info -->
            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:24px; padding:32px; box-shadow:0 10px 25px rgba(0,0,0,0.01);">
              <h3 style="font-size:1.3rem; font-weight:800; color:#174C3B; margin:0 0 20px;">1. Bağışçı Bilgileri</h3>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
                <div>
                  <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:6px;">Ad *</label>
                  <input type="text" value="${esc(donor.firstName)}" oninput="state.kp_donor = state.kp_donor || {}; state.kp_donor.firstName = this.value; render();" placeholder="Adınız" style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" required />
                </div>
                <div>
                  <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:6px;">Soyad *</label>
                  <input type="text" value="${esc(donor.lastName)}" oninput="state.kp_donor = state.kp_donor || {}; state.kp_donor.lastName = this.value; render();" placeholder="Soyadınız" style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" required />
                </div>
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
                <div>
                  <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:6px;">E-posta *</label>
                  <input type="email" value="${esc(donor.email)}" oninput="state.kp_donor = state.kp_donor || {}; state.kp_donor.email = this.value; render();" placeholder="ornek@email.com" style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" required />
                </div>
                <div>
                  <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:6px;">Telefon *</label>
                  <input type="tel" value="${esc(donor.phone)}" oninput="state.kp_donor = state.kp_donor || {}; state.kp_donor.phone = this.value; render();" placeholder="0555 123 45 67" style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" required />
                </div>
              </div>
              <div>
                <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:6px;">Bağış Notu</label>
                <textarea oninput="state.kp_donor = state.kp_donor || {}; state.kp_donor.message = this.value; render();" placeholder="Bağışınızla ilgili notunuz..." style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; height:80px; outline:none; font-family:sans-serif; box-sizing:border-box;">${esc(donor.message)}</textarea>
              </div>
            </div>

            <!-- Step 2: Payment Method -->
            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:24px; padding:32px; box-shadow:0 10px 25px rgba(0,0,0,0.01);">
              <h3 style="font-size:1.3rem; font-weight:800; color:#174C3B; margin:0 0 20px;">2. Ödeme Yöntemi</h3>
              <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px;">
                <button onclick="state.kp_paymethod = 'credit'; render();" style="border:${payMethod === 'credit' ? '2px solid #174C3B' : '1px solid #cbd5e1'}; background:${payMethod === 'credit' ? '#f0fdf4' : '#fff'}; color:#1e293b; padding:16px; border-radius:12px; text-align:center; cursor:pointer; font-weight:700; font-size:12.5px;">💳 Kartla Öde</button>
                <button onclick="state.kp_paymethod = 'bank'; render();" style="border:${payMethod === 'bank' ? '2px solid #174C3B' : '1px solid #cbd5e1'}; background:${payMethod === 'bank' ? '#f0fdf4' : '#fff'}; color:#1e293b; padding:16px; border-radius:12px; text-align:center; cursor:pointer; font-weight:700; font-size:12.5px;">🏦 EFT/Havale</button>
                <button onclick="state.kp_paymethod = 'mobile'; render();" style="border:${payMethod === 'mobile' ? '2px solid #174C3B' : '1px solid #cbd5e1'}; background:${payMethod === 'mobile' ? '#f0fdf4' : '#fff'}; color:#1e293b; padding:16px; border-radius:12px; text-align:center; cursor:pointer; font-weight:700; font-size:12.5px;">📱 Mobil Ödeme</button>
              </div>
            </div>

            <!-- Step 3: Payment Details -->
            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:24px; padding:32px; box-shadow:0 10px 25px rgba(0,0,0,0.01);">
              <h3 style="font-size:1.3rem; font-weight:800; color:#174C3B; margin:0 0 20px;">3. Güvenlik & Kart Bilgileri</h3>
              
              ${payMethod === 'credit' ? `
                <div style="background:#174C3B; color:#fff; border-radius:20px; padding:24px; margin-bottom:20px; box-shadow:0 10px 20px rgba(23,76,59,0.15); display:flex; flex-direction:column; gap:16px;">
                  <div>
                    <label style="display:block; font-size:11px; opacity:0.8; font-weight:700; margin-bottom:4px; text-transform:uppercase;">Kart Numarası</label>
                    <input type="text" value="${esc(card.number)}" oninput="state.kp_card = state.kp_card || {}; state.kp_card.number = this.value; render();" placeholder="1234 5678 9012 3456" style="width:100%; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.25); border-radius:8px; padding:12px; color:#fff; font-size:14px; font-weight:700; outline:none; box-sizing:border-box;" />
                  </div>
                  <div style="display:grid; grid-template-columns:1.2fr 0.8fr; gap:16px;">
                    <div>
                      <label style="display:block; font-size:11px; opacity:0.8; font-weight:700; margin-bottom:4px; text-transform:uppercase;">Son Kullanma (AA/YY)</label>
                      <input type="text" value="${esc(card.expiry)}" oninput="state.kp_card = state.kp_card || {}; state.kp_card.expiry = this.value; render();" placeholder="08/28" style="width:100%; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.25); border-radius:8px; padding:12px; color:#fff; font-size:14px; font-weight:700; outline:none; box-sizing:border-box;" />
                    </div>
                    <div>
                      <label style="display:block; font-size:11px; opacity:0.8; font-weight:700; margin-bottom:4px; text-transform:uppercase;">CVC/CVV</label>
                      <input type="text" value="${esc(card.cvv)}" oninput="state.kp_card = state.kp_card || {}; state.kp_card.cvv = this.value; render();" placeholder="123" style="width:100%; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.25); border-radius:8px; padding:12px; color:#fff; font-size:14px; font-weight:700; outline:none; box-sizing:border-box;" />
                    </div>
                  </div>
                  <div>
                    <label style="display:block; font-size:11px; opacity:0.8; font-weight:700; margin-bottom:4px; text-transform:uppercase;">Kart Üzerindeki İsim</label>
                    <input type="text" value="${esc(card.name)}" oninput="state.kp_card = state.kp_card || {}; state.kp_card.name = this.value; render();" placeholder="KART SAHİBİNİN ADI" style="width:100%; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.25); border-radius:8px; padding:12px; color:#fff; font-size:14px; font-weight:700; outline:none; box-sizing:border-box;" />
                  </div>
                </div>
              ` : ''}

              ${payMethod === 'bank' ? `
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:20px; display:flex; flex-direction:column; gap:12px; margin-bottom:20px;">
                  <div style="display:flex; justify-content:space-between; font-size:13px;"><span style="color:#64748b; font-weight:700;">Banka:</span><span style="font-weight:800; color:#1e293b;">Kuveyt Türk Katılım Bankası</span></div>
                  <div style="display:flex; justify-content:space-between; font-size:13px;"><span style="color:#64748b; font-weight:700;">Hesap Sahibi:</span><span style="font-weight:800; color:#1e293b;">Kardeşlik Payı Derneği</span></div>
                  <div style="display:flex; justify-content:space-between; font-size:13px;"><span style="color:#64748b; font-weight:700;">IBAN:</span><span style="font-weight:800; color:#166534; font-family:monospace;">TR12 0006 2000 0001 2345 6789 01</span></div>
                  <div style="background:#fef3c7; color:#92400e; padding:12px; border-radius:8px; font-size:11.5px; line-height:1.5;"><b>Lütfen Dikkat:</b> EFT veya Havale yaparken açıklama kısmına <b>Bağışçı Adını ve Telefonunu</b> yazmayı unutmayınız.</div>
                </div>
              ` : ''}

              ${payMethod === 'mobile' ? `
                <div style="margin-bottom:20px;">
                  <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:6px;">GSM Numaranız *</label>
                  <input type="tel" placeholder="05xx xxx xx xx" style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" />
                  <p style="font-size:11px; color:#64748b; margin-top:6px; line-height:1.4;">Bağış tutarı faturanıza yansıtılacak veya TL bakiyenizden düşülecektir. Gelen SMS'i onaylamanız gerekmektedir.</p>
                </div>
              ` : ''}

              <!-- Submit button action wrapper -->
              <button onclick="state.kp_loading = true; render(); setTimeout(() => { state.kp_loading = false; state.kp_completed = true; render(); }, 1500);" style="display:flex; align-items:center; justify-content:center; gap:8px; width:100%; background:#93740C; color:#fff; border:0; padding:16px; border-radius:12px; font-weight:800; font-size:16px; cursor:pointer; box-shadow:0 8px 25px rgba(147,116,12,0.25);">
                ${loading ? 'İşleniyor...' : `Güvenli Ödeme Yap (₺${amount}) ➔`}
              </button>
            </div>

          </div>

          <!-- Right Summary Card -->
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:24px; padding:32px; box-shadow:0 10px 25px rgba(0,0,0,0.01); position:sticky; top:110px;">
            <h3 style="font-size:1.3rem; font-weight:800; color:#174C3B; margin:0 0 20px; border-bottom:1px solid #f1f5f9; padding-bottom:12px;">Bağış Özeti</h3>
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:14px; margin-bottom:16px;">
              <span style="color:#64748b; font-weight:700;">Kampanya:</span>
              <span style="font-weight:800; color:#1e293b; text-align:right;">${esc(c.title)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:14px; margin-bottom:20px;">
              <span style="color:#64748b; font-weight:700;">Kategori:</span>
              <span style="font-weight:800; color:#1e293b;">${esc(labels[c.category] || c.category)}</span>
            </div>
            <div style="border-top:1px solid #f1f5f9; padding-top:16px; display:flex; justify-content:space-between; align-items:center; font-size:16px; font-weight:900; color:#174C3B; margin-bottom:24px;">
              <span>TOPLAM TUTAR:</span>
              <span>₺${amount}</span>
            </div>
            <div style="background:#f8fafc; border-radius:12px; padding:16px; border:1px solid #f1f5f9; display:flex; flex-direction:column; gap:10px; font-size:12px; color:#64748b;">
              <div>🔒 256-Bit SSL Güvenli Bağlantı</div>
              <div>✓ Resmi Onaylı Yardım Kuruluşu</div>
              <div>⚡ Anında Makbuz & Şeffaf Süreç</div>
            </div>
          </div>

        </div>
      </section>

      ${themeFooter(o, { bg: '#0a1416', font: "'Outfit', sans-serif" })}
    </div>`;
  },

  cart(o) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    return `<div class="site" data-theme="kardeslikpayi" style="--p:#174C3B;--a:#93740C; font-family:'Outfit', sans-serif; background:#f8fafc; min-height:100vh; display:flex; flex-direction:column; justify-content:space-between;">
      ${this.headerHtml(o)}
      
      <main style="flex:1; max-width:800px; width:100%; margin:0 auto; padding:60px 24px; box-sizing:border-box;">
        <h1 style="font-size:2.2rem; font-weight:900; color:#174C3B; margin:0 0 24px;">Bağış Sepetim</h1>
        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:24px; padding:40px; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.02);">
          <div style="width:70px; height:70px; background:#f0fdf4; color:#0f766e; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:2rem; margin:0 auto 20px;">🛒</div>
          <p style="font-size:14.5px; color:#64748b; line-height:1.6; margin-bottom:28px;">Sepetiniz şu anda boş. Bağış eklemek için projeler veya online bağış sayfasını ziyaret edebilirsiniz.</p>
          <a href="${prefix}/bagis/acil-yardim" style="display:inline-block; background:#174C3B; color:#fff; text-decoration:none; padding:14px 28px; border-radius:12px; font-weight:700; font-size:13.5px; box-shadow:0 6px 15px rgba(23,76,59,0.25);">Online Bağış Sayfası ➔</a>
        </div>
      </main>

      ${themeFooter(o, { bg: '#0a1416', font: "'Outfit', sans-serif" })}
    </div>`;
  },

  basvuru(o) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    const sub = !!state.kp_sub_app;
    if (sub) {
      return `<div class="site" data-theme="kardeslikpayi" style="--p:#174C3B;--a:#93740C; font-family:'Outfit', sans-serif; background:#f8fafc; min-height:100vh; display:flex; flex-direction:column; justify-content:space-between;">
        ${this.headerHtml(o)}
        <main style="flex:1; display:flex; align-items:center; justify-content:center; padding:60px 24px;">
          <div style="max-width:480px; width:100%; background:#fff; border-radius:24px; box-shadow:0 20px 40px rgba(0,0,0,0.05); border:1px solid #e2e8f0; padding:40px; text-align:center;">
            <div style="width:80px; height:80px; background:#f0fdf4; color:#166534; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:2.5rem; margin:0 auto 24px;">✓</div>
            <h2 style="font-size:1.8rem; font-weight:900; color:#1e293b; margin:0 0 12px;">Başvurunuz Alındı!</h2>
            <p style="font-size:14px; color:#64748b; line-height:1.6; margin-bottom:32px;">Kayıt başvurunuz başarıyla alınmıştır. İnceleme sonrasında sizinle 3 iş günü içinde irtibat kurulacaktır.<br><b>Başvuru No:</b> <span style="font-weight:700; color:#174C3B;">#KP-202501</span></p>
            <a href="${prefix}" style="display:block; background:#174C3B; color:#fff; text-decoration:none; padding:14px; border-radius:12px; font-weight:700; font-size:14px;">Ana Sayfaya Dön</a>
          </div>
        </main>
        ${themeFooter(o, { bg: '#0a1416', font: "'Outfit', sans-serif" })}
      </div>`;
    }

    return `<div class="site" data-theme="kardeslikpayi" style="--p:#174C3B;--a:#93740C; font-family:'Outfit', sans-serif; background:#f8fafc; min-height:100vh;">
      ${this.headerHtml(o)}
      
      <section style="background:linear-gradient(135deg, #0d1b1e, #174C3B); color:#fff; padding:60px 24px; text-align:center;">
        <div style="max-width:800px; margin:0 auto;">
          <h1 style="font-size:2.5rem; font-weight:900; margin:0 0 8px;">Kayıt Başvuru Formu</h1>
          <p style="font-size:14px; color:#cbd5e1; margin:0;">Medresemizde İslami eğitim ve hafızlık programlarımıza başvuru yapın.</p>
        </div>
      </section>

      <section style="padding:48px 24px; max-width:800px; margin:0 auto;">
        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:24px; padding:36px; box-shadow:0 10px 25px rgba(0,0,0,0.02);">
          
          <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-bottom:36px; text-align:center;">
            <div style="padding:8px; border-bottom:3px solid #174C3B; font-weight:700; font-size:12px; color:#174C3B;">1. Başvuru</div>
            <div style="padding:8px; border-bottom:3px solid #cbd5e1; font-weight:700; font-size:12px; color:#64748b;">2. İnceleme</div>
            <div style="padding:8px; border-bottom:3px solid #cbd5e1; font-weight:700; font-size:12px; color:#64748b;">3. Mülakat</div>
            <div style="padding:8px; border-bottom:3px solid #cbd5e1; font-weight:700; font-size:12px; color:#64748b;">4. Kayıt</div>
          </div>

          <form onsubmit="event.preventDefault(); state.kp_sub_app = true; render();" style="display:flex; flex-direction:column; gap:20px;">
            <div>
              <h4 style="font-size:14px; font-weight:800; color:#174C3B; margin:0 0 12px; border-left:3px solid #174C3B; padding-left:8px;">Öğrenci Bilgileri</h4>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:12px;">
                <input type="text" placeholder="Öğrenci Adı Soyadı *" required style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" />
                <input type="date" required style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" />
              </div>
            </div>

            <div>
              <h4 style="font-size:14px; font-weight:800; color:#174C3B; margin:0 0 12px; border-left:3px solid #174C3B; padding-left:8px;">Veli / Vasi Bilgileri</h4>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:12px;">
                <input type="text" placeholder="Veli Adı Soyadı *" required style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" />
                <input type="tel" placeholder="Telefon Numarası *" required style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" />
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:12px;">
                <input type="email" placeholder="E-Posta Adresi *" required style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" />
                <input type="text" placeholder="İkamet Adresi *" required style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" />
              </div>
            </div>

            <div>
              <h4 style="font-size:14px; font-weight:800; color:#174C3B; margin:0 0 12px; border-left:3px solid #174C3B; padding-left:8px;">Bölüm Tercihi</h4>
              <select required style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;">
                <option value="">Bölüm seçiniz... *</option>
                <option value="sibyan">Sıbyan Mektebi (4-7 yaş)</option>
                <option value="ibtida">İbtida Sınıfı (8-12 yaş)</option>
                <option value="hafizlik">Hafızlık Eğitimi (7+ yaş)</option>
                <option value="arapca">Arapça & İslami İlimler (10+ yaş)</option>
              </select>
            </div>

            <button type="submit" style="background:#174C3B; color:#fff; border:0; padding:16px; border-radius:12px; font-weight:800; font-size:15px; cursor:pointer; box-shadow:0 6px 15px rgba(23,76,59,0.2);">Başvuruyu Tamamla</button>
          </form>

        </div>
      </section>

      ${themeFooter(o, { bg: '#0a1416', font: "'Outfit', sans-serif" })}
    </div>`;
  },

  activities(o, list) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    return `<div class="site" data-theme="kardeslikpayi" style="--p:#174C3B;--a:#93740C; font-family:'Outfit', sans-serif; background:#f8fafc; min-height:100vh;">
      ${this.headerHtml(o)}
      
      <section style="background:linear-gradient(135deg, #0d1b1e, #174C3B); color:#fff; padding:60px 24px; text-align:center;">
        <div style="max-width:800px; margin:0 auto;">
          <h1 style="font-size:2.5rem; font-weight:900; margin:0 0 8px;">Faaliyetlerimiz</h1>
          <p style="font-size:14px; color:#cbd5e1; margin:0;">Afrika'da yürüttüğümüz kurban, eğitim ve insani yardım faaliyetlerimiz.</p>
        </div>
      </section>

      <section style="padding:48px 24px; max-width:1100px; margin:0 auto; display:grid; grid-template-columns:1fr; gap:32px;">
        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:24px; padding:32px;">
          <h2 style="font-size:1.6rem; font-weight:800; color:#174C3B; margin:0 0 16px;">Kurban Hizmetleri</h2>
          <p style="font-size:13.5px; color:#64748b; line-height:1.6; margin-bottom:20px;">Afrika genelinde 20'den fazla ülkede kesim ve dağıtım gerçekleştirerek mazlum kardeşlerimize ulaşıyoruz.</p>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
            ${['Somali', 'Nijer', 'Sudan', 'Mali', 'Gambiya', 'Senegal', 'Çad', 'Gana'].map(c => `
              <div style="background:#f8fafc; border:1px solid #f1f5f9; padding:12px; border-radius:8px; text-align:center; font-weight:700; font-size:13px; color:#1e293b;">${c}</div>
            `).join('')}
          </div>
        </div>
        
        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:24px; padding:32px;">
          <h2 style="font-size:1.6rem; font-weight:800; color:#174C3B; margin:0 0 16px;">Medrese Destekleri</h2>
          <p style="font-size:13.5px; color:#64748b; line-height:1.6; margin-bottom:16px;">Talebelerimizin barınma, gıda, Kur'an ve kırtasiye ihtiyaçlarını karşılıyoruz.</p>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:16px;">
            <div style="border:1px solid #f1f5f9; padding:16px; border-radius:12px; background:#f8fafc;">
              <h4 style="font-weight:800; color:#174C3B; margin:0 0 4px; font-size:13.5px;">📖 Kur'an Yardımı</h4>
              <p style="font-size:12px; color:#64748b; margin:0;">Öğrencilere Kur'an-ı Kerim mushafları ulaştırıyoruz.</p>
            </div>
            <div style="border:1px solid #f1f5f9; padding:16px; border-radius:12px; background:#f8fafc;">
              <h4 style="font-weight:800; color:#174C3B; margin:0 0 4px; font-size:13.5px;">🍱 Yemek Dağıtımı</h4>
              <p style="font-size:12px; color:#64748b; margin:0;">Sıcak yemek ve iftar programları gerçekleştiriyoruz.</p>
            </div>
          </div>
        </div>
      </section>

      ${themeFooter(o, { bg: '#0a1416', font: "'Outfit', sans-serif" })}
    </div>`;
  },

  accounts(o) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    const copied = state.kp_copied_iban || null;
    return `<div class="site" data-theme="kardeslikpayi" style="--p:#174C3B;--a:#93740C; font-family:'Outfit', sans-serif; background:#f8fafc; min-height:100vh;">
      ${this.headerHtml(o)}
      
      <section style="background:linear-gradient(135deg, #0d1b1e, #174C3B); color:#fff; padding:60px 24px; text-align:center;">
        <div style="max-width:800px; margin:0 auto;">
          <h1 style="font-size:2.5rem; font-weight:900; margin:0 0 8px;">Hesap Numaralarımız</h1>
          <p style="font-size:14px; color:#cbd5e1; margin:0;">Banka transferi (EFT/Havale) yoluyla resmi hesaplarımıza bağış yapabilirsiniz.</p>
        </div>
      </section>

      <section style="padding:48px 24px; max-width:900px; margin:0 auto;">
        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:24px; padding:32px; box-shadow:0 10px 25px rgba(0,0,0,0.01);">
          <div style="display:flex; flex-direction:column; gap:16px;">
            ${[
              { bank: 'Vakıf Katılım', iban: 'TR12 0006 2000 0001 2345 6789 01', branch: 'Merkez Şubesi' },
              { bank: 'Ziraat Katılım', iban: 'TR34 0001 5000 0002 3456 7890 12', branch: 'Fatih Şubesi' }
            ].map((acc, idx) => `
              <div style="border:1px solid #e2e8f0; border-radius:16px; padding:20px; display:flex; flex-direction:column; gap:8px; background:#f8fafc;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <b style="color:#174C3B; font-size:14px;">${acc.bank} (${acc.branch})</b>
                  <button onclick="navigator.clipboard.writeText('${acc.iban.replace(/\s+/g, '')}'); state.kp_copied_iban = '${idx}'; render(); setTimeout(() => { state.kp_copied_iban = null; render(); }, 1500);" style="background:#174C3B; color:#fff; border:0; padding:6px 12px; border-radius:6px; font-size:11px; cursor:pointer; font-weight:700;">
                    ${copied === idx.toString() ? 'Kopyalandı!' : 'Kopyala'}
                  </button>
                </div>
                <code style="font-family:monospace; font-size:14px; color:#1e293b; background:#fff; padding:10px; border:1px solid #e2e8f0; border-radius:8px; letter-spacing:1px; word-break:break-all;">${acc.iban}</code>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      ${themeFooter(o, { bg: '#0a1416', font: "'Outfit', sans-serif" })}
    </div>`;
  },

  gonullu(o) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    const sub = !!state.kp_sub_gonullu;
    return `<div class="site" data-theme="kardeslikpayi" style="--p:#174C3B;--a:#93740C; font-family:'Outfit', sans-serif; background:#f8fafc; min-height:100vh; display:flex; flex-direction:column; justify-content:space-between;">
      ${this.headerHtml(o)}
      
      <main style="flex:1; max-width:550px; width:100%; margin:0 auto; padding:60px 24px; box-sizing:border-box;">
        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:24px; padding:36px; box-shadow:0 10px 30px rgba(0,0,0,0.02);">
          ${sub ? `
            <div style="text-align:center;">
              <div style="width:70px; height:70px; background:#f0fdf4; color:#166534; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:2rem; margin:0 auto 20px;">✓</div>
              <h3 style="font-size:1.5rem; font-weight:900; color:#1e293b; margin:0 0 8px;">Başvurunuz Alındı</h3>
              <p style="font-size:13.5px; color:#64748b; line-height:1.6; margin-bottom:24px;">Gönüllü katılım formunuz başarıyla iletilmiştir. Kardeşlik köprümüze verdiğiniz destek için teşekkür ederiz.</p>
              <a href="${prefix}" style="display:inline-block; background:#174C3B; color:#fff; text-decoration:none; padding:12px 24px; border-radius:8px; font-weight:700; font-size:13px;">Ana Sayfaya Dön</a>
            </div>
          ` : `
            <h2 style="font-size:1.6rem; font-weight:900; color:#174C3B; text-align:center; margin:0 0 8px;">Gönüllü Ol</h2>
            <p style="font-size:12px; color:#64748b; text-align:center; margin-bottom:24px;">Sosyal sorumluluk ve medrese faaliyetlerimizde gönüllü olarak yer alabilirsiniz.</p>
            <form onsubmit="event.preventDefault(); state.kp_sub_gonullu = true; render();" style="display:flex; flex-direction:column; gap:16px;">
              <input type="text" placeholder="Ad Soyad *" required style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" />
              <input type="email" placeholder="E-Posta *" required style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" />
              <input type="tel" placeholder="Telefon Numarası *" required style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;" />
              <select required style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;">
                <option value="">İlgi Alanı Seçin *</option>
                <option value="egitim">Eğitim & Medrese</option>
                <option value="saglik">Sağlık & Gıda</option>
                <option value="lojistik">Sosyal Medya & Tanıtım</option>
              </select>
              <textarea placeholder="Gönüllü olarak nasıl destek olabilirsiniz?..." style="width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:8px; font-size:13px; height:80px; outline:none; font-family:sans-serif; box-sizing:border-box;"></textarea>
              <button type="submit" style="background:#174C3B; color:#fff; border:0; padding:14px; border-radius:8px; font-weight:800; font-size:14.5px; cursor:pointer; box-shadow:0 4px 12px rgba(23,76,59,0.2);">Başvuruyu Gönder</button>
            </form>
          `}
        </div>
      </main>

      ${themeFooter(o, { bg: '#0a1416', font: "'Outfit', sans-serif" })}
    </div>`;
  },

  gizlilik(o) {
    const prefix = isCustomDomain() ? '#' : '#/demo/' + o.slug;
    return `<div class="site" data-theme="kardeslikpayi" style="--p:#174C3B;--a:#93740C; font-family:'Outfit', sans-serif; background:#f8fafc; min-height:100vh;">
      ${this.headerHtml(o)}
      
      <section style="background:linear-gradient(135deg, #0d1b1e, #174C3B); color:#fff; padding:60px 24px; text-align:center;">
        <div style="max-width:800px; margin:0 auto;">
          <h1 style="font-size:2.5rem; font-weight:900; margin:0 0 8px;">Gizlilik Politikası</h1>
          <p style="font-size:14px; color:#cbd5e1; margin:0;">Kişisel verilerinizin korunması ve güvenliği esaslarımız.</p>
        </div>
      </section>

      <section style="padding:48px 24px; max-width:800px; margin:0 auto;">
        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:24px; padding:36px; box-shadow:0 10px 25px rgba(0,0,0,0.01); line-height:1.6; font-size:13.5px; color:#475569;">
          <h3 style="color:#174C3B; font-weight:800; font-size:1.15rem; margin-top:0;">1. Veri Sorumlusu</h3>
          <p style="margin-bottom:20px;">Kişisel verileriniz, Kardeşlik Payı Derneği tarafından 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında veri sorumlusu sıfatıyla işlenmektedir.</p>
          
          <h3 style="color:#174C3B; font-weight:800; font-size:1.15rem;">2. Toplanan Veriler</h3>
          <p style="margin-bottom:20px;">Kayıt, bağış veya iletişim formları aracılığıyla adınız, soyadınız, telefon numaranız, e-posta adresiniz ve ödeme bilgileriniz yasal yükümlülüklerimiz ve bağış süreçlerinizin takibi amacıyla güvenli sunucularda işlenmektedir.</p>

          <h3 style="color:#174C3B; font-weight:800; font-size:1.15rem;">3. Verilerin Güvenliği</h3>
          <p style="margin:0;">Toplanan tüm veriler SSL şifreleme sertifikası ve veri tabanı koruma önlemleri ile güvence altına alınmakta, üçüncü şahıslarla rızanız dışında kesinlikle paylaşılmamaktadır.</p>
        </div>
      </section>

      ${themeFooter(o, { bg: '#0a1416', font: "'Outfit', sans-serif" })}
    </div>`;
  }
};

