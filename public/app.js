const state = { data: null, route: null, selectedOrgSlug: "rahmet-eli", adminTab: "dashboard", toast: "" };
state.route = route();

const labels = {
  acil: "Acil Yardım", gazze: "Gazze", afrika: "Afrika", afganistan: "Afganistan", kurban: "Kurban",
  zekat: "Zekat", fitre: "Fitre/Fidye", sadaka: "Sadaka", sponsorluk: "Sponsorluk",
  "su-kuyusu": "Su Kuyusu", gida: "Gıda", saglik: "Sağlık",
};
const statuses = {
  open: "Açık", planned: "Planlandı", full: "Hisseler doldu", assigned: "Hisse atandı",
  slaughtered: "Kesildi", "video-ready": "Video hazır", completed: "Tamamlandı",
  confirmed: "Onaylandı", unmatched: "Eşleşmedi", matched: "Eşleşti", queued: "Kuyrukta", active: "Aktif",
};

function isCustomDomain() {
  const host = location.hostname;
  return host !== "e-infak.org" && host !== "www.e-infak.org" && host !== "localhost" && host !== "127.0.0.1";
}

function route() {
  const host = location.hostname;
  const parts = (location.hash || "#/").replace(/^#\/?/, "").split("/").filter(Boolean);
  
  // Custom Domain Active
  if (isCustomDomain()) {
    // Under custom domain, all routes map to the tenant's demo pages
    // Parts can be: empty (home), 'bagis' / 'kurban' / etc.
    const section = parts[0] || "home";
    const item = parts[1] || "";
    
    // Support custom domains by safely checking state if initialized
    const slug = state.data?.selectedOrganization?.slug || state.selectedOrgSlug || "rahmet-eli";
    
    // Support admin panel on custom domain too
    if (parts[0] === "admin") return { name: "admin" };
    if (parts[0] === "bagisci") return { name: "donor" };
    
    const allowed = ["bagis", "hakkimizda", "iletisim", "faaliyetlerimiz", "projelerimiz", "sepet", "basvuru", "bolumler", "duyurular", "hesap-numaralarimiz", "portal", "gonullu-ol", "gizlilik-politikasi"];
    if (allowed.includes(section)) {
      return { name: "demo", slug, section, item };
    }
    return { name: "demo", slug, section: "home", item: "" };
  }
  
  if (!parts.length) return { name: "company" };
  if (parts[0] === "demos") return { name: "demos" };
  if (parts[0] === "admin") return { name: "admin" };
  if (parts[0] === "bagisci") return { name: "donor" };
  if (parts[0] === "demo") return { name: "demo", slug: parts[1] || "rahmet-eli", section: parts[2] || "home", item: parts[3] || "" };
  return { name: "company" };
}

const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const money = (v) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(Number(v || 0));
const pct = (a, b) => Math.min(100, Math.round((Number(a || 0) / Number(b || 1)) * 100));
const orgs = () => state.data?.organizations || [];
const org = (slug = state.selectedOrgSlug) => orgs().find((o) => o.slug === slug) || orgs()[0];
const campaigns = (slug = state.selectedOrgSlug) => (state.data?.campaigns || []).filter((c) => c.organizationId === org(slug)?.id);
const donations = (slug = state.selectedOrgSlug) => (state.data?.donations || []).filter((d) => d.organizationId === org(slug)?.id);
const donors = (slug = state.selectedOrgSlug) => (state.data?.donors || []).filter((d) => d.organizationId === org(slug)?.id);
const animals = (slug = state.selectedOrgSlug) => (state.data?.kurbanAnimals || []).filter((a) => a.organizationId === org(slug)?.id);
const shares = (slug = state.selectedOrgSlug) => (state.data?.kurbanShares || []).filter((s) => s.organizationId === org(slug)?.id);
const campaignById = (id) => (state.data?.campaigns || []).find((c) => c.id === Number(id));
const donorById = (id) => (state.data?.donors || []).find((d) => d.id === Number(id));

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const json = await res.json();
  if (!res.ok || json.ok === false) throw new Error(json.error || "İşlem tamamlanamadı");
  return json;
}

async function load() {
  // If it's a custom domain, fetch default bootstrap, backend will resolve the organization by Host header
  const demo = isCustomDomain() ? "" : (state.route.name === "demo" ? state.route.slug : state.selectedOrgSlug);
  state.data = await api(`/api/bootstrap?demo=${encodeURIComponent(demo)}`);
  
  if (state.data?.selectedOrganization) {
    state.selectedOrgSlug = state.data.selectedOrganization.slug;
    // Re-evaluate routes after we get organization info to bind the slug
    state.route = route();
  }
  render();
  startAutoplay();
}

function shell(content) {
  let modalHtml = "";
  if (state.selectedOrphan) {
    modalHtml = renderSponsorModal(state.selectedOrphan);
  }
  if (state.activeKurbanVideo) {
    modalHtml = renderKurbanVideoModal(state.activeKurbanVideo);
  }
  return `${state.toast ? `<div class="toast">${esc(state.toast)}</div>` : ""}${content}${modalHtml}`;
}

function render() {
  if (!state.data) return;
  const r = state.route;
  if (r.name === "admin") return paint(admin());
  if (r.name === "donor") return paint(donorPanel());
  if (r.name === "demo") return paint(demoSite(r.slug));
  return paint(company(r.name === "demos"));
}
function paint(html) { document.getElementById("app").innerHTML = html; }

function company(focusDemos = false) {
  const s = state.data.stats;
  return shell(`
    <div style="background:#0f172a; color:#f1f5f9; min-height:100vh;">
      <header class="topbar" style="background:rgba(15,23,42,0.8); border-bottom:1px solid rgba(255,255,255,0.08); backdrop-filter:blur(16px);">
        <a class="brand" href="#/" style="color:#fff;"><span style="background:#059669;">E</span><b>E-İnfak</b></a>
        <nav style="color:#94a3b8;">
          <a href="#services" style="color:#94a3b8; transition:color 0.2s;">Hizmetlerimiz</a>
          <a href="#demos" style="color:#94a3b8; transition:color 0.2s;">STK Demoları</a>
          <a href="#lead" style="color:#94a3b8; transition:color 0.2s;">Teklif Alın</a>
        </nav>
        <div style="display:flex; gap:10px; align-items:center;">
          <a class="ghost" href="#/bagisci" style="min-height:38px; font-size:13px; padding:0 14px; background:rgba(255,255,255,0.05); color:#fff; border:1px solid rgba(255,255,255,0.15);">Bağışçı Girişi</a>
          <a class="black-btn" href="#/admin" style="min-height:38px; font-size:13px; padding:0 14px; background:#059669; color:#fff;">Yönetim Paneli</a>
        </div>
      </header>
      
      <main>
        <!-- ▸ HERO — Deep Navy DernekPro Theme -->
        <section class="hero" style="min-height:calc(100vh - 74px); display:grid; grid-template-columns:1.2fr 0.8fr; gap:clamp(28px,5vw,72px); align-items:center; padding:clamp(44px,7vw,92px) clamp(18px,5vw,72px); background:radial-gradient(circle at 10% 20%, rgba(5,150,105,0.08) 0%, transparent 40%), #0f172a; position:relative; overflow:hidden; border:0;">
          <div style="position:absolute; top:-100px; right:-100px; width:400px; height:400px; background:radial-gradient(circle, rgba(59,130,246,0.05), transparent 70%); border-radius:50%; pointer-events:none;"></div>
          
          <div style="position:relative; z-index:2;">
            <div style="display:inline-flex; align-items:center; gap:8px; background:rgba(5,150,105,0.1); border:1px solid rgba(5,150,105,0.3); border-radius:99px; padding:6px 16px 6px 8px; margin-bottom:20px;">
              <span style="background:#059669; color:#fff; font-size:9px; font-weight:800; padding:3px 8px; border-radius:99px; letter-spacing:0.5px;">DERNEKPRO STYLE</span>
              <span style="font-size:12px; font-weight:600; color:#34d399;">Yeni Nesil STK Dijital Ajansı</span>
            </div>
            <h1 style="margin:0; font-size:clamp(2.4rem,4.5vw,3.6rem); line-height:1.1; font-weight:900; letter-spacing:-0.03em; color:#fff;">
              Dernek ve Vakıflar İçin<br><span style="background:linear-gradient(90deg, #34d399, #60a5fa); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">Profesyonel Dijital Çözümler</span>
            </h1>
            <p style="font-size:1.1rem; line-height:1.7; color:#94a3b8; max-width:560px; margin:20px 0 0;">
              Sivil toplum kuruluşunuzun online bağış toplama altyapısı, web sitesi tasarımı, Google Grants reklam yönetimi ve tüm otomasyon süreçlerini tek merkezden yönetiyoruz.
            </p>
            <div style="display:flex; flex-wrap:wrap; gap:12px; margin-top:28px;">
              <a class="primary" href="#/demos" style="min-height:48px; padding:0 28px; font-size:15px; border-radius:var(--r); background:#059669; box-shadow:0 6px 20px rgba(5,150,105,0.3);">
                STK Temalarını Gör <span style="margin-left:4px;">→</span>
              </a>
              <a class="ghost" href="#lead" style="min-height:48px; padding:0 28px; font-size:15px; border-radius:var(--r); background:rgba(255,255,255,0.05); color:#fff; border:1px solid rgba(255,255,255,0.15);">
                🤝 Projeniz İçin Teklif Alın
              </a>
            </div>
            <!-- Trust badges -->
            <div style="display:flex; gap:16px; margin-top:32px; align-items:center; flex-wrap:wrap;">
              <div style="display:flex; align-items:center; gap:6px; font-size:11px; color:#94a3b8; font-weight:600;"><span style="color:#34d399;">✓</span> Sanal POS Entegrasyonu</div>
              <div style="display:flex; align-items:center; gap:6px; font-size:11px; color:#94a3b8; font-weight:600;"><span style="color:#34d399;">✓</span> Google Ad Grants Desteği</div>
              <div style="display:flex; align-items:center; gap:6px; font-size:11px; color:#94a3b8; font-weight:600;"><span style="color:#34d399;">✓</span> 7/24 Kesintisiz Sunucu</div>
            </div>
          </div>
          
          <!-- Glassmorphic stats panel -->
          <aside style="background:rgba(30,41,59,0.7); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.08); border-radius:20px; padding:32px; box-shadow:0 20px 50px -12px rgba(0,0,0,0.25); position:relative; z-index:2;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
              <span style="width:8px; height:8px; border-radius:50%; background:#10b981; box-shadow:0 0 8px #10b981;"></span>
              <span style="font-size:11px; font-weight:700; color:#10b981; text-transform:uppercase; letter-spacing:1px;">Aktif STK İstatistikleri</span>
            </div>
            <strong style="display:block; margin:8px 0 20px; font-size:2.5rem; font-weight:900; background:linear-gradient(135deg, #34d399, #3b82f6); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">${money(s.totalCollected)}</strong>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div style="padding:16px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:12px; text-align:center;">
                <b style="display:block; font-size:1.4rem; font-weight:800; color:#fff;">${esc(s.tenantCount)}</b>
                <small style="font-size:11px; color:#94a3b8; font-weight:600;">Aktif STK Portal</small>
              </div>
              <div style="padding:16px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:12px; text-align:center;">
                <b style="display:block; font-size:1.4rem; font-weight:800; color:#fff;">${esc(s.campaignCount)}</b>
                <small style="font-size:11px; color:#94a3b8; font-weight:600;">Bağış Kampanyası</small>
              </div>
              <div style="padding:16px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:12px; text-align:center;">
                <b style="display:block; font-size:1.4rem; font-weight:800; color:#fff;">${esc(s.donorCount)}</b>
                <small style="font-size:11px; color:#94a3b8; font-weight:600;">Kayıtlı Bağışçı</small>
              </div>
              <div style="padding:16px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:12px; text-align:center;">
                <b style="display:block; font-size:1.4rem; font-weight:800; color:#fff;">${esc(s.kurbanAssignedShareCount)}</b>
                <small style="font-size:11px; color:#94a3b8; font-weight:600;">Kurban Vekaleti</small>
              </div>
            </div>
          </aside>
        </section>

        <!-- ▸ SERVICES — DernekPro core agency offerings -->
        <section id="services" class="section" style="background:#0f172a; padding:60px clamp(18px,5vw,72px) 80px;">
          <div style="text-align:center; max-width:700px; margin:0 auto 50px;">
            <p class="eyebrow" style="color:#059669;">Neler Yapıyoruz?</p>
            <h2 style="font-size:clamp(1.8rem,3vw,2.5rem); margin:0 0 12px; color:#fff;">STK'nız İçin Uçtan Uca Dijital Ajans Hizmetleri</h2>
            <p style="color:#94a3b8; font-size:15px; line-height:1.6;">Yalnızca yazılım sağlamıyoruz; derneğinizin tüm dijital dönüşüm süreçlerini ve bağış toplama operasyonlarını profesyonel bir ekiple yönetiyoruz.</p>
          </div>
          
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:20px;">
            ${agencyServiceCard("💻", "Profesyonel Web Tasarım", "Tüm cihazlarla tam uyumlu (responsive), hızlı ve arama motorlarında (SEO) üst sıralarda listelenen modern dernek web siteleri tasarlıyoruz.", "#1e293b")}
            ${agencyServiceCard("💳", "Online Güvenli Bağış", "Sanal POS entegrasyonu (3D Secure) sayesinde, bağışçılarınızın tüm banka ve kredi kartlarıyla 7/24 güvenli bağış yapabileceği altyapıyı kuruyoruz.", "#1e293b")}
            ${agencyServiceCard("🐄", "Kurban Yönetim Otomasyonu", "Hisse atamaları, vekalet sahipleri yönetimi, otomatik SMS bilgilendirmeleri ve kesim videosu eşleştirme paneliyle profesyonel süreç yönetimi.", "#1e293b")}
            ${agencyServiceCard("📈", "Google & Sosyal Medya Reklamları", "STK'nız için aylık 10.000$ Google Ad Grants reklam hibesini alıyor ve bağış toplama amaçlı reklam kampanyalarınızı profesyonelce yönetiyoruz.", "#1e293b")}
          </div>
        </section>

        <!-- ▸ CUSTOM CLONE DEMOS — 10 STK Birebir Klon Alanı -->
        <section id="demos" class="section" style="background:#1e293b; padding:80px clamp(18px,5vw,72px);">
          <div style="text-align:center; max-width:750px; margin:0 auto 50px;">
            <p class="eyebrow" style="color:#34d399;">Gerçek Referans Siteler</p>
            <h2 style="margin:0 0 12px; color:#fff; font-size:clamp(1.8rem,3vw,2.5rem);">Benzersiz STK Temalarının Birebir Klonları</h2>
            <p style="color:#94a3b8; font-size:15px; line-height:1.6;">Hicret Derneği, Kardeşlik Payı gibi sivil toplum kuruluşlarının tasarımlarının, menülerinin, alt sayfalarının ve slider yapılarının birebir aynısını entegre ettik. İstediğiniz temayı seçin.</p>
          </div>
          <div class="cards three" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:24px;">
            ${orgs().map(modernDemoCard).join("")}
          </div>
        </section>

        <!-- ▸ HOW WE WORK -->
        <section class="section" style="background:#0f172a; padding:80px clamp(18px,5vw,72px);">
          <div style="text-align:center; max-width:700px; margin:0 auto 50px;">
            <p class="eyebrow" style="color:#059669;">Ajans İşleyişi</p>
            <h2 style="margin:0 0 12px; color:#fff;">Süreç Nasıl İlerliyor?</h2>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:28px; max-width:1000px; margin:0 auto;">
            ${stepCard("01", "Planlama & Teklif", "STK'nızın ihtiyaçlarını (tema tercihi, POS bankası, kurban hacmi) analiz edip size özel proje teklifi hazırlarız.", "#059669")}
            ${stepCard("02", "Tasarım & Entegrasyon", "Seçtiğiniz temayı kendi alan adınızda kurar, logoları, kampanyaları ve Sanal POS altyapısını sisteme bağlarız.", "#3b82f6")}
            ${stepCard("03", "Reklam & Bağış Akışı", "Reklam kampanyalarınızı açıp sitenizi yayına alırız. Bağışlar doğrudan banka hesabınıza akmaya başlar.", "#10b981")}
          </div>
        </section>

        <!-- ▸ LEAD FORM — CTA (Teklif Al) -->
        <section id="lead" class="section" style="background:radial-gradient(circle at 90% 10%, rgba(5,150,105,0.1), transparent 50%), #0f172a; color:#fff; border-top:1px solid rgba(255,255,255,0.06); padding:80px clamp(18px,5vw,72px);">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:48px; align-items:center; max-width:1100px; margin:0 auto;">
            <div>
              <p class="eyebrow" style="color:#059669;">Teklif Talep Formu</p>
              <h2 style="color:#fff; font-size:clamp(1.8rem,3vw,2.5rem); margin:0 0 16px;">Derneğinizi Dijital Dünyaya Taşıyalım</h2>
              <p style="color:#94a3b8; font-size:14px; line-height:1.7;">İhtiyaçlarınızı belirtin, STK dijital çözümleri ekibimiz sizinle en kısa sürede iletişime geçerek detaylı fiyat ve proje teklifini paylaşsın.</p>
              <div style="display:flex; flex-direction:column; gap:12px; margin-top:24px;">
                <div style="display:flex; align-items:center; gap:10px; font-size:13px; color:#cbd5e1;"><span style="color:#34d399;">✓</span> İhtiyaca özel modüler fiyatlandırma</div>
                <div style="display:flex; align-items:center; gap:10px; font-size:13px; color:#cbd5e1;"><span style="color:#34d399;">✓</span> Alan adı ve hosting hizmeti dahil</div>
                <div style="display:flex; align-items:center; gap:10px; font-size:13px; color:#cbd5e1;"><span style="color:#34d399;">✓</span> Google Ad Grants reklam danışmanlığı hibe kurulumu</div>
              </div>
            </div>
            
            <form class="form" data-form="lead" style="background:rgba(30,41,59,0.7); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:32px; display:grid; gap:12px;">
              <input name="organizationName" placeholder="Dernek / Vakıf Adı" required style="background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.1); color:#fff; font-size:13.5px; border-radius:var(--r); padding:10px 14px;">
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                <input name="fullName" placeholder="Ad Soyad" required style="background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.1); color:#fff; font-size:13.5px; border-radius:var(--r); padding:10px 14px;">
                <input name="phone" placeholder="Telefon" required style="background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.1); color:#fff; font-size:13.5px; border-radius:var(--r); padding:10px 14px;">
              </div>
              <input name="email" type="email" placeholder="E-Posta Adresi" style="background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.1); color:#fff; font-size:13.5px; border-radius:var(--r); padding:10px 14px;">
              <select name="selectedDemo" style="background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.1); color:#fff; font-size:13.5px; border-radius:var(--r); padding:10px 14px; height:40px;">
                ${orgs().map((o) => `<option value="${o.slug}">${esc(o.name)}</option>`).join("")}
              </select>
              <textarea name="note" placeholder="Ek açıklama veya talepleriniz..." style="background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.1); color:#fff; min-height:70px; font-size:13.5px; border-radius:var(--r); padding:10px 14px; font-family:sans-serif;"></textarea>
              <button class="primary" style="min-height:48px; font-size:15px; border-radius:var(--r); background:#059669; box-shadow:0 6px 20px rgba(5,150,105,0.3); margin-top:4px; font-weight:bold;">🚀 Teklif Talebini Gönder</button>
            <textarea name="note" placeholder="Ek açıklama veya talepleriniz..." style="background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.1); color:#fff; min-height:70px; font-size:13.5px; border-radius:var(--r); padding:10px 14px; font-family:sans-serif;"></textarea>
            <button class="primary" style="min-height:48px; font-size:15px; border-radius:var(--r); background:#059669; box-shadow:0 6px 20px rgba(5,150,105,0.3); margin-top:4px; font-weight:bold;">🚀 Teklif Talebini Gönder</button>
          </form>
        </div>
      </section>
      
      <!-- ▸ HOW IT WORKS -->
      <section class="section" style="background:#0f172a; padding:80px clamp(18px,5vw,72px);">
        <div style="text-align:center; max-width:700px; margin:0 auto 50px;">
          <p class="eyebrow" style="color:#059669;">Ajans İşleyişi</p>
          <h2 style="margin:0 0 12px; color:#fff;">Süreç Nasıl İlerliyor?</h2>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:28px; max-width:1000px; margin:0 auto;">
          ${stepCard("01", "Planlama & Teklif", "STK'nızın ihtiyaçlarını (tema tercihi, POS bankası, kurban hacmi) analiz edip size özel proje teklifi hazırlarız.", "#059669")}
          ${stepCard("02", "Tasarım & Entegrasyon", "Seçtiğiniz temayı kendi alan adınızda kurar, logoları, kampanyaları ve Sanal POS altyapısını sisteme bağlarız.", "#3b82f6")}
          ${stepCard("03", "Reklam & Bağış Akışı", "Reklam kampanyalarınızı açıp sitenizi yayına alırız. Bağışlar doğrudan banka hesabınıza akmaya başlar.", "#10b981")}
        </div>
      </section>
    </main>
    ${modernFooter()}
  </div>
  `);
}

function agencyServiceCard(icon, title, text, bg) {
  return `<article style="background:${bg}; padding:32px; border-radius:16px; border:1px solid rgba(255,255,255,0.05); box-shadow:0 4px 20px rgba(0,0,0,0.15);">
    <span style="font-size:2.2rem; display:block; margin-bottom:16px;">${icon}</span>
    <h3 style="margin:0 0 10px; font-size:1.15rem; color:#fff; font-weight:800;">${esc(title)}</h3>
    <p style="margin:0; font-size:13px; line-height:1.6; color:#94a3b8;">${esc(text)}</p>
  </article>`;
}

function featureCard(icon, title, text, bg, color) {
  return `<article class="card" style="border:none; background:${bg}; padding:28px; border-radius:16px; box-shadow:none;">
    <span style="font-size:2rem; display:block; margin-bottom:12px;">${icon}</span>
    <h3 style="margin:0 0 8px; font-size:1.1rem; color:${color};">${esc(title)}</h3>
    <p style="margin:0; font-size:13px; line-height:1.6; color:var(--muted);">${esc(text)}</p>
  </article>`;
}

function miniFeature(icon, title, text) {
  return `<div style="display:flex; gap:14px; align-items:start; padding:20px; background:#fff; border:1px solid var(--line); border-radius:12px;">
    <span style="font-size:1.5rem; flex-shrink:0; margin-top:2px;">${icon}</span>
    <div>
      <h4 style="margin:0 0 4px; font-size:13px; font-weight:700; color:var(--ink);">${esc(title)}</h4>
      <p style="margin:0; font-size:12px; color:var(--muted); line-height:1.5;">${esc(text)}</p>
    </div>
  </div>`;
}



function featureCard(icon, title, text, bg, color) {
  return `<article class="card" style="border:none; background:${bg}; padding:28px; border-radius:16px; box-shadow:none;">
    <span style="font-size:2rem; display:block; margin-bottom:12px;">${icon}</span>
    <h3 style="margin:0 0 8px; font-size:1.1rem; color:${color};">${esc(title)}</h3>
    <p style="margin:0; font-size:13px; line-height:1.6;">${esc(text)}</p>
  </article>`;
}

function miniFeature(icon, title, text) {
  return `<div style="display:flex; gap:14px; align-items:start; padding:20px; background:#fff; border:1px solid var(--line); border-radius:12px;">
    <span style="font-size:1.5rem; flex-shrink:0; margin-top:2px;">${icon}</span>
    <div>
      <h4 style="margin:0 0 4px; font-size:13px; font-weight:700; color:var(--ink);">${esc(title)}</h4>
      <p style="margin:0; font-size:12px; color:var(--muted); line-height:1.5;">${esc(text)}</p>
    </div>
  </div>`;
}

function pricingCard(title, price, period, features, popular) {
  return `<article style="background:#fff; border:${popular ? '2px solid var(--brand)' : '1px solid var(--line)'}; border-radius:16px; padding:32px; position:relative; ${popular ? 'box-shadow:0 12px 30px rgba(15,118,110,0.12); transform:scale(1.02);' : 'box-shadow:var(--shadow);'}">
    ${popular ? '<div style="position:absolute; top:-12px; left:50%; transform:translateX(-50%); background:var(--brand); color:#fff; padding:4px 16px; border-radius:99px; font-size:11px; font-weight:800; letter-spacing:0.5px;">EN POPÜLER</div>' : ''}
    <h3 style="margin:0 0 4px; font-size:1.15rem; font-weight:800;">${esc(title)}</h3>
    <div style="margin:16px 0 24px;">
      <span style="font-size:2.2rem; font-weight:900; color:var(--ink);">${price === "Özel" ? "Özel" : price + " ₺"}</span>
      ${period ? `<span style="font-size:13px; color:var(--muted); font-weight:500;">/${period}</span>` : ''}
    </div>
    <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:28px;">
      ${features.map(f => `<div style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--muted);"><span style="color:var(--brand); font-weight:bold;">✓</span> ${esc(f)}</div>`).join('')}
    </div>
    <a href="#lead" style="display:flex; align-items:center; justify-content:center; min-height:44px; border-radius:var(--r); font-weight:700; font-size:13px; text-decoration:none; ${popular ? 'background:var(--brand); color:#fff; box-shadow:0 4px 12px rgba(15,118,110,0.2);' : 'background:var(--soft); color:var(--ink); border:1px solid var(--line);'}">${price === "Özel" ? "İletişime Geçin" : "Teklif Al"}</a>
  </article>`;
}

function stepCard(num, title, text, color) {
  return `<div style="text-align:center; padding:28px;">
    <div style="width:56px; height:56px; margin:0 auto 16px; background:${color}; color:#fff; border-radius:16px; display:flex; align-items:center; justify-content:center; font-size:1.2rem; font-weight:900; box-shadow:0 8px 20px ${color}33;">${num}</div>
    <h3 style="margin:0 0 8px; font-size:1.1rem;">${esc(title)}</h3>
    <p style="margin:0; font-size:13px; color:var(--muted); line-height:1.6;">${esc(text)}</p>
  </div>`;
}

function modernDemoCard(o) {
  const themeLabel = { nezir:'Nezir', hakder:'Hakder', efendi:'Efendi', vuslat:'Vuslat', ihh:'IHH', iddef:'İDDEF', verenel:'Veren El', besir:'Beşir', hayrat:'Hayrat', gozyasi:'Gözyaşı' };
  return `<article class="demo-card" style="--p:${o.primaryColor};--a:${o.accentColor}; border-radius:16px; overflow:hidden; border:1px solid var(--line);">
    <div class="shot" style="height:180px; position:relative; background:linear-gradient(135deg, ${o.primaryColor}, ${o.accentColor}), repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 24px);">
      <div style="position:absolute; bottom:10px; left:10px; background:rgba(0,0,0,0.5); backdrop-filter:blur(8px); color:#fff; padding:4px 10px; border-radius:6px; font-size:10px; font-weight:700; letter-spacing:0.5px;">${themeLabel[o.theme] || o.theme} Teması</div>
    </div>
    <div style="padding:16px 20px 20px;">
      <h3 style="margin:0 0 6px; font-size:1.1rem; font-weight:700;">${esc(o.name)}</h3>
      <p style="color:var(--muted); font-size:13px; margin:0 0 16px; line-height:1.5;">${esc(o.tagline)}</p>
      <a href="#/demo/${o.slug}" style="display:flex; align-items:center; justify-content:center; min-height:38px; border-radius:var(--r); background:${o.primaryColor}; color:#fff; font-weight:700; font-size:12px; text-decoration:none; box-shadow:0 4px 12px ${o.primaryColor}33;">Demoyu Aç →</a>
    </div>
  </article>`;
}

function modernFooter() {
  return `<footer style="background:#0f172a; color:#94a3b8; padding:60px clamp(18px,5vw,72px) 30px;">
    <div style="display:grid; grid-template-columns:1.5fr 1fr 1fr 1fr; gap:40px; margin-bottom:40px;">
      <div>
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
          <span style="width:36px; height:36px; background:var(--brand); color:#fff; display:flex; align-items:center; justify-content:center; border-radius:10px; font-weight:900; font-size:14px;">E</span>
          <b style="color:#fff; font-size:1.15rem;">E-İnfak</b>
        </div>
        <p style="font-size:13px; line-height:1.6; color:#64748b; margin:0 0 20px; max-width:280px;">STK'lar için online bağış sitesi, bağışçı CRM, makbuz, kurban, sponsorluk, banka hareketleri ve raporlama otomasyonu.</p>
        <div style="display:flex; gap:12px;">
          <span style="width:32px; height:32px; border-radius:8px; background:#1e293b; display:flex; align-items:center; justify-content:center; color:#fff; font-size:14px; cursor:pointer;">🌐</span>
          <span style="width:32px; height:32px; border-radius:8px; background:#1e293b; display:flex; align-items:center; justify-content:center; color:#fff; font-size:14px; cursor:pointer;">📧</span>
          <span style="width:32px; height:32px; border-radius:8px; background:#1e293b; display:flex; align-items:center; justify-content:center; color:#fff; font-size:14px; cursor:pointer;">📱</span>
        </div>
      </div>
      <div>
        <h4 style="color:#fff; font-size:13px; margin:0 0 16px; text-transform:uppercase; letter-spacing:1px;">Platform</h4>
        <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; font-size:13px;">
          <li><a href="#features" style="color:#94a3b8; text-decoration:none;">Özellikler</a></li>
          <li><a href="#packages" style="color:#94a3b8; text-decoration:none;">Fiyatlandırma</a></li>
          <li><a href="#/demos" style="color:#94a3b8; text-decoration:none;">Demolar</a></li>
          <li><a href="#/admin" style="color:#94a3b8; text-decoration:none;">Admin Paneli</a></li>
        </ul>
      </div>
      <div>
        <h4 style="color:#fff; font-size:13px; margin:0 0 16px; text-transform:uppercase; letter-spacing:1px;">Destek</h4>
        <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; font-size:13px;">
          <li><a href="#lead" style="color:#94a3b8; text-decoration:none;">Demo Talebi</a></li>
          <li><a href="#lead" style="color:#94a3b8; text-decoration:none;">Teknik Destek</a></li>
          <li><a href="#lead" style="color:#94a3b8; text-decoration:none;">Eğitim Videoları</a></li>
          <li><a href="#lead" style="color:#94a3b8; text-decoration:none;">SSS</a></li>
        </ul>
      </div>
      <div>
        <h4 style="color:#fff; font-size:13px; margin:0 0 16px; text-transform:uppercase; letter-spacing:1px;">İletişim</h4>
        <div style="display:flex; flex-direction:column; gap:10px; font-size:13px;">
          <span>📞 0212 555 10 20</span>
          <span>✉️ info@e-infak.org</span>
          <span>📍 İstanbul, Türkiye</span>
        </div>
        <div style="display:flex; gap:8px; margin-top:16px; flex-wrap:wrap;">
          <span style="border:1px solid #334155; padding:3px 8px; border-radius:4px; font-size:9px; font-weight:bold; color:#fff;">SSL</span>
          <span style="border:1px solid #334155; padding:3px 8px; border-radius:4px; font-size:9px; font-weight:bold; color:#fff;">3D SECURE</span>
          <span style="border:1px solid #334155; padding:3px 8px; border-radius:4px; font-size:9px; font-weight:bold; color:#fff;">KVKK</span>
        </div>
      </div>
    </div>
    <div style="border-top:1px solid #1e293b; padding-top:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; font-size:11.5px; color:#475569;">
      <span>© 2026 E-İnfak. Tüm Hakları Saklıdır.</span>
      <div style="display:flex; gap:16px;">
        <a href="#" style="color:#475569; text-decoration:none;">KVKK Politikası</a>
        <a href="#" style="color:#475569; text-decoration:none;">Kullanım Koşulları</a>
        <a href="#" style="color:#475569; text-decoration:none;">Gizlilik Sözleşmesi</a>
      </div>
    </div>
  </footer>`;
}

function mini(label, value) { return `<div><b>${esc(value)}</b><small>${esc(label)}</small></div>`; }
function card(title, text) { return `<article class="card"><h3>${esc(title)}</h3><p>${esc(text)}</p></article>`; }
function packageCard(title, items) { return `<article class="card package"><h3>${esc(title)}</h3>${items.map((i) => `<span>${esc(i)}</span>`).join("")}<a href="#lead">Teklif al</a></article>`; }
function demoCard(o) { return `<article class="demo-card" style="--p:${o.primaryColor};--a:${o.accentColor}"><div class="shot"></div><h3>${esc(o.name)}</h3><p>${esc(o.tagline)}</p><a href="#/demo/${o.slug}">Demoyu aç</a></article>`; }
function footer() { return `<footer class="footer"><b>E-İnfak</b><span>Online bağış sitesi ve STK otomasyonu</span><nav><a href="#/demos">Demolar</a><a href="#/admin">Admin</a><a href="#/bagisci">Bağışçı Paneli</a></nav></footer>`; }


function renderZekatCalculator(o) {
  const gold = state.zekatAltin || 0;
  const cash = state.zekatNakit || 0;
  const foreign = state.zekatDoviz || 0;
  const totalWealth = Number(cash) + Number(foreign) + (Number(gold) * 3000);
  const nisab = 80.18 * 3000;
  const owesZekat = totalWealth >= nisab;
  const zekatAmount = owesZekat ? Math.round(totalWealth * 0.025) : 0;
  
  return `
    <article class="panel" style="flex:1;">
      <h2 style="margin-top:0; font-size:1.35rem; display:flex; align-items:center; gap:8px;">
        <span>🧮</span> Zekat Hesaplama Modülü
      </h2>
      <p class="muted" style="font-size:11px; margin-top:-8px; margin-bottom:16px;">Altın, nakit ve birikimleriniz üzerinden ödemeniz gereken zekat miktarını anında hesaplayın.</p>
      
      <div class="form" style="gap:10px;">
        <div>
          <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Nakit Birikim (TL)</label>
          <input type="number" data-zekat-input="cash" value="${cash || ''}" placeholder="0 TL" style="padding: 8px 10px; font-size: 13px;">
        </div>
        <div>
          <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Döviz & Diğer Birikimler (TL Değeri)</label>
          <input type="number" data-zekat-input="foreign" value="${foreign || ''}" placeholder="0 TL" style="padding: 8px 10px; font-size: 13px;">
        </div>
        <div>
          <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Altın Birikimi (Gram)</label>
          <input type="number" data-zekat-input="gold" value="${gold || ''}" placeholder="0 gr" style="padding: 8px 10px; font-size: 13px;">
        </div>
      </div>
      
      <div style="background:var(--soft); border:1px solid var(--line); border-radius:var(--r); padding:12px; margin-top:16px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:12px;">
          <span>Toplam Birikim:</span>
          <b style="color:var(--ink);" id="zekat-total-wealth">${money(totalWealth)}</b>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:8px;">
          <span>Nisab Sınırı (80.18 gr Altın):</span>
          <span style="color:var(--muted);">${money(nisab)}</span>
        </div>
        
        <div style="border-top: 1px dashed var(--line); padding-top:8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <span style="font-size:11px; display:block; color:var(--muted); font-weight:bold; text-transform:uppercase;">Zekat Borcu</span>
            <b style="font-size:1.35rem; color:var(--brand);" id="zekat-amount-val">${money(zekatAmount)}</b>
          </div>
          <div id="zekat-action-container">
            ${zekatAmount > 0 ? `
              <button type="button" data-action="donateCalculatedZekat" data-amount="${zekatAmount}" style="min-height:32px; padding:0 12px; font-size:11px; border:0; background:var(--brand); color:#fff; border-radius:var(--r); font-weight:bold;">Zekatı Bağışla</button>
            ` : `
              <span style="font-size:10px; color:var(--muted); text-align:right; max-width:145px; display:block; line-height:1.3;">Nisab sınırının altında kaldığı için zekat gerekmemektedir.</span>
            `}
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderFaqAccordion() {
  return `
    <article class="panel" style="flex:1;">
      <h2 style="margin-top:0; font-size:1.35rem; display:flex; align-items:center; gap:8px;">
        <span>❓</span> Sıkça Sorulan Sorular
      </h2>
      <p class="muted" style="font-size:11px; margin-top:-8px; margin-bottom:16px;">Bağış süreçleri ve güvenlik politikalarımız hakkında merak edilenler.</p>
      
      <div class="faq-accordion" style="display:grid; gap:8px;">
        <details style="background:var(--soft); border:1px solid var(--line); border-radius:var(--r); padding:8px 12px; cursor:pointer;">
          <summary style="font-weight:bold; font-size:13px; color:var(--ink); list-style:none; outline:none; display:flex; justify-content:space-between; align-items:center;">
            <span>Bağışım yerine nasıl ulaşıyor?</span>
            <span style="font-size:10px; color:var(--muted);">▼</span>
          </summary>
          <p style="margin:8px 0 0; font-size:12px; color:var(--muted); line-height:1.5;">
            E-İnfak altyapısı sayesinde bağışınız anında ilgili kampanya hesabına geçer, makbuzunuz e-posta ile iletilir ve kurban gibi hisseli bağışlar anında ilgili hayvana atanarak operasyon başlatılır.
          </p>
        </details>
        
        <details style="background:var(--soft); border:1px solid var(--line); border-radius:var(--r); padding:8px 12px; cursor:pointer;">
          <summary style="font-weight:bold; font-size:13px; color:var(--ink); list-style:none; outline:none; display:flex; justify-content:space-between; align-items:center;">
            <span>Zekat bağışları nasıl değerlendiriliyor?</span>
            <span style="font-size:10px; color:var(--muted);">▼</span>
          </summary>
          <p style="margin:8px 0 0; font-size:12px; color:var(--muted); line-height:1.5;">
            Zekat bağışlarınız, şer'i kurallara tam uyumlu şekilde, sadece zekat alabilecek konumda olan ihtiyaç sahibi yetim aileleri, medrese öğrencileri ve afetzedeler için kullanılır.
          </p>
        </details>
        
        <details style="background:var(--soft); border:1px solid var(--line); border-radius:var(--r); padding:8px 12px; cursor:pointer;">
          <summary style="font-weight:bold; font-size:13px; color:var(--ink); list-style:none; outline:none; display:flex; justify-content:space-between; align-items:center;">
            <span>Kurban kesildiğinde nasıl haber alıyorum?</span>
            <span style="font-size:10px; color:var(--muted);">▼</span>
          </summary>
          <p style="margin:8px 0 0; font-size:12px; color:var(--muted); line-height:1.5;">
            Kurban hisseniz kesildiğinde, sistemde tanımlı telefon numaranıza otomatik olarak SMS bildirim gider ve kesim videosunun izleme linki profilinize eklenir.
          </p>
        </details>

        <details style="background:var(--soft); border:1px solid var(--line); border-radius:var(--r); padding:8px 12px; cursor:pointer;">
          <summary style="font-weight:bold; font-size:13px; color:var(--ink); list-style:none; outline:none; display:flex; justify-content:space-between; align-items:center;">
            <span>Kredi kartı güvenliği nasıl sağlanıyor?</span>
            <span style="font-size:10px; color:var(--muted);">▼</span>
          </summary>
          <p style="margin:8px 0 0; font-size:12px; color:var(--muted); line-height:1.5;">
            Tüm ödemeleriniz Vakıf Katılım Sanal POS altyapısı üzerinden 3D Secure güvencesiyle gerçekleşmektedir. Kart bilgileriniz kesinlikle bizim tarafımızdan kaydedilmemekte veya saklanmamaktadır.
          </p>
        </details>
      </div>
    </article>
  `;
}

function renderWorldMap() {
  const active = state.activeCountry || "turkey";
  return `
    <div style="position:relative; width:100%;">
      <svg viewBox="0 0 1000 450" class="world-svg" style="width:100%; height:auto; background:#0f172a; border-radius:var(--r); border:1px solid var(--line); display:block; padding: 20px 0; box-shadow: inset 0 0 40px rgba(0,0,0,0.4);">
        <!-- Turkey path/shape -->
        <g class="country-group ${active === 'turkey' ? 'active-country' : ''}" data-country="turkey" style="cursor:pointer;">
          <path d="M 450 150 Q 520 140 550 160 Q 530 180 470 180 Z" fill="${active === 'turkey' ? 'var(--p)' : '#334155'}" stroke="${active === 'turkey' ? 'var(--a)' : '#475569'}" stroke-width="2" class="country-path" style="transition: fill 0.3s, stroke 0.3s;"></path>
          <circle cx="500" cy="165" r="10" fill="var(--a)" class="map-pulse" style="opacity:0.8;"></circle>
          <text x="500" y="132" fill="#fff" font-size="12" font-weight="bold" text-anchor="middle" style="font-family:sans-serif; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">Türkiye</text>
        </g>
        
        <!-- Palestine path/shape -->
        <g class="country-group ${active === 'palestine' ? 'active-country' : ''}" data-country="palestine" style="cursor:pointer;">
          <path d="M 525 200 Q 545 195 550 205 Q 540 215 530 215 Z" fill="${active === 'palestine' ? 'var(--p)' : '#334155'}" stroke="${active === 'palestine' ? 'var(--a)' : '#475569'}" stroke-width="2" class="country-path" style="transition: fill 0.3s, stroke 0.3s;"></path>
          <circle cx="538" cy="205" r="8" fill="var(--a)" class="map-pulse" style="opacity:0.8;"></circle>
          <text x="575" y="210" fill="#fff" font-size="12" font-weight="bold" text-anchor="start" style="font-family:sans-serif; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">Filistin</text>
        </g>

        <!-- Somalia path/shape -->
        <g class="country-group ${active === 'somalia' ? 'active-country' : ''}" data-country="somalia" style="cursor:pointer;">
          <path d="M 570 290 Q 610 320 590 350 Q 550 320 560 280 Z" fill="${active === 'somalia' ? 'var(--p)' : '#334155'}" stroke="${active === 'somalia' ? 'var(--a)' : '#475569'}" stroke-width="2" class="country-path" style="transition: fill 0.3s, stroke 0.3s;"></path>
          <circle cx="585" cy="320" r="10" fill="var(--a)" class="map-pulse" style="opacity:0.8;"></circle>
          <text x="640" y="325" fill="#fff" font-size="12" font-weight="bold" text-anchor="start" style="font-family:sans-serif; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">Somali</text>
        </g>

        <!-- Niger path/shape -->
        <g class="country-group ${active === 'niger' ? 'active-country' : ''}" data-country="niger" style="cursor:pointer;">
          <path d="M 400 280 Q 450 270 470 300 Q 420 320 380 300 Z" fill="${active === 'niger' ? 'var(--p)' : '#334155'}" stroke="${active === 'niger' ? 'var(--a)' : '#475569'}" stroke-width="2" class="country-path" style="transition: fill 0.3s, stroke 0.3s;"></path>
          <circle cx="425" cy="295" r="10" fill="var(--a)" class="map-pulse" style="opacity:0.8;"></circle>
          <text x="350" y="298" fill="#fff" font-size="12" font-weight="bold" text-anchor="end" style="font-family:sans-serif; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">Nijer</text>
        </g>
      </svg>
      <div style="position:absolute; bottom:12px; left:12px; font-size:10px; color:#94a3b8; font-family:sans-serif; background:rgba(15,23,42,0.8); padding:4px 8px; border-radius:4px;">
        💡 İncelemek için haritadaki ülkelere veya isimlerine tıklayın.
      </div>
    </div>
  `;
}

function renderImpactPanel(o) {
  const active = state.activeCountry || "turkey";
  const data = {
    turkey: {
      name: "Türkiye",
      desc: "Yurt içi insani yardım faaliyetlerimiz kapsamında deprem bölgeleri, yetim eğitim bursları ve aile gıda kolisi dağıtımları aktif olarak sürdürülmektedir.",
      stats: [
        { label: "Burs Verilen Yetim", val: "120 Öğrenci" },
        { label: "Gıda Kolisi Desteği", val: "4,500 Aile" },
        { label: "Toplam Yardım Tutarı", val: "950,000 TL" }
      ]
    },
    palestine: {
      name: "Filistin (Gazze)",
      desc: "Gazze başta olmak üzere Filistin'de sıcak yemek mutfağımız, temiz içme suyu sevkiyatı ve hastanelere acil ilaç desteklerimiz kesintisiz sürmektedir.",
      stats: [
        { label: "Sıcak Yemek (Günlük)", val: "2,000 Yetim" },
        { label: "İnsani Yardım Tırları", val: "12 Tır Gıda/Tıbbi" },
        { label: "Toplam Yardım Tutarı", val: "2,400,000 TL" }
      ]
    },
    somalia: {
      name: "Somali",
      desc: "Doğu Afrika'da kuraklıkla mücadele için derin su kuyuları açıyor, yetimhanelerin tüm gıda/eğitim giderlerini üstlenerek kalkınmayı destekliyoruz.",
      stats: [
        { label: "Aktif Su Kuyusu", val: "45 Derin Kuyu" },
        { label: "Sponsor Olunan Yetim", val: "120 Çocuk" },
        { label: "Toplam Yardım Tutarı", val: "1,250,000 TL" }
      ]
    },
    niger: {
      name: "Nijer",
      desc: "Batı Afrika'da açtığımız temiz su çeşmeleri ve tarım okullarıyla sürdürülebilir kalkınmayı destekliyor, yetimlerimizi koruma altına alıyoruz.",
      stats: [
        { label: "Açılan Su Kuyusu", val: "32 Kuyu" },
        { label: "Mobil Sağlık Ameliyatı", val: "450 Katarakt Hastası" },
        { label: "Toplam Yardım Tutarı", val: "850,000 TL" }
      ]
    }
  };
  
  const country = data[active];
  return `
    <div class="panel" style="background:#fff; border:1px solid var(--line); border-radius:var(--r); padding:24px; box-shadow: 0 4px 12px rgba(0,0,0,0.02); display:flex; flex-direction:column; justify-content:space-between; min-height:360px; box-sizing:border-box;">
      <div>
        <h3 style="margin-top:0; font-size:1.35rem; color:var(--ink); display:flex; align-items:center; gap:8px;">
          <span style="font-size:1.5rem;">📍</span> ${country.name} Faaliyet Raporu
        </h3>
        <p style="font-size:13px; line-height:1.6; color:var(--muted); margin-bottom:20px; font-family:sans-serif;">${country.desc}</p>
      </div>
      <div style="display:grid; gap:10px;">
        ${country.stats.map(s => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:#f8fafc; border:1px solid var(--line); border-radius:var(--r);">
            <span style="font-size:12px; color:#475569; font-weight:600; font-family:sans-serif;">${s.label}</span>
            <b style="font-size:13px; color:var(--brand); font-family:sans-serif;">${s.val}</b>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderTransparencyChart(o) {
  return `
    <div style="background:#f8fafc; border:1px solid var(--line); border-radius:var(--r); padding:24px; max-width:800px; margin:0 auto; display:grid; grid-template-columns: 1fr 1.3fr; gap:28px; align-items:center; box-sizing:border-box;">
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div style="border-left: 4px solid var(--brand); padding-left:12px;">
          <span style="font-size:11px; font-weight:bold; color:var(--muted); text-transform:uppercase; font-family:sans-serif;">Doğrudan Sahaya</span>
          <b style="font-size:1.6rem; color:var(--brand); display:block; line-height:1.2; font-family:sans-serif;">%85</b>
          <p style="font-size:11.5px; color:var(--muted); margin:4px 0 0; font-family:sans-serif; line-height:1.4;">Gıda kolisi, yetim bursu, tıbbi malzemeler ve kurban hisseleri alımları.</p>
        </div>
        <div style="border-left: 4px solid var(--a); padding-left:12px;">
          <span style="font-size:11px; font-weight:bold; color:var(--muted); text-transform:uppercase; font-family:sans-serif;">Lojistik ve Operasyon</span>
          <b style="font-size:1.6rem; color:var(--a); display:block; line-height:1.2; font-family:sans-serif;">%10</b>
          <p style="font-size:11.5px; color:var(--muted); margin:4px 0 0; font-family:sans-serif; line-height:1.4;">Ulaşım, saha kargo gönderimleri ve kurban kesim denetimi.</p>
        </div>
        <div style="border-left: 4px solid #64748b; padding-left:12px;">
          <span style="font-size:11px; font-weight:bold; color:var(--muted); text-transform:uppercase; font-family:sans-serif;">Yönetim & Bilgi İşlem</span>
          <b style="font-size:1.6rem; color:#475569; display:block; line-height:1.2; font-family:sans-serif;">%5</b>
          <p style="font-size:11.5px; color:var(--muted); margin:4px 0 0; font-family:sans-serif; line-height:1.4;">Bağış otomasyon altyapısı, sms bildirimleri ve makbuz basımı.</p>
        </div>
      </div>
      <div style="display:flex; justify-content:center;">
        <svg width="200" height="200" viewBox="0 0 36 36" style="transform: rotate(-90deg); overflow:visible;">
          <circle cx="18" cy="18" r="15.915" fill="none" stroke="#e2e8f0" stroke-width="3"></circle>
          <circle cx="18" cy="18" r="15.915" fill="none" stroke="var(--brand)" stroke-width="3.5" stroke-dasharray="85 15" stroke-dashoffset="0" stroke-linecap="round"></circle>
          <circle cx="18" cy="18" r="15.915" fill="none" stroke="var(--a)" stroke-width="3.5" stroke-dasharray="10 90" stroke-dashoffset="-85" stroke-linecap="round"></circle>
          <circle cx="18" cy="18" r="15.915" fill="none" stroke="#64748b" stroke-width="3.5" stroke-dasharray="5 95" stroke-dashoffset="-95" stroke-linecap="round"></circle>
          <g style="transform: rotate(90deg) translate(0px, -36px); transform-origin: center;">
            <text x="18" y="16" font-size="2.2" font-weight="bold" text-anchor="middle" fill="var(--ink)" style="font-family:sans-serif; letter-spacing:0.5px;">HER 100 TL</text>
            <text x="18" y="21" font-size="3.5" font-weight="900" text-anchor="middle" fill="var(--brand)" style="font-family:sans-serif;">%85 SAHA</text>
          </g>
        </svg>
      </div>
    </div>
  `;
}

function renderSponsorModal(orphan) {
  return `
    <div style="position:fixed; inset:0; z-index:1000; background:rgba(15,23,42,0.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:16px;">
      <div style="background:#fff; border-radius:var(--r); width:100%; max-width:480px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); overflow:hidden; animation: slideUp 0.3s ease;">
        <div style="background:var(--brand); color:#fff; padding:16px 20px; display:flex; justify-content:space-between; align-items:center;">
          <h3 style="margin:0; font-size:1.15rem;">👶 Yetim Sponsorluğu Başlat</h3>
          <button type="button" data-action="closeOrphanModal" style="background:transparent; border:0; color:#fff; font-size:1.5rem; cursor:pointer; line-height:1;">&times;</button>
        </div>
        
        <form data-form="sponsorship" style="padding:20px; display:flex; flex-direction:column; gap:12px; margin:0;">
          <input type="hidden" name="orphanId" value="${orphan.id}">
          <input type="hidden" name="orgSlug" value="${state.route.slug}">
          <input type="hidden" name="amount" value="500">
          
          <div style="background:#f8fafc; border:1px solid var(--line); border-radius:var(--r); padding:10px 14px; font-size:12.5px; color:var(--muted); line-height:1.4;">
            Sponsor Olunan Yetim: <strong style="color:var(--ink);">${esc(orphan.name)} (${esc(orphan.country)})</strong><br>
            Aylık Düzenli Destek Tutarı: <strong style="color:var(--brand);">500 TL/Ay</strong>
          </div>
          
          <div>
            <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Ad Soyad</label>
            <input type="text" name="fullName" placeholder="Adınız Soyadınız" required style="padding:8px 10px; font-size:13px;">
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div>
              <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">E-Posta</label>
              <input type="email" name="email" placeholder="ornek@mail.com" required style="padding:8px 10px; font-size:13px;">
            </div>
            <div>
              <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Telefon</label>
              <input type="text" name="phone" placeholder="0555 123 4567" required style="padding:8px 10px; font-size:13px;">
            </div>
          </div>
          <div>
            <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Şehir</label>
            <input type="text" name="city" placeholder="İstanbul" required style="padding:8px 10px; font-size:13px;">
          </div>
          
          <div class="card-inputs" style="margin-top:8px;">
            <h3>💳 Kredi Kartı ile Aylık Ödeme</h3>
            <div>
              <label style="font-size:10px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Kart Sahibi ve Numarası</label>
              <input type="text" name="ccName" placeholder="Kart Üzerindeki İsim" required style="padding:8px 10px; font-size:13px; margin-bottom:6px;">
              <input type="text" name="ccNumber" data-mask="cc" placeholder="0000 0000 0000 0000" maxlength="19" required style="padding:8px 10px; font-size:13px;">
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:6px;">
              <div>
                <label style="font-size:10px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">S.K.T (AY/YIL)</label>
                <input type="text" name="ccExpiry" data-mask="expiry" placeholder="MM/YY" maxlength="5" required style="padding:8px 10px; font-size:13px;">
              </div>
              <div>
                <label style="font-size:10px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">CVC</label>
                <input type="text" name="ccCvc" data-mask="cvc" placeholder="123" maxlength="3" required style="padding:8px 10px; font-size:13px;">
              </div>
            </div>
          </div>
          
          <button type="submit" style="margin-top:12px; width:100%; min-height:44px; background:var(--brand); color:#fff; border:0; border-radius:var(--r); font-weight:bold; font-size:13.5px; cursor:pointer; box-shadow: 0 4px 12px rgba(15,118,110,0.15);">Sponsorluğu Başlat ve İlk Ödemeyi Yap</button>
        </form>
      </div>
    </div>
  `;
}

function renderKurbanVideoModal(videoUrl) {
  const url = videoUrl || "https://www.w3schools.com/html/mov_bbb.mp4";
  return `
    <div style="position:fixed; inset:0; z-index:1000; background:rgba(15,23,42,0.7); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:16px;">
      <div style="background:#fff; border-radius:var(--r); width:100%; max-width:640px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); overflow:hidden; animation: slideUp 0.3s ease;">
        <div style="background:#0f172a; color:#fff; padding:16px 20px; display:flex; justify-content:space-between; align-items:center;">
          <h3 style="margin:0; font-size:1.1rem; display:flex; align-items:center; gap:8px;">🎥 Kurban Vekalet Kesim Videosu</h3>
          <button type="button" data-action="closeKurbanVideoModal" style="background:transparent; border:0; color:#fff; font-size:1.5rem; cursor:pointer; line-height:1;">&times;</button>
        </div>
        <div style="background:#000; display:block; position:relative; padding-top:56.25%;">
          <video controls autoplay style="position:absolute; top:0; left:0; width:100%; height:100%; border:0;">
            <source src="${url}" type="video/mp4">
            Tarayıcınız video oynatmayı desteklemiyor.
          </video>
        </div>
        <div style="padding:16px; background:#f8fafc; font-size:12px; color:var(--muted); line-height:1.4; text-align:center; font-family:sans-serif;">
          ⚠️ E-İnfak otomatik video eşleştirme sistemiyle hazırlanan bu kesim kaydı vekalet sahibine özeldir.
        </div>
      </div>
    </div>
  `;
}

function orphanCard(o, ch) {
  const isSponsored = ch.status === "sponsored";
  return `
    <article class="campaign" style="display:flex; flex-direction:column; justify-content:space-between; min-height:400px; box-sizing:border-box;">
      <div class="visual" style="background: url('${ch.photoUrl}') center/cover no-repeat; position:relative;">
        <span style="background:${isSponsored ? '#10b981' : 'var(--p)'}; color:#fff; font-weight:bold;">${esc(ch.country)}</span>
      </div>
      <h3 style="margin-top:16px; margin-left:20px; margin-right:20px;">${esc(ch.fullName)}</h3>
      <p style="flex-grow:1; margin-left:20px; margin-right:20px; font-size:13px; line-height:1.5; color:var(--muted); font-family:sans-serif;">
        ${esc(ch.age)} yaşında. ${esc(ch.schoolReport.split(".")[0])}.
      </p>
      
      <div style="margin: 16px 20px 20px;">
        ${isSponsored ? `
          <div style="text-align:center; padding:10px; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:var(--r); color:#065f46; font-size:12px; font-weight:bold; font-family:sans-serif;">
            🔒 Sponsoru Var (Destekleniyor)
          </div>
        ` : `
          <button type="button" data-action="openSponsorModal" data-orphan-id="${ch.id}" data-name="${esc(ch.fullName)}" data-country="${esc(ch.country)}"
                  style="width:100%; min-height:40px; border:0; background:var(--brand); color:#fff; border-radius:var(--r); font-weight:bold; font-size:12.5px; cursor:pointer; box-shadow: 0 4px 12px rgba(15,118,110,0.15);">
            Sponsor Ol (500 TL/Ay)
          </button>
        `}
      </div>
    </article>
  `;
}

let autoplayInterval = null;
function startAutoplay() {
  if (autoplayInterval) clearInterval(autoplayInterval);
  autoplayInterval = setInterval(() => {
    if (state.route && state.route.name === "demo" && state.route.section === "home") {
      const list = campaigns(state.route.slug);
      const featured = list.filter((c) => c.featured).slice(0, 5);
      if (featured.length > 0) {
        state.currentSlideIndex = ((state.currentSlideIndex || 0) + 1) % featured.length;
        render();
      }
    }
  }, 5000);
}

function aboutSite(o) {
  return shell(`<div class="site" style="--p:${o.primaryColor};--a:${o.accentColor}">
    ${siteHeader(o)}
    <main style="max-width:800px; margin:0 auto; padding:40px 20px;">
      <section style="background:#fff; border:1px solid var(--line); border-radius:var(--r); padding:32px; box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
        <h1 style="margin-top:0; font-size:1.8rem; color:var(--ink); border-bottom: 2px solid var(--brand); padding-bottom:12px; display:flex; align-items:center; gap:8px;">
          <span>🏛️</span> Hakkımızda
        </h1>
        <p style="font-size:14px; line-height:1.7; color:var(--ink); font-family:sans-serif; margin-top:20px;">
          Kurulduğumuz ilk günden bu yana, insani değerleri korumak ve dünyanın dört bir yanındaki ihtiyaç sahiplerine sürdürülebilir yardım eli uzatmak için çalışıyoruz. 
          Gıda güvencesinden temiz suya, eğitim desteklerinden yetim hami projelerine kadar her çalışmamızı <strong>şeffaflık, hesap verebilirlik ve liyakat</strong> esaslarına göre yürütüyoruz.
        </p>
        
        <h3 style="margin-top:24px; color:var(--brand); font-size:1.15rem;">🎯 Misyonumuz</h3>
        <p style="font-size:13px; line-height:1.6; color:var(--muted); font-family:sans-serif;">
          Savaş, doğal afet ve kuraklık gibi kriz bölgelerindeki insan onurunu koruyacak temel yaşam desteklerini en hızlı şekilde ulaştırmak ve bölge halkının kalkınmasını sağlayacak kalıcı projeler inşa etmek.
        </p>
        
        <h3 style="margin-top:20px; color:var(--brand); font-size:1.15rem;">👁️ Vizyonumuz</h3>
        <p style="font-size:13px; line-height:1.6; color:var(--muted); font-family:sans-serif;">
          Yeryüzünde adaletin ve paylaşma bilincinin yaygınlaştığı, kimsesiz ve korumasız çocukların eğitim haklarına tam erişim sağlayabildiği refah dolu bir dünya.
        </p>
        
        <div style="margin-top:28px; background:#f8fafc; border:1px solid var(--line); border-radius:var(--r); padding:18px; display:flex; gap:16px; align-items:center;">
          <div style="font-size:2rem;">🛡️</div>
          <div>
            <h4 style="margin:0 0 4px; font-size:13.5px; color:var(--ink);">Fıkhi Denetim ve Güvence</h4>
            <p style="margin:0; font-size:12px; color:var(--muted); font-family:sans-serif; line-height:1.4;">Zekat, kurban ve sadaka bağışlarınız, uzman fıkhi kurullarımızın gözetiminde, şart koştuğunuz amaç ve bölgeye tam uygun olarak sahaya sevk edilir.</p>
          </div>
        </div>
      </section>
    </main>
    ${siteFooter(o)}
  </div>`);
}

function contactSite(o) {
  return shell(`<div class="site" style="--p:${o.primaryColor};--a:${o.accentColor}">
    ${siteHeader(o)}
    <main style="max-width:1000px; margin:0 auto; padding:40px 20px;">
      <section style="display:grid; grid-template-columns:1.2fr 1fr; gap:28px; align-items:start;">
        <!-- Contact details and map -->
        <div style="background:#fff; border:1px solid var(--line); border-radius:var(--r); padding:32px; box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
          <h1 style="margin-top:0; font-size:1.8rem; color:var(--ink); border-bottom: 2px solid var(--brand); padding-bottom:12px; display:flex; align-items:center; gap:8px;">
            <span>📞</span> İletişim Bilgileri
          </h1>
          
          <div style="display:flex; flex-direction:column; gap:16px; margin-top:20px;">
            <div style="display:flex; gap:12px; align-items:center;">
              <span style="font-size:1.3rem;">📍</span>
              <div style="font-family:sans-serif; font-size:13px;">
                <strong>Merkez Ofis:</strong> Merkez Mah. Vatan Cad. No: 12 Fatih, İstanbul
              </div>
            </div>
            <div style="display:flex; gap:12px; align-items:center;">
              <span style="font-size:1.3rem;">☎️</span>
              <div style="font-family:sans-serif; font-size:13px;">
                <strong>Telefon:</strong> 0212 555 1020 (Çağrı Merkezi)
              </div>
            </div>
            <div style="display:flex; gap:12px; align-items:center;">
              <span style="font-size:1.3rem;">✉️</span>
              <div style="font-family:sans-serif; font-size:13px;">
                <strong>E-Posta:</strong> info@${o.slug}.org
              </div>
            </div>
          </div>
          
          <!-- Mock Map -->
          <div style="margin-top:24px; border:1px solid var(--line); border-radius:var(--r); overflow:hidden; background:#e2e8f0; height:200px; position:relative; display:flex; align-items:center; justify-content:center;">
            <div style="text-align:center; color:#475569; z-index:2;">
              <span style="font-size:2rem; display:block;">🗺️</span>
              <strong style="font-size:12.5px; font-family:sans-serif;">Harita Gösterimi Mockup</strong><br>
              <span style="font-size:11px; color:#64748b; font-family:sans-serif;">Fatih, İstanbul / Türkiye</span>
            </div>
            <!-- Mock visual pattern representing a map -->
            <div style="position:absolute; inset:0; opacity:0.15; background: radial-gradient(circle, #000 10%, transparent 11%), radial-gradient(circle, #000 10%, transparent 11%); background-size: 20px 20px; background-position: 0 0, 10px 10px;"></div>
          </div>
        </div>
        
        <!-- Contact Form -->
        <div style="background:#fff; border:1px solid var(--line); border-radius:var(--r); padding:32px; box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
          <h2 style="margin-top:0; font-size:1.3rem; color:var(--ink);">Bizimle İletişime Geçin</h2>
          <p style="font-size:12px; color:var(--muted); margin-bottom:20px; font-family:sans-serif;">Merak ettiğiniz konuları sorun, en kısa sürede dönüş sağlayalım.</p>
          
          <form data-form="contact" style="display:flex; flex-direction:column; gap:12px; margin:0;">
            <input type="hidden" name="orgSlug" value="${o.slug}">
            <div>
              <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Adınız Soyadınız</label>
              <input type="text" name="name" required placeholder="Adınız Soyadınız" style="padding:8px 10px; font-size:13px; border-radius:var(--r); border:1px solid var(--line);">
            </div>
            <div>
              <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">E-Posta Adresiniz</label>
              <input type="email" name="email" required placeholder="ornek@mail.com" style="padding:8px 10px; font-size:13px; border-radius:var(--r); border:1px solid var(--line);">
            </div>
            <div>
              <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Konu</label>
              <input type="text" name="subject" required placeholder="Hangi konuda yazıyorsunuz?" style="padding:8px 10px; font-size:13px; border-radius:var(--r); border:1px solid var(--line);">
            </div>
            <div>
              <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Mesajınız</label>
              <textarea name="message" required placeholder="Mesajınız..." style="padding:8px 10px; font-size:13px; height:80px; border-radius:var(--r); border:1px solid var(--line); font-family:sans-serif;"></textarea>
            </div>
            <button class="primary" style="margin-top:8px; min-height:40px; border-radius:var(--r); font-weight:bold; cursor:pointer;">Mesajı Gönder</button>
          </form>
        </div>
      </section>
    </main>
    ${siteFooter(o)}
  </div>`);
}

function demoSite(slug) {
  const o = org(slug);
  const list = campaigns(slug);
  if (state.route.section === "bagis") {
    const campaign = list.find((c) => c.slug === state.route.item) || list[0];
    if (typeof themeLayouts !== 'undefined' && themeLayouts[o.theme] && themeLayouts[o.theme].checkout) {
      return shell(themeLayouts[o.theme].checkout(o, campaign));
    }
    return donationPage(o, campaign);
  }
  if (state.route.section === "sepet") {
    if (typeof themeLayouts !== 'undefined' && themeLayouts[o.theme] && themeLayouts[o.theme].cart) {
      return shell(themeLayouts[o.theme].cart(o));
    }
  }
  if (state.route.section === "basvuru") {
    if (typeof themeLayouts !== 'undefined' && themeLayouts[o.theme] && themeLayouts[o.theme].basvuru) {
      return shell(themeLayouts[o.theme].basvuru(o));
    }
  }
  if (state.route.section === "bolumler") {
    if (typeof themeLayouts !== 'undefined' && themeLayouts[o.theme] && themeLayouts[o.theme].bolumler) {
      return shell(themeLayouts[o.theme].bolumler(o));
    }
  }
  if (state.route.section === "duyurular") {
    if (typeof themeLayouts !== 'undefined' && themeLayouts[o.theme] && themeLayouts[o.theme].duyurular) {
      return shell(themeLayouts[o.theme].duyurular(o));
    }
  }
  if (state.route.section === "hesap-numaralarimiz") {
    if (typeof themeLayouts !== 'undefined' && themeLayouts[o.theme] && themeLayouts[o.theme].accounts) {
      return shell(themeLayouts[o.theme].accounts(o));
    }
  }
  if (state.route.section === "portal") {
    if (typeof themeLayouts !== 'undefined' && themeLayouts[o.theme] && themeLayouts[o.theme].portal) {
      return shell(themeLayouts[o.theme].portal(o));
    }
  }
  if (state.route.section === "gonullu-ol") {
    if (typeof themeLayouts !== 'undefined' && themeLayouts[o.theme] && themeLayouts[o.theme].gonullu) {
      return shell(themeLayouts[o.theme].gonullu(o));
    }
  }
  if (state.route.section === "gizlilik-politikasi") {
    if (typeof themeLayouts !== 'undefined' && themeLayouts[o.theme] && themeLayouts[o.theme].gizlilik) {
      return shell(themeLayouts[o.theme].gizlilik(o));
    }
  }
  if (state.route.section === "hakkimizda") {
    if (typeof themeLayouts !== 'undefined' && themeLayouts[o.theme] && themeLayouts[o.theme].about) {
      return shell(themeLayouts[o.theme].about(o, list));
    }
    return aboutSite(o);
  }
  if (state.route.section === "iletisim") {
    if (typeof themeLayouts !== 'undefined' && themeLayouts[o.theme] && themeLayouts[o.theme].contact) {
      return shell(themeLayouts[o.theme].contact(o, list));
    }
    return contactSite(o);
  }
  if (state.route.section === "faaliyetlerimiz") {
    if (typeof themeLayouts !== 'undefined' && themeLayouts[o.theme] && themeLayouts[o.theme].activities) {
      return shell(themeLayouts[o.theme].activities(o, list));
    }
  }
  if (state.route.section === "projelerimiz") {
    if (typeof themeLayouts !== 'undefined' && themeLayouts[o.theme] && themeLayouts[o.theme].projects) {
      return shell(themeLayouts[o.theme].projects(o, list));
    }
  }
  
  // Theme dispatch: if a custom layout exists for this org's theme, use it
  if (typeof themeLayouts !== 'undefined' && themeLayouts[o.theme] && themeLayouts[o.theme].home) {
    return shell(themeLayouts[o.theme].home(o, list));
  }
  
  // Fallback: original layout
  const featured = list.filter((c) => c.featured).slice(0, 5);
  const currentSlide = state.currentSlideIndex || 0;
  
  const sliderDots = `
    <div class="slider-dots" style="display:flex; justify-content:center; gap:6px; margin-top:-35px; margin-bottom:20px; position:relative; z-index:5;">
      ${featured.map((_, idx) => `
        <span class="slide-dot" data-slide-dot="${idx}"
              style="width:${idx === currentSlide ? '20px' : '8px'}; height:8px; border-radius:4px; background:${idx === currentSlide ? 'var(--a)' : 'rgba(255,255,255,0.4)'}; cursor:pointer; transition:width 0.2s, background 0.2s;"></span>
      `).join("")}
    </div>
  `;

  const activeCat = state.selectedCategory || "all";
  const cats = [
    { label: "Tümü", value: "all" },
    { label: "Acil Yardım", value: "acil-yardim" },
    { label: "Kurban", value: "kurban" },
    { label: "Zekat & Eğitim", value: "zekat" },
    { label: "Yetim Sponsorluğu 👶", value: "yetim" }
  ];
  
  const categoryTabs = `
    <div class="category-tabs" style="display:flex; gap:8px; margin-bottom:24px; overflow:auto; padding-bottom:4px;">
      ${cats.map(c => `
        <button type="button" data-category-tab="${c.value}" 
                style="min-height:32px; padding:0 16px; font-size:12px; border-radius:99px; cursor:pointer; border:1px solid var(--line); transition:all 0.15s;
                       background:${activeCat === c.value ? 'var(--brand)' : '#fff'}; 
                       color:${activeCat === c.value ? '#fff' : 'var(--ink)'}; 
                       font-weight:bold; box-shadow:${activeCat === c.value ? '0 3px 8px rgba(15,118,110,0.2)' : 'none'};">
          ${c.label}
        </button>
      `).join("")}
    </div>
  `;

  const filteredCampaigns = list.filter(c => {
    if (activeCat === "all") return true;
    return c.category === activeCat;
  });

  return shell(`<div class="site" style="--p:${o.primaryColor};--a:${o.accentColor}">
    ${siteHeader(o)}
    <main>
      <section class="site-hero">
        <div class="slider" style="position:relative;">
          ${featured.map((c, i) => `
            <article class="slide ${i === currentSlide ? "on" : ""}" style="background: url('${c.visual}') center/cover no-repeat; display:${i === currentSlide ? 'flex' : 'none'};">
              <div class="slide-content-glass">
                <span class="slide-category">${esc(labels[c.category] || c.category)}</span>
                <h1>${esc(c.title)}</h1>
                <p>${esc(c.summary)}</p>
                <a href="#/demo/${o.slug}/bagis/${c.slug}" class="slide-btn">Hemen Bağış Yap <span>➔</span></a>
              </div>
            </article>
          `).join("")}
        </div>
        ${sliderDots}
        ${quickDonate(o, list)}
      </section>
      
      <section class="section">
        <h2>Bağış Kalemleri</h2>
        ${categoryTabs}
        <div class="cards three">
          ${activeCat === "yetim"
            ? (state.data.orphans || []).filter(ch => ch.organizationId === o.id).map(ch => orphanCard(o, ch)).join("")
            : filteredCampaigns.map((c) => campaignCard(o, c)).join("")
          }
        </div>
      </section>
      
      <section class="section alt" style="background:#f8fafc; border-top:1px solid var(--line); border-bottom:1px solid var(--line);">
        <h2 style="text-align:center; margin-bottom:8px;">🌍 Küresel Faaliyet Haritamız</h2>
        <p style="text-align:center; color:var(--muted); max-width:600px; margin:0 auto 28px; font-size:14px; font-family:sans-serif;">Yardım eli uzattığımız bölgeleri harita üzerinden inceleyin. İlgili ülkeye tıklayarak operasyonel faaliyet verilerimizi ve canlı etkimizi görün.</p>
        <div class="split" style="gap:28px; align-items:center;">
          ${renderWorldMap()}
          ${renderImpactPanel(o)}
        </div>
      </section>
      
      <section class="section alt" style="padding-top:40px; padding-bottom:40px;">
        <div class="split">
          ${renderZekatCalculator(o)}
          ${renderFaqAccordion()}
        </div>
      </section>
      
      <section class="section" style="border-top:1px solid var(--line); padding-top:40px; padding-bottom:40px;">
        <h2 style="text-align:center; margin-bottom:8px;">📊 Finansal Şeffaflık Akışı</h2>
        <p style="text-align:center; color:var(--muted); max-width:600px; margin:0 auto 28px; font-size:14px; font-family:sans-serif;">Yapılan her bağışın nereye harcandığını şeffaf bir şekilde takip edebilirsiniz. Her 100 TL bağışınızın operasyonel dağılımı aşağıdaki gibidir.</p>
        ${renderTransparencyChart(o)}
      </section>
      
      <section class="impact">
        ${mini("Toplam bağış", money(list.reduce((s, c) => s + c.collected, 0)))}
        ${mini("Bağış kaydı", donations(o.slug).length)}
        ${mini("Kurban operasyonu", animals(o.slug).length)}
        ${mini("Atanmış hisse", shares(o.slug).length)}
      </section>
    </main>
    ${siteFooter(o)}
  </div>`);
}

function siteHeader(o) {
  return `
    <div class="site-topbar" style="display:flex; justify-content:space-between; align-items:center; padding: 6px clamp(18px, 5vw, 72px); background:#0f172a; color:#cbd5e1; font-size:11px; font-weight:600; width:100%; box-sizing:border-box;">
      <div>İnsani Yardım Portalı</div>
      <div style="display:flex; gap:16px; align-items:center;">
        <button type="button" data-action="toggleDarkMode" style="background:transparent; border:0; color:#cbd5e1; cursor:pointer; font-size:11px; font-weight:600; display:inline-flex; align-items:center; gap:4px; padding:0; font-family:sans-serif;">
          ${state.darkMode ? "☀️ Aydınlık Mod" : "🌙 Karanlık Mod"}
        </button>
        <span>|</span>
        <a href="#/bagisci" style="color:#cbd5e1; text-decoration:none; display:flex; align-items:center; gap:4px;">👤 Bağışçı Paneli</a>
        <span>|</span>
        <span style="cursor:pointer;">🌐 TR</span>
      </div>
    </div>
    <header class="site-head" style="box-shadow: 0 4px 20px rgba(0,0,0,0.03); width:100%;">
      <a class="brand" href="#/demo/${o.slug}">
        <span style="background:var(--p);">${esc(o.name[0])}</span>
        <b>${esc(o.name)}</b>
      </a>
      <nav style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
        <a href="#/demo/${o.slug}" class="nav-item">Ana Sayfa</a>
        <a href="#/demo/${o.slug}/bagis/kurban" class="nav-item">Kurban Hissesi</a>
        <a href="#/demo/${o.slug}/bagis/zekat" class="nav-item">Zekat</a>
        <a href="#/demo/${o.slug}/bagis/acil-yardim" class="nav-item">Acil Yardım</a>
        <a href="#/demo/${o.slug}/hakkimizda" class="nav-item">Hakkımızda</a>
        <a href="#/demo/${o.slug}/iletisim" class="nav-item">İletişim</a>
      </nav>
      <a class="primary" href="#/demo/${o.slug}/bagis/acil-yardim" style="background:var(--p); color:#fff; box-shadow: 0 4px 12px rgba(0,0,0,0.08); font-size:13px; min-height:36px; display:inline-flex; align-items:center; justify-content:center; padding: 0 16px; border-radius:var(--r); font-weight:bold;">Bağış Yap</a>
    </header>
  `;
}
function creditCardFields(o) {
  const brandColor = o ? o.primaryColor : "#0d9488";
  const accentColor = o ? o.accentColor : "#38bdf8";
  return `
    <div class="card-inputs">
      <div class="card-container">
        <div class="credit-card-sim" id="card-simulator">
          <!-- Front -->
          <div class="card-front" style="background: linear-gradient(135deg, ${brandColor}, ${accentColor});">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div class="card-chip"></div>
              <div style="font-weight:bold; font-size:12px; text-shadow:0 1px 2px rgba(0,0,0,0.3); font-family:sans-serif;">GÜVENLİ ÖDEME</div>
            </div>
            <div class="card-number-sim" id="sim-number">•••• •••• •••• ••••</div>
            <div class="card-info-sim">
              <div>
                <div class="card-label-sim">KART SAHİBİ</div>
                <div id="sim-name">AD SOYAD</div>
              </div>
              <div style="text-align:right;">
                <div class="card-label-sim">GEÇERLİLİK</div>
                <div id="sim-expiry">AA/YY</div>
              </div>
            </div>
          </div>
          <!-- Back -->
          <div class="card-back">
            <div class="card-black-line"></div>
            <div style="padding:0 24px;">
              <div class="card-label-sim" style="text-align:right; margin-top:15px; margin-right:20px;">CVC / GÜVENLİK KODU</div>
              <div class="card-cvc-sim" id="sim-cvc">•••</div>
            </div>
          </div>
        </div>
      </div>
      
      <h3>Ödeme Bilgileri (Kredi Kartı)</h3>
      <input name="ccName" placeholder="Kart Sahibi Ad Soyad" required>
      <input name="ccNumber" placeholder="Kart Numarası" maxlength="19" required data-mask="cc">
      <div class="row-inputs" style="display:flex; gap:8px;">
        <input name="ccExpiry" placeholder="AA/YY" maxlength="5" required style="width: 50%;" data-mask="expiry">
        <input name="ccCvc" placeholder="CVC" maxlength="4" required style="width: 50%;" data-mask="cvc">
      </div>
    </div>
  `;
}
function bankTransferFields(o) {
  state.bankMatchCode = state.bankMatchCode || ("E-" + Math.floor(100000 + Math.random() * 900000));
  return `
    <div class="bank-inputs">
      <div class="iban-card">
        <div style="text-align:center; font-weight:bold; font-size:12px; color:var(--ink); margin-bottom:8px;">🏦 DERNEK HESAP BİLGİLERİ</div>
        <div class="iban-row">
          <span>Hesap Sahibi:</span>
          <strong style="color:var(--ink);">${esc(o.name)}</strong>
        </div>
        <div class="iban-row">
          <span>Banka:</span>
          <strong style="color:var(--ink);">Ziraat Katılım Bankası</strong>
        </div>
        <div class="iban-row">
          <span>IBAN:</span>
          <span class="iban-val" id="iban-val-text">${esc(o.iban)}</span>
        </div>
        <button type="button" class="iban-copy-btn" data-action="copyIban" style="width:100%; margin-top:4px;">IBAN Kopyala</button>
        
        <div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:var(--r); padding:10px; font-size:11.5px; color:#b45309; line-height:1.4; margin-top:8px;">
          <strong>⚠️ ÖNEMLİ EŞLEŞTİRME KODU:</strong> 
          Havale açıklama kısmına aşağıdaki kodu yazmanız durumunda bağışınız sistemimiz tarafından otomatik olarak bu kampanya ile eşleştirilip onaylanacaktır:
          <div style="text-align:center; font-family:monospace; font-size:14px; font-weight:bold; margin-top:6px; background:#fff; padding:4px; border:1px solid #fcd34d; border-radius:4px; user-select:all; color:#78350f;">
            ${state.bankMatchCode}
          </div>
        </div>
      </div>
    </div>
  `;
}

function quickDonate(o, list) {
  const isMonthly = state.quickRecurring || false;
  return `
    <aside class="quick" id="quick-donate-container" style="scroll-margin-top: 100px;">
      <h2>Hızlı Bağış</h2>
      <form data-form="donation">
        <input type="hidden" name="orgSlug" value="${o.slug}">
        <input type="hidden" name="paymentMethod" value="card">
        <input type="hidden" name="recurring" value="${isMonthly ? 'true' : 'false'}">
        
        <div class="segmented-control" style="display:flex; background:var(--soft); border:1px solid var(--line); border-radius:var(--r); padding:3px; margin-bottom:12px;">
          <button type="button" data-action="toggleQuickRecurring" data-value="false" 
                  style="flex:1; border:0; min-height:30px; font-size:12px; font-weight:bold; border-radius:calc(var(--r) - 2px); transition:all 0.2s;
                         background:${!isMonthly ? 'var(--brand)' : 'transparent'}; 
                         color:${!isMonthly ? '#fff' : 'var(--muted)'};">
            Tek Seferlik
          </button>
          <button type="button" data-action="toggleQuickRecurring" data-value="true"
                  style="flex:1; border:0; min-height:30px; font-size:12px; font-weight:bold; border-radius:calc(var(--r) - 2px); transition:all 0.2s;
                         background:${isMonthly ? 'var(--brand)' : 'transparent'}; 
                         color:${isMonthly ? '#fff' : 'var(--muted)'};">
            Aylık Düzenli
          </button>
        </div>
        
        <select name="campaignSlug">
          ${list.map((c) => `<option value="${c.slug}">${esc(c.title)}</option>`).join("")}
        </select>
        
        <div class="amounts">
          <button type="button" data-fill="500">500₺</button>
          <button type="button" data-fill="1000">1.000₺</button>
          <button type="button" data-fill="2500">2.500₺</button>
        </div>
        
        <input name="amount" placeholder="Tutar" required>
        <input name="fullName" placeholder="Ad soyad" required>
        <input name="phone" placeholder="Telefon" required>
        
        ${creditCardFields(o)}
        
        <label style="display:flex; align-items:center; gap:6px; margin-top:8px;">
          <input type="checkbox" name="kvkk" required> KVKK metnini kabul ediyorum.
        </label>
        <button class="primary" style="margin-top:10px;">Bağışı Tamamla</button>
      </form>
    </aside>
  `;
}

function campaignCard(o, c) { const p = pct(c.collected, c.target); return `<article class="campaign"><div class="visual" style="background: url('${c.visual}') center/cover no-repeat"><span>${esc(labels[c.category] || c.category)}</span></div><h3>${esc(c.title)}</h3><p>${esc(c.summary)}</p><div class="bar"><i style="width:${p}%"></i></div><div class="row"><span>${money(c.collected)}</span><span>%${p}</span></div><a href="#/demo/${o.slug}/bagis/${c.slug}">Bağış yap</a></article>`; }
function siteFooter(o) {
  return `
    <footer class="site-foot" style="background:#0f172a; color:#94a3b8; padding:60px clamp(18px, 5vw, 72px) 30px; border-top:1px solid #1e293b; font-family:sans-serif; margin-top:60px; box-sizing:border-box;">
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:40px; margin-bottom:40px; box-sizing:border-box; width:100%;">
        <!-- Column 1: Brand -->
        <div>
          <h3 style="color:#fff; margin-top:0; margin-bottom:16px; font-size:1.3rem; display:flex; align-items:center; gap:8px;">
            <span style="background:var(--p); color:#fff; width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center; border-radius:8px; font-weight:bold;">${esc(o.name[0])}</span>
            ${esc(o.name)}
          </h3>
          <p style="font-size:12px; line-height:1.6; margin-bottom:20px; color:#64748b; font-family:sans-serif;">${esc(o.description || 'Küresel insani yardım projeleriyle yeryüzünde iyiliği yaymaya adanmış sivil toplum kuruluşu.')}</p>
          <div style="display:flex; gap:12px;">
            <span style="width:32px; height:32px; border-radius:50%; background:#1e293b; display:flex; align-items:center; justify-content:center; color:#fff; font-size:13px; cursor:pointer;" title="Facebook">🌐</span>
            <span style="width:32px; height:32px; border-radius:50%; background:#1e293b; display:flex; align-items:center; justify-content:center; color:#fff; font-size:13px; cursor:pointer;" title="X (Twitter)">✖️</span>
            <span style="width:32px; height:32px; border-radius:50%; background:#1e293b; display:flex; align-items:center; justify-content:center; color:#fff; font-size:13px; cursor:pointer;" title="Instagram">📸</span>
            <span style="width:32px; height:32px; border-radius:50%; background:#1e293b; display:flex; align-items:center; justify-content:center; color:#fff; font-size:13px; cursor:pointer;" title="YouTube">🎥</span>
          </div>
        </div>
        
        <!-- Column 2: Kurumsal -->
        <div>
          <h4 style="color:#fff; font-size:14px; margin-top:0; margin-bottom:18px; text-transform:uppercase; letter-spacing:0.5px;">Kurumsal</h4>
          <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; font-size:12.5px;">
            <li><a href="#/demo/${o.slug}" style="color:#94a3b8; text-decoration:none;">Ana Sayfa</a></li>
            <li><a href="#/demo/${o.slug}/hakkimizda" style="color:#94a3b8; text-decoration:none;">Hakkımızda</a></li>
            <li><a href="#/demo/${o.slug}/iletisim" style="color:#94a3b8; text-decoration:none;">İletişim</a></li>
            <li><a href="#/demo/${o.slug}" style="color:#94a3b8; text-decoration:none;">Yönetim Kurulu</a></li>
            <li><a href="#/demo/${o.slug}" style="color:#94a3b8; text-decoration:none;">Denetim Raporları</a></li>
          </ul>
        </div>
        
        <!-- Column 3: Kampanyalar -->
        <div>
          <h4 style="color:#fff; font-size:14px; margin-top:0; margin-bottom:18px; text-transform:uppercase; letter-spacing:0.5px;">Faaliyetler</h4>
          <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; font-size:12.5px;">
            <li><a href="#/demo/${o.slug}/bagis/acil-yardim" style="color:#94a3b8; text-decoration:none;">Acil Yardım</a></li>
            <li><a href="#/demo/${o.slug}/bagis/kurban" style="color:#94a3b8; text-decoration:none;">Kurban Hissesi</a></li>
            <li><a href="#/demo/${o.slug}/bagis/zekat" style="color:#94a3b8; text-decoration:none;">Zekat & Sadaka</a></li>
            <li><a href="#/demo/${o.slug}" style="color:#94a3b8; text-decoration:none;">Su Kuyuları</a></li>
            <li><a href="#/demo/${o.slug}" style="color:#94a3b8; text-decoration:none;">Yetim Destekleri</a></li>
          </ul>
        </div>
        
        <!-- Column 4: Güvenlik ve IBAN -->
        <div>
          <h4 style="color:#fff; font-size:14px; margin-top:0; margin-bottom:18px; text-transform:uppercase; letter-spacing:0.5px;">Resmi Hesaplarımız</h4>
          <div style="font-size:12px; margin-bottom:14px;">
            <strong style="color:#cbd5e1; display:block; margin-bottom:4px;">Ziraat Katılım IBAN:</strong>
            <span style="font-family:monospace; background:#1e293b; padding:4px 6px; border-radius:4px; display:inline-block; color:#fff; font-size:11px; user-select:all;">${esc(o.iban)}</span>
          </div>
          <div style="font-size:12px; margin-bottom:18px;">
            <strong style="color:#cbd5e1; display:block; margin-bottom:4px;">Destek Hattı:</strong>
            <span style="color:#cbd5e1;">${esc(o.phone)}</span>
          </div>
          <!-- Security Badges Mock -->
          <div style="display:flex; align-items:center; gap:8px; opacity:0.65; flex-wrap:wrap;">
            <span style="border:1px solid #334155; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:bold; color:#fff;">SSL SECURE</span>
            <span style="border:1px solid #334155; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:bold; color:#fff;">3D SECURE</span>
            <span style="border:1px solid #334155; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:bold; color:#fff;">VISA / MC</span>
          </div>
        </div>
      </div>
      
      <!-- Bottom Bar -->
      <div style="border-top:1px solid #1e293b; padding-top:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; font-size:11.5px; color:#64748b;">
        <div>© 2026 ${esc(o.name)}. Tüm Hakları Saklıdır.</div>
        <div style="display:flex; gap:16px;">
          <a href="#/demo/${o.slug}" style="color:#64748b; text-decoration:none;">KVKK Politikası</a>
          <a href="#/demo/${o.slug}" style="color:#64748b; text-decoration:none;">Kullanım Koşulları</a>
          <a href="#/demo/${o.slug}" style="color:#64748b; text-decoration:none;">Bağışçı Hakları</a>
        </div>
      </div>
    </footer>
  `;
}

function donationPage(o, c) {
  const isMonthly = state.checkoutRecurring || false;
  const isKurban = c.category === "kurban" || c.slug === "kurban";
  const isUrgent = c.category === "acil" || c.category === "gazze";
  
  const selectedMethod = state.selectedPaymentMethod || "card";
  const methodTabsHtml = `
    <div class="segmented-control" style="display:flex; background:var(--soft); border:1px solid var(--line); border-radius:var(--r); padding:3px; margin-bottom:16px;">
      <button type="button" data-action="setPaymentMethod" data-value="card" 
              style="flex:1; border:0; min-height:32px; font-size:12px; font-weight:bold; border-radius:calc(var(--r) - 2px); transition:all 0.2s;
                     background:${selectedMethod === 'card' ? 'var(--p)' : 'transparent'}; 
                     color:${selectedMethod === 'card' ? '#fff' : 'var(--muted)'};">
        💳 Kredi Kartı
      </button>
      <button type="button" data-action="setPaymentMethod" data-value="bank"
              style="flex:1; border:0; min-height:32px; font-size:12px; font-weight:bold; border-radius:calc(var(--r) - 2px); transition:all 0.2s;
                     background:${selectedMethod === 'bank' ? 'var(--p)' : 'transparent'}; 
                     color:${selectedMethod === 'bank' ? '#fff' : 'var(--muted)'};">
        🏦 Banka Transferi (EFT)
      </button>
    </div>
  `;
  
  const gebisHtml = `
    <div style="border-top:1px dashed var(--line); margin-top:12px; padding-top:12px; margin-bottom:12px;">
      <label style="display:flex; align-items:center; gap:8px; font-weight:bold; color:var(--ink); font-size:12px; cursor:pointer; user-select:none;">
        <input type="checkbox" id="gebis-tax-cb" name="gebisAccept" style="width:auto; margin:0;" ${state.wantsGebis ? "checked" : ""}>
        ⚖️ e-Devlet (GEBİS) Bildirimi Yapılsın
      </label>
      <div id="gebis-fields-container" style="display:${state.wantsGebis ? "flex" : "none"}; flex-direction:column; gap:8px; margin-top:8px;">
        <input name="taxId" placeholder="T.C. Kimlik veya Vergi No" style="font-size:12px; padding:6px 10px;">
      </div>
    </div>
  `;
  
  const faqs = {
    kurban: [
      { q: "Kurban vekaletimi nasıl takip edebilirim?", a: "Bağışınız onaylandıktan sonra sıraya alınır. Kesim yapıldığında SMS ile tarafınıza video izleme bağlantısı iletilir." },
      { q: "Kurbanım ne zaman kesilir?", a: "Kurban Bayramı'nın ilk 3 günü içinde İslami usullere uygun olarak kesimler gerçekleştirilir." },
      { q: "Hisse ataması nasıl yapılır?", a: "Büyükbaş kurban hisseleri 7 kişilik gruplar halinde sistem tarafından otomatik veya admin tarafından manuel olarak eşleştirilir." }
    ],
    zekat: [
      { q: "Zekat kimlere verilir?", a: "Zekat yardımları fıkha uygun olarak sadece temel ihtiyaçlarını karşılayamayan yoksul ailelere, yetimlere ve ilim talebelerine ulaştırılır." },
      { q: "Zekat hesaplamasını nasıl yaparım?", a: "Ana sayfamızdaki Zekat Hesaplama robotunu kullanarak nakit, altın ve döviz birikimlerinizi girip zekat miktarınızı tam olarak hesaplayabilirsiniz." }
    ],
    "su-kuyusu": [
      { q: "Su kuyusunun açılışı ne kadar sürer?", a: "Zemin etüdü, sondaj ve inşaat çalışmaları bölgenin şartlarına göre ortalama 3 ila 6 ay arasında tamamlanmaktadır." },
      { q: "Kuyu açıldığında bana rapor iletiliyor mu?", a: "Evet, su kuyusu tamamlandığında açılış videosu, koordinat bilgileri ve tabela fotoğrafları içeren detaylı bir rapor tarafınıza gönderilir." }
    ],
    default: [
      { q: "Bağış makbuzuma nasıl ulaşırım?", a: "Bağışınız tamamlandığı anda sistem tarafından SMS/E-posta ile makbuz linkiniz gönderilir. Ayrıca e-Devlet bildirimini seçtiyseniz GEBİS'e işlenir." },
      { q: "Bağışlar ne kadar sürede yerine ulaştırılır?", a: "Acil yardımlar anında sahaya sevk edilir. Diğer projeler ise periyodik olarak operasyon takvimine göre tamamlanır." }
    ]
  };
  const listFaq = faqs[c.category] || faqs.default;
  const faqHtml = `
    <div class="faq-sec">
      <h3 style="font-size:16px; font-weight:bold; color:var(--ink); margin-bottom:16px;">Sıkça Sorulan Sorular</h3>
      ${listFaq.map((f) => `
        <div class="faq-item">
          <div class="faq-title">
            <span>${esc(f.q)}</span>
            <span class="faq-icon" style="font-size:10px;">▼</span>
          </div>
          <div class="faq-content" style="display:none;">${esc(f.a)}</div>
        </div>
      `).join("")}
    </div>
  `;
  
  let asideHtml = "";
  if (isKurban) {
    asideHtml = `
      <aside class="quick">
        <h2>Kurban Vekalet ve Bağış Formu</h2>
        <form data-form="donation">
          <input type="hidden" name="orgSlug" value="${o.slug}">
          <input type="hidden" name="campaignSlug" value="${c.slug}">
          <input type="hidden" name="paymentMethod" value="${selectedMethod}">
          <input type="hidden" name="recurring" value="false">
          <input type="hidden" name="amount" value="4500">
          
          ${methodTabsHtml}
          
          <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:16px;">
            <div>
              <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Kurban Türü</label>
              <select name="intentionType" required style="padding: 8px 10px; font-size: 13px; border-radius:var(--r); border:1px solid var(--line); width:100%;">
                <option value="vacip">Vacip Kurbanı</option>
                <option value="adak">Adak Kurbanı</option>
                <option value="akika">Akika Kurbanı</option>
                <option value="sukur">Şükür Kurbanı</option>
                <option value="yetim">Yetim Kurbanı</option>
              </select>
            </div>
            <div>
              <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Kesim Bölgesi</label>
              <select id="kurban-region-select" name="kurbanRegion" required style="padding: 8px 10px; font-size: 13px; border-radius:var(--r); border:1px solid var(--line); width:100%;">
                <option value="afrika" data-price="4500">Yurt Dışı (Afrika/Asya) - 4,500 TL</option>
                <option value="turkiye" data-price="12500">Yurt İçi (Türkiye) - 12,500 TL</option>
                <option value="gaza" data-price="24500">Filistin (Gazze) - 24,500 TL</option>
              </select>
            </div>
            <div>
              <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Hisse Adedi</label>
              <select id="kurban-shares-select" name="kurbanShares" required style="padding: 8px 10px; font-size: 13px; border-radius:var(--r); border:1px solid var(--line); width:100%;">
                ${[1, 2, 3, 4, 5, 6, 7].map(n => `<option value="${n}">${n} Hisse</option>`).join("")}
              </select>
            </div>
            <div>
              <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Kurban Vekalet Sahibi İsim(ler)i</label>
              <input name="dedicatee" placeholder="Kurban vekaleti verilecek isimler" required style="padding: 8px 10px; font-size: 13px; border-radius:var(--r); border:1px solid var(--line); width:100%;">
            </div>
            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:var(--r); padding:10px 14px; text-align:center;">
              <span style="font-size:10px; font-weight:bold; color:#166534; text-transform:uppercase; display:block;">Toplam Tutar</span>
              <b id="kurban-total-display" style="font-size:1.35rem; color:#14532d; font-family:sans-serif;">4,500 TL</b>
            </div>
            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:var(--r); padding:10px 14px;">
              <label style="display:flex; align-items:center; gap:8px; font-size:11.5px; color:#1e40af; cursor:pointer; font-weight:bold; user-select:none; margin:0;">
                <input type="checkbox" name="vekaletAccept" required style="width:auto; margin:0;">
                🤝 Kurban vekaletini vermeyi kabul ediyorum.
              </label>
            </div>
          </div>
          
          <input name="fullName" placeholder="Adınız Soyadınız" required style="margin-bottom:8px;">
          <input name="phone" placeholder="Telefon Numaranız" required style="margin-bottom:8px;">
          <input name="email" type="email" placeholder="E-Posta Adresiniz" style="margin-bottom:8px;">
          <textarea name="note" placeholder="Ek Not (İsteğe bağlı)" style="margin-bottom:12px; font-family:sans-serif;"></textarea>
          
          ${gebisHtml}
          
          ${selectedMethod === 'card' ? creditCardFields(o) : bankTransferFields(o)}
          
          <label style="display:flex; align-items:center; gap:6px; margin-top:12px;">
            <input type="checkbox" name="kvkk" required> KVKK metnini kabul ediyorum.
          </label>
          <button class="primary" style="margin-top:10px;">Vekalet Ver ve Bağışı Tamamla</button>
        </form>
      </aside>
    `;
  } else {
    asideHtml = `
      <aside class="quick">
        <h2>Bağış Bilgileri</h2>
        <form data-form="donation">
          <input type="hidden" name="orgSlug" value="${o.slug}">
          <input type="hidden" name="campaignSlug" value="${c.slug}">
          <input type="hidden" name="paymentMethod" value="${selectedMethod}">
          <input type="hidden" name="recurring" value="${isMonthly ? 'true' : 'false'}">
          
          ${methodTabsHtml}
          
          <div class="segmented-control" style="display:flex; background:var(--soft); border:1px solid var(--line); border-radius:var(--r); padding:3px; margin-bottom:12px;">
            <button type="button" data-action="toggleCheckoutRecurring" data-value="false" 
                    style="flex:1; border:0; min-height:30px; font-size:12px; font-weight:bold; border-radius:calc(var(--r) - 2px); transition:all 0.2s;
                           background:${!isMonthly ? 'var(--p)' : 'transparent'}; 
                           color:${!isMonthly ? '#fff' : 'var(--muted)'};">
              Tek Seferlik
            </button>
            <button type="button" data-action="toggleCheckoutRecurring" data-value="true"
                    style="flex:1; border:0; min-height:30px; font-size:12px; font-weight:bold; border-radius:calc(var(--r) - 2px); transition:all 0.2s;
                           background:${isMonthly ? 'var(--p)' : 'transparent'}; 
                           color:${isMonthly ? '#fff' : 'var(--muted)'};">
              Aylık Düzenli
            </button>
          </div>
          
          <div class="amounts">
            ${(c.suggestedAmounts || [250, 500]).map((a) => `<button type="button" data-fill="${a}">${money(a)}</button>`).join("")}
          </div>
          
          <input name="amount" placeholder="Tutar" required>
          <input name="fullName" placeholder="Ad soyad" required>
          <input name="phone" placeholder="Telefon" required>
          <input name="email" type="email" placeholder="E-posta">
          <input name="dedicatee" placeholder="Adına bağış yapılacak kişi">
          <textarea name="note" placeholder="Not"></textarea>
          
          <div style="border-top:1px dashed var(--line); margin-top:12px; padding-top:12px; margin-bottom:12px;">
            <label style="display:flex; align-items:center; gap:8px; font-weight:bold; color:var(--ink); font-size:12px; cursor:pointer; user-select:none;">
              <input type="checkbox" id="wants-certificate-cb" style="width:auto; margin:0;">
              🎁 Hediye Bağış Sertifikası Oluştur
            </label>
            <div id="certificate-fields-container" style="display:none; flex-direction:column; gap:8px; margin-top:8px;">
              <input name="certificateRecipient" placeholder="Sertifikanın Gönderileceği Kişi (Ad Soyad)" style="font-size:12px; padding:6px 10px;">
              <textarea name="certificateMessage" placeholder="Sertifika Hediye / Tebrik Mesajınız" style="font-size:12px; padding:6px 10px; height:60px;"></textarea>
            </div>
          </div>
          
          ${gebisHtml}
          
          ${selectedMethod === 'card' ? creditCardFields(o) : bankTransferFields(o)}
          
          <label style="display:flex; align-items:center; gap:6px; margin-top:12px;">
            <input type="checkbox" name="kvkk" required> KVKK ve bağış şartlarını kabul ediyorum.
          </label>
          <button class="primary" style="margin-top:10px;">Bağışı tamamla</button>
        </form>
      </aside>
    `;
  }

  return shell(`<div class="site" style="--p:${o.primaryColor};--a:${o.accentColor}">${siteHeader(o)}<main class="checkout">
    <section>
      <div class="visual big" style="background: url('${c.visual}') center/cover no-repeat"></div>
      <p class="eyebrow">${esc(labels[c.category] || c.category)}</p>
      <h1>${esc(c.title)}</h1>
      <p>${esc(c.story)}</p>
      ${isUrgent ? `
        <div class="bar"><i style="width:${pct(c.collected, c.target)}%"></i></div>
        <div class="row">
          <span>${money(c.collected)} toplandı</span>
          <span>Hedef ${money(c.target)}</span>
        </div>
      ` : ""}
      
      ${faqHtml}
    </section>
    ${asideHtml}
  </main>${siteFooter(o)}</div>`);
}

function admin() {
  const o = org();
  return shell(`<div class="admin"><aside><a class="brand" href="#/"><span>E</span><b>E-İnfak</b></a><select data-org>${orgs().map((x) => `<option value="${x.slug}" ${x.slug === o.slug ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select><nav>${["dashboard:Kontrol", "donations:Bağışlar", "donors:Bağışçılar", "campaigns:Kampanyalar", "kurban:Kurban Operasyon", "bank:Banka", "messages:SMS/Mail", "reports:Raporlar", "settings:Kurulum"].map((x) => { const [id, label] = x.split(":"); return `<button class="${state.adminTab === id ? "on" : ""}" data-tab="${id}">${label}</button>`; }).join("")}</nav></aside><main><header class="admin-top"><div><p>Admin otomasyon</p><h1>${esc(o.name)}</h1></div><div><a class="ghost" href="#/demo/${o.slug}">Siteyi gör</a><a class="primary" href="/api/export/donations">CSV indir</a></div></header>${adminTab(o)}</main></div>`);
}
function renderLineChart(slug) {
  const dList = donations(slug);
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleString("tr-TR", { month: "short" }),
      yearMonth: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      total: 0
    });
  }
  
  dList.forEach(d => {
    if (!d.createdAt) return;
    const yMonth = d.createdAt.substring(0, 7);
    const monthObj = months.find(m => m.yearMonth === yMonth);
    if (monthObj) monthObj.total += Number(d.amount);
  });
  
  const maxTotal = Math.max(...months.map(m => m.total), 1000);
  const width = 380;
  const height = 140;
  const paddingLeft = 45;
  const paddingRight = 10;
  const paddingTop = 15;
  const paddingBottom = 20;
  
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  
  const points = months.map((m, idx) => {
    const x = paddingLeft + (idx * (chartWidth / (months.length - 1)));
    const y = paddingTop + chartHeight - ((m.total / maxTotal) * chartHeight);
    return { x, y, total: m.total, label: m.label };
  });
  
  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(" ");
  const areaPoints = `${points[0].x},${paddingTop + chartHeight} ` + polylinePoints + ` ${points[points.length-1].x},${paddingTop + chartHeight}`;
  
  const gridLines = [];
  for (let i = 0; i <= 3; i++) {
    const y = paddingTop + (i * (chartHeight / 3));
    const val = money((maxTotal - (i * (maxTotal / 3))));
    gridLines.push(`
      <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="var(--line)" stroke-dasharray="3 3" />
      <text x="${paddingLeft - 8}" y="${y + 3}" font-size="8" fill="var(--muted)" text-anchor="end">${val}</text>
    `);
  }
  
  const xLabels = points.map(p => `
    <text x="${p.x}" y="${height - 4}" font-size="8" fill="var(--muted)" text-anchor="middle">${p.label}</text>
    <circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--brand)" stroke="#fff" stroke-width="1" />
  `).join("");
  
  return `
    <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow:visible;">
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--brand)" stop-opacity="0.2"></stop>
          <stop offset="100%" stop-color="var(--brand)" stop-opacity="0.0"></stop>
        </linearGradient>
      </defs>
      ${gridLines.join("")}
      <polygon points="${areaPoints}" fill="url(#chartGrad)"></polygon>
      <polyline points="${polylinePoints}" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${xLabels}
    </svg>
  `;
}

function renderDonutChart(slug) {
  const dList = donations(slug);
  const categories = {};
  let totalAll = 0;
  
  dList.forEach(d => {
    const c = campaignById(d.campaignId);
    const cat = c ? (labels[c.category] || c.category) : "Diğer";
    categories[cat] = (categories[cat] || 0) + Number(d.amount);
    totalAll += Number(d.amount);
  });
  
  if (totalAll === 0) return `<div class="empty">Yeterli veri yok</div>`;
  
  const colors = ["#0f766e", "#f59e0b", "#1d4ed8", "#b91c1c", "#7c2d12", "#4f46e5", "#047857"];
  const list = Object.entries(categories).map(([name, amount], idx) => ({
    name,
    amount,
    pct: Math.round((amount / totalAll) * 100),
    color: colors[idx % colors.length]
  })).sort((a, b) => b.amount - a.amount);
  
  const r = 40;
  const perimeter = 2 * Math.PI * r;
  let currentOffset = 0;
  
  const circles = list.map(item => {
    const dashLength = (item.amount / totalAll) * perimeter;
    const spaceLength = perimeter - dashLength;
    const offset = currentOffset;
    currentOffset -= dashLength;
    return `
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="${item.color}" stroke-width="10" 
              stroke-dasharray="${dashLength} ${spaceLength}" stroke-dashoffset="${offset}"
              transform="rotate(-90 60 60)" />
    `;
  }).join("");
  
  const legend = list.map(item => `
    <div style="display:flex; align-items:center; gap:8px; font-size:11px; margin-bottom:4px;">
      <span style="width:8px; height:8px; border-radius:50%; background:${item.color}; flex-shrink:0;"></span>
      <span style="font-weight:bold; color:var(--ink);">${item.pct}%</span>
      <span style="color:var(--muted);">${item.name}</span>
    </div>
  `).join("");
  
  return `
    <div style="display:flex; align-items:center; gap:20px; flex-wrap:wrap;">
      <svg width="110" height="110" viewBox="0 0 120 120" style="flex-shrink:0;">
        <circle cx="60" cy="60" r="${r}" fill="none" stroke="#f1f5f9" stroke-width="10" />
        ${circles}
        <circle cx="60" cy="60" r="28" fill="#fff" />
      </svg>
      <div style="flex:1; min-width:120px;">
        ${legend}
      </div>
    </div>
  `;
}

function renderTimeline(o, donor) {
  const donList = donations(o.slug).filter(d => d.donorId === donor.id);
  const shareList = shares(o.slug).filter(s => s.donorId === donor.id);
  const msgList = (state.data.messageLogs || []).filter(m => m.donorId === donor.id);
  const activities = [];
  
  donList.forEach(d => {
    activities.push({
      date: d.createdAt,
      type: "donation",
      title: `${money(d.amount)} Bağış Yaptı`,
      desc: `${campaignById(d.campaignId)?.title || "Genel"} Kampanyası (Metot: ${statuses[d.paymentMethod] || d.paymentMethod})`,
      receipt: d.receiptNo,
      icon: "💳",
      color: "#0f766e"
    });
  });
  
  shareList.forEach(s => {
    const animal = animals(o.slug).find(a => a.id === s.animalId);
    activities.push({
      date: s.createdAt,
      type: "kurban",
      title: `Kurban Hissesi Atandı`,
      desc: `Hayvan Kodu: ${animal?.code || "-"} (Hisse No: ${s.shareNo}, Niyet: ${s.intentionType})`,
      icon: "🐐",
      color: "#f59e0b"
    });
    if (s.slaughteredAt || s.slaughterDate) {
      activities.push({
        date: s.slaughteredAt || s.createdAt,
        type: "kurban_slaughter",
        title: "Kurban Kesildi",
        desc: `Kurban emanetiniz kesilmiştir. ${s.videoUrl ? `<a href="${s.videoUrl}" target="_blank">Kesim Videosu ↗</a>` : "Video sisteme yüklendi."}`,
        icon: "⚔️",
        color: "#b91c1c"
      });
    }
  });
  
  msgList.forEach(m => {
    activities.push({
      date: m.createdAt,
      type: "message",
      title: `SMS İletildi`,
      desc: m.body,
      icon: "💬",
      color: "#1d4ed8"
    });
  });
  
  activities.sort((a, b) => new Date(b.date) - new Date(a.date));
  const totalDonated = donList.reduce((sum, d) => sum + Number(d.amount), 0);
  
  const timelineHtml = activities.length ? activities.map(act => `
    <div class="timeline-item" style="display:flex; gap:12px; margin-bottom:16px; position:relative;">
      <div style="width:28px; height:28px; border-radius:50%; background:${act.color}15; display:grid; place-items:center; font-size:12px; z-index:2; flex-shrink:0;">
        ${act.icon}
      </div>
      <div style="flex:1; background:var(--soft); padding:10px 12px; border-radius:var(--r); border:1px solid var(--line);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; gap:8px;">
          <strong style="font-size:12px; color:var(--ink);">${act.title}</strong>
          <small style="font-size:9px; color:var(--muted);">${new Date(act.date).toLocaleDateString("tr-TR")}</small>
        </div>
        <p style="margin:0; font-size:11px; color:var(--muted);">${act.desc}</p>
        ${act.receipt ? `<a style="display:inline-block; margin-top:4px; font-size:10px; color:var(--brand); font-weight:bold;" href="/makbuz/${act.receipt}" target="_blank">Makbuzu Gör ↗</a>` : ""}
      </div>
    </div>
  `).join("") : `<div class="empty">Aktivite kaydı bulunamadı</div>`;
  
  return `
    <article class="panel" style="flex:1.2;">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line); padding-bottom:12px; margin-bottom:16px; gap:12px;">
        <div>
          <h2 style="margin:0; font-size:1.4rem;">${esc(donor.fullName)}</h2>
          <span style="font-size:11px; color:var(--muted);">${esc(donor.city || "Şehir Belirtilmemiş")} | E-posta: ${esc(donor.email || "-")}</span>
        </div>
        <button class="ghost" data-action="closeDonor" style="min-height:30px; padding:0 12px; font-size:11px;">Kapat</button>
      </div>
      
      <div class="mini-grid" style="margin-bottom:20px;">
        <div><b>${donList.length}</b><small>Bağış Adedi</small></div>
        <div><b>${money(totalDonated)}</b><small>Toplam Bağış</small></div>
      </div>
      
      <h3 style="font-size:12px; text-transform:uppercase; margin-bottom:12px; letter-spacing:0.05em; color:var(--muted);">Aktivite Zaman Tüneli</h3>
      <div style="position:relative; padding-left:4px;">
        <div style="position:absolute; left:18px; top:12px; bottom:12px; width:2px; background:var(--line); z-index:1;"></div>
        ${timelineHtml}
      </div>
    </article>
  `;
}

function renderBankMatchPanel(o, b) {
  return `
    <div style="background:var(--soft); border:1px solid var(--line); border-radius:var(--r); padding:16px; margin: 10px 0; max-width: 600px;">
      <h3 style="margin-top:0; font-size:13px; color:var(--brand); text-transform:uppercase;">Banka Hareketi Eşleştirme</h3>
      <p style="font-size:12px; color:var(--muted); margin-bottom:12px; line-height:1.5;">
        Gönderen: <b>${esc(b.senderName)}</b> | Tutar: <b>${money(b.amount)}</b> <br>
        Açıklama: <i>${esc(b.description)}</i>
      </p>
      <form class="form" data-form="bankMatch" style="gap:10px;">
        <input type="hidden" name="bankMovementId" value="${b.id}">
        <input type="hidden" name="orgSlug" value="${o.slug}">
        
        <div>
          <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">1. Bağışçı Seçin</label>
          <select name="donorId" required style="padding: 8px 10px; font-size: 13px;">
            <option value="">-- Bağışçı Seçin --</option>
            ${donors(o.slug).map(d => `<option value="${d.id}">${esc(d.fullName)} (${d.phone || d.email || 'İletişim yok'})</option>`).join("")}
          </select>
        </div>
        
        <div>
          <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">2. Eşleşecek Kampanya Seçin</label>
          <select name="campaignId" required style="padding: 8px 10px; font-size: 13px;">
            <option value="">-- Kampanya Seçin --</option>
            ${campaigns(o.slug).map(c => `<option value="${c.id}">${esc(c.title)}</option>`).join("")}
          </select>
        </div>
        
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="primary" style="flex:1; min-height:32px; font-size:12px;">Eşleştirmeyi Tamamla</button>
          <button type="button" class="ghost" data-action="cancelBankMatch" style="flex:1; min-height:32px; font-size:12px;">Vazgeç</button>
        </div>
      </form>
    </div>
  `;
}

function adminTab(o) {
  if (state.adminTab === "donations") return panel("Bağış ve makbuz kayıtları", `
    <div style="display:flex; justify-content:flex-end; margin-bottom:12px;" class="no-print">
      <button onclick="window.print()" class="ghost" style="min-height:32px; padding:0 12px; font-size:11px; font-weight:bold;">🖨️ Listeyi Yazdır</button>
    </div>
    ${table(["Makbuz", "Bağışçı", "Kampanya", "Tutar", "Durum"], donations(o.slug).map((d) => [d.receiptNo, donorById(d.donorId)?.fullName || "-", campaignById(d.campaignId)?.title || "-", money(d.amount), statuses[d.paymentStatus] || d.paymentStatus]))}
  `);
  if (state.adminTab === "donors") {
    const list = donors(o.slug);
    const donorTable = `
      <div class="table">
        <table>
          <thead><tr><th>Ad Soyad</th><th>Telefon</th><th>Şehir</th></tr></thead>
          <tbody>
            ${list.map(d => `
              <tr style="cursor:pointer; transition:background 0.15s; ${state.selectedDonorId === d.id ? 'background:var(--soft); font-weight:bold;' : ''}" data-click-donor="${d.id}">
                <td>${esc(d.fullName)}</td>
                <td>${esc(d.phone || '-')}</td>
                <td>${esc(d.city || '-')}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
    if (state.selectedDonorId) {
      const selectedDonor = list.find(d => d.id === state.selectedDonorId);
      if (selectedDonor) {
        return `<section class="split" style="grid-template-columns: 1fr 1.2fr;">
          ${panel("Bağışçı CRM (Detay görmek için tıklayın)", donorTable)}
          ${renderTimeline(o, selectedDonor)}
        </section>`;
      }
    }
    return panel("Bağışçı CRM (Detay görmek için listeden bir bağışçıya tıklayın)", donorTable);
  }
  if (state.adminTab === "campaigns") return campaignsEditor(o);
  if (state.adminTab === "kurban") return kurban(o);
  if (state.adminTab === "bank") {
    const bList = (state.data.bankMovements || []).filter((b) => b.organizationId === o.id);
    const bankTable = `
      <div class="table">
        <table>
          <thead><tr><th>Banka</th><th>Gönderen</th><th>Tutar</th><th>Açıklama</th><th>Durum</th><th>İşlem</th></tr></thead>
          <tbody>
            ${bList.map(b => `
              <tr style="${state.selectedBankMovementId === b.id ? 'background:var(--soft);' : ''}">
                <td>${esc(b.bankName)}</td>
                <td>${esc(b.senderName)}</td>
                <td>${money(b.amount)}</td>
                <td>${esc(b.description || '-')}</td>
                <td>
                  <span style="font-weight:bold; color:${b.status === 'matched' ? '#047857' : '#e11d48'}">
                    ${statuses[b.status] || b.status}
                  </span>
                </td>
                <td>
                  ${b.status === "unmatched" 
                    ? `<button class="primary" data-action="reconcileBank" data-id="${b.id}" style="min-height:28px; padding:0 10px; font-size:11px;">Eşleştir</button>` 
                    : `<a href="/makbuz/${esc(donations(o.slug).find(d => d.id === b.matchedDonationId)?.receiptNo || '')}" target="_blank" style="font-size:11px; font-weight:bold; color:var(--brand);">Makbuz</a>`
                  }
                </td>
              </tr>
              ${state.selectedBankMovementId === b.id ? `<tr><td colspan="6" style="padding:0;">${renderBankMatchPanel(o, b)}</td></tr>` : ""}
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
    return panel("Banka Hesap Hareketleri Eşleştirme Otomasyonu", bankTable);
  }
  if (state.adminTab === "messages") return messages(o);
  if (state.adminTab === "reports") return panel("Raporlama", `
    <div style="display:flex; justify-content:flex-end; margin-bottom:12px;" class="no-print">
      <button onclick="window.print()" class="ghost" style="min-height:32px; padding:0 12px; font-size:11px; font-weight:bold;">🖨️ Raporu Yazdır / PDF Kaydet</button>
    </div>
    ${table(["Kampanya", "Toplanan", "Hedef", "Durum"], campaigns(o.slug).map((c) => [c.title, money(c.collected), money(c.target), `%${pct(c.collected, c.target)}`]))}
  `);
  if (state.adminTab === "settings") return settings(o);
  
  // Dashboard default view (with line and donut SVG charts)
  const totalDonated = donations(o.slug).reduce((s, d) => s + d.amount, 0);
  const donorCount = donors(o.slug).length;
  const shareCount = shares(o.slug).length;
  const unmatchedBankCount = (state.data.bankMovements || []).filter((b) => b.organizationId === o.id && b.status === "unmatched").length;
  
  return `
    <section class="cards four">
      ${card("Toplam Bağış", money(totalDonated))}
      ${card("Kayıtlı Bağışçı", donorCount)}
      ${card("Kurban Hissesi", shareCount)}
      ${card("Açık Havale", unmatchedBankCount)}
    </section>
    <section class="split" style="margin-top:20px;">
      <article class="panel">
        <h2>Bağış Eğilimi (Son 6 Ay)</h2>
        <p class="muted" style="font-size:11px; margin-top:-10px; margin-bottom:15px;">Aylara göre toplanan toplam bağış miktarı</p>
        ${renderLineChart(o.slug)}
      </article>
      <article class="panel">
        <h2>Kampanya Dağılımı</h2>
        <p class="muted" style="font-size:11px; margin-top:-10px; margin-bottom:15px;">Toplanan bağışların kategorilere dağılımı</p>
        ${renderDonutChart(o.slug)}
      </article>
    </section>
  `;
}
function panel(title, content) { return `<article class="panel"><h2>${esc(title)}</h2>${content}</article>`; }
function table(head, rows) { return rows.length ? `<div class="table"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<div class="empty">Kayıt bulunamadı</div>`; }
function kurban(o) { const sh = shares(o.slug); return `<section class="split"><article class="panel"><h2>Kurban hayvanı oluştur</h2><form class="form" data-form="kurbanAnimal"><input type="hidden" name="orgSlug" value="${o.slug}"><input name="code" placeholder="Kod"><input name="region" placeholder="Bölge" required><input name="country" placeholder="Ülke" required><input name="totalShares" type="number" value="7"><input name="sharePrice" placeholder="Hisse tutarı"><button class="primary">Operasyona ekle</button></form></article><article class="panel"><h2>Hisse atama</h2><p class="muted">Kurban bağışı geldiğinde otomatik hisseye bağlanır.</p><button class="primary" data-action="autoAssign" data-org="${o.slug}">Bekleyenleri ata</button></article></section><div class="cards three">${animals(o.slug).map((a) => animal(o, a, sh.filter((s) => s.animalId === a.id))).join("")}</div>`; }
function animal(o, a, sh) { return `<article class="panel"><div class="row"><h3>${esc(a.code)}</h3><b>${sh.length}/${a.totalShares}</b></div><p>${esc(a.country)} - ${esc(statuses[a.status] || a.status)}</p><div class="shares">${Array.from({ length: Number(a.totalShares || 7) }, (_, i) => `<span class="${sh.find((s) => s.shareNo === i + 1)?.status || ""}">${i + 1}</span>`).join("")}</div><div class="actions"><button data-action="animalStatus" data-id="${a.id}" data-org="${o.slug}" data-status="slaughtered">Kesildi</button><button data-action="animalStatus" data-id="${a.id}" data-org="${o.slug}" data-status="video-ready">Video hazır</button></div></article>`; }
function messages(o) { const logs = (state.data.messageLogs || []).filter((m) => m.organizationId === o.id); return `<section class="split"><article class="panel"><h2>SMS/Mail gönder</h2><form class="form" data-form="message"><input type="hidden" name="orgSlug" value="${o.slug}"><select name="channel"><option value="sms">SMS</option><option value="mail">E-posta</option></select><input name="target" placeholder="Hedef" required><textarea name="body" placeholder="Mesaj" required></textarea><button class="primary">Kuyruğa al</button></form></article>${panel("Geçmiş", table(["Kanal", "Hedef", "Mesaj", "Durum"], logs.map((m) => [m.channel, m.target, m.body, statuses[m.status] || m.status])))}</section>`; }
function settings(o) {
  return `<section class="split">
    <div>
      <article class="panel"><h2>Kurum kurulumu</h2>${table(["Alan", "Değer"], [["Kurum", o.name], ["Domain", o.domain], ["Tema", o.theme], ["IBAN", o.iban], ["POS Sağlayıcı", o.vposProvider || "mock"]])}</article>
      <article class="panel" style="margin-top:20px;"><h2>Yeni müşteri sitesi kur</h2><form class="form" data-form="tenant"><input name="organizationName" placeholder="Kurum adı" required><input name="domain" placeholder="hicretdernegi.org" required><input name="city" placeholder="Şehir"><select name="templateSlug">${orgs().map((x) => `<option value="${x.slug}">${esc(x.name)}</option>`).join("")}</select><input name="tagline" placeholder="Kısa slogan"><button class="primary">Siteyi oluştur</button></form></article>
    </div>
    <div>
      <article class="panel"><h2>Vakıf Katılım VPOS Ayarları</h2>
        <form class="form" data-form="vposSettings">
          <input type="hidden" name="slug" value="${o.slug}">
          <label style="font-weight:bold; font-size:13px; display:block; margin-bottom:4px;">POS Sağlayıcı</label>
          <select name="vposProvider" style="margin-bottom:12px;">
            <option value="mock" ${o.vposProvider === "mock" ? "selected" : ""}>Mock Gateway (Test Simülatörü)</option>
            <option value="vakifkatilim" ${o.vposProvider === "vakifkatilim" ? "selected" : ""}>Vakıf Katılım Sanal POS</option>
          </select>
          <input name="vposClientId" placeholder="Üye İşyeri No (Client ID)" value="${esc(o.vposClientId || '')}">
          <input name="vposStoreKey" placeholder="3D Store Key (Ortak Anahtar)" value="${esc(o.vposStoreKey || '')}">
          <input name="vposUsername" placeholder="API Kullanıcı Adı" value="${esc(o.vposUsername || '')}">
          <input name="vposPassword" type="password" placeholder="API Şifresi" value="${esc(o.vposPassword || '')}">
          <label style="display:flex; align-items:center; gap:8px; margin:12px 0;">
            <input type="checkbox" name="vposTestMode" ${o.vposTestMode ? "checked" : ""}> Test Ortamı (Sandbox)
          </label>
          <button class="primary">Ayarları Kaydet</button>
        </form>
      </article>
    </div>
  </section>`;
}

function donorPanel() {
  const dList = state.data.donors || [];
  const activeDonorId = state.activeDonorId || (dList[dList.length - 1]?.id || 1);
  const currentDonor = dList.find(d => d.id === activeDonorId) || dList[0];
  
  if (!currentDonor) {
    return shell(`
      <div style="padding:40px; text-align:center;">
        <h2>Bağışçı Profili Bulunamadı</h2>
        <a href="#/demos">Demolara Geri Dön</a>
      </div>
    `);
  }
  
  const donorDonations = (state.data.donations || []).filter(d => d.donorId === currentDonor.id);
  const donorOrphans = (state.data.orphans || []).filter(ch => ch.sponsorDonorId === currentDonor.id);
  const donorKurbanShares = (state.data.kurbanShares || []).filter(s => s.donorId === currentDonor.id);
  
  const activeTab = state.donorTab || "donations";
  const tabs = [
    { id: "donations", label: "💵 Bağış Geçmişim" },
    { id: "orphans", label: "👶 Sponsorluklarım" },
    { id: "kurban", label: "🐑 Kurban Hisselerim" }
  ];
  
  return shell(`
    <div>
      <header class="topbar">
        <a class="brand" href="#/"><span>E</span><b>E-İnfak</b></a>
        <nav>
          <a href="#/demos">Geri Dön (STK Siteleri)</a>
          <a href="#/admin">Otomasyon Paneli</a>
        </nav>
      </header>
      
      <main class="section" style="max-width:1000px; margin:0 auto; padding: 40px 20px;">
        <div style="background:#fff; border:1px solid var(--line); border-radius:var(--r); padding:24px; margin-bottom:28px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
          <div>
            <h1 style="margin:0; font-size:1.6rem;">👤 Bağışçı Profil Paneli</h1>
            <p style="margin:4px 0 0; color:var(--muted); font-size:13.5px;">Bağışlarınızı, sponsor olduğunuz yetimleri ve kurban videolarınızı takip edin.</p>
          </div>
          <div>
            <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Profil Seçimi (Test Modu)</label>
            <select id="donor-profile-select" style="padding:8px 12px; font-size:13px; border-radius:var(--r); border:1px solid var(--line); background:#fff; cursor:pointer;">
              ${dList.map(d => `<option value="${d.id}" ${d.id === currentDonor.id ? "selected" : ""}>${esc(d.fullName)} (${esc(d.city)})</option>`).join("")}
            </select>
          </div>
        </div>
        
        <!-- Tabs -->
        <div style="display:flex; border-bottom:1px solid var(--line); margin-bottom:24px; gap:8px;">
          ${tabs.map(t => `
            <button type="button" data-action="toggleDonorTab" data-tab="${t.id}"
                    style="background:none; border:0; border-bottom: 2px solid ${activeTab === t.id ? 'var(--brand)' : 'transparent'};
                           color:${activeTab === t.id ? 'var(--brand)' : 'var(--muted)'};
                           padding: 10px 16px; font-weight:bold; font-size:13.5px; cursor:pointer; transition:all 0.2s;">
              ${t.label}
            </button>
          `).join("")}
        </div>
        
        <!-- Tab Content -->
        <div>
          ${activeTab === "donations" ? `
            ${panel("Son Bağış Kayıtları", `
              <div class="table">
                <table>
                  <thead>
                    <tr>
                      <th>Makbuz No</th>
                      <th>Kampanya</th>
                      <th>Ödeme Yöntemi</th>
                      <th>Tutar</th>
                      <th>Tarih</th>
                      <th>Sertifika</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${donorDonations.length === 0 ? `
                      <tr><td colspan="6" style="text-align:center; padding:24px; color:var(--muted);">Kayıtlı bağış bulunamadı.</td></tr>
                    ` : donorDonations.map(d => `
                      <tr>
                        <td><a href="/makbuz/${d.receiptNo}" target="_blank" style="font-weight:bold; color:var(--brand); text-decoration:none;">${esc(d.receiptNo)}</a></td>
                        <td>${esc(campaignById(d.campaignId)?.title || "Genel Bağış")}</td>
                        <td><span class="badge confirmed" style="font-size:10px; padding:3px 8px;">${esc(d.paymentMethod === 'card' ? 'Kredi Kartı' : 'Havale/EFT')}</span></td>
                        <td><b>${money(d.amount)}</b></td>
                        <td style="color:var(--muted); font-size:12.5px;">${esc(d.createdAt.split('T')[0])}</td>
                        <td>
                          ${d.certificateRecipient ? `
                            <a href="/makbuz/${d.receiptNo}" target="_blank" style="padding:4px 8px; font-size:11px; background:var(--a); color:#1e293b; border-radius:4px; font-weight:bold; text-decoration:none;">🎁 Sertifika</a>
                          ` : `<span style="color:var(--muted); font-size:11.5px;">Yok</span>`}
                        </td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            `)}
          ` : activeTab === "orphans" ? `
            <div class="cards three">
              ${donorOrphans.length === 0 ? `
                <div class="empty" style="grid-column: span 3; padding:48px;">
                  Sponsor olduğunuz aktif yetim kaydı bulunamadı. Yetim Sponsorluğu sekmesinden yetimlerimize destek olabilirsiniz.
                </div>
              ` : donorOrphans.map(ch => `
                <article class="campaign" style="box-sizing:border-box; display:flex; flex-direction:column; justify-content:space-between; min-height:420px;">
                  <div class="visual" style="background: url('${ch.photoUrl}') center/cover no-repeat; position:relative; height:180px;">
                    <span style="background:#10b981; color:#fff; font-weight:bold;">${esc(ch.country)}</span>
                  </div>
                  <div style="padding:16px 20px 0; flex-grow:1;">
                    <h3 style="margin:0 0 4px;">${esc(ch.fullName)}</h3>
                    <p style="margin:0 0 12px; color:var(--muted); font-size:12px;">Yaş: ${esc(ch.age)} | Durum: Aktif Destekleniyor</p>
                    
                    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:var(--r); padding:10px 14px; margin-top:8px;">
                      <span style="font-size:10px; font-weight:bold; color:#166534; text-transform:uppercase; display:block;">📚 Eğitim & Gelişim Raporu</span>
                      <p style="margin:4px 0 0; font-size:12px; color:#14532d; font-family:sans-serif; line-height:1.4;">${esc(ch.schoolReport)}</p>
                    </div>
                  </div>
                  <div style="margin:16px 20px 20px;">
                    <span style="display:block; text-align:center; padding:10px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:var(--r); color:#1e40af; font-size:12px; font-weight:bold;">
                      Aylık Düzenli Ödeme Aktif
                    </span>
                  </div>
                </article>
              `).join("")}
            </div>
          ` : `
            <div class="cards three">
              ${donorKurbanShares.length === 0 ? `
                <div class="empty" style="grid-column: span 3; padding:48px;">
                  Kayıtlı kurban hisseniz bulunamadı.
                </div>
              ` : donorKurbanShares.map(s => {
                const isSlaughtered = s.status === "slaughtered" || s.videoUrl;
                return `
                  <article class="campaign" style="box-sizing:border-box; display:flex; flex-direction:column; justify-content:space-between; min-height:360px;">
                    <div class="visual" style="background: url('https://images.unsplash.com/photo-1588614660467-f076c8c4a090?auto=format&fit=crop&w=400&q=80') center/cover no-repeat; position:relative; height:150px;">
                      <span style="background:var(--p); color:#fff; font-weight:bold;">${esc(s.intentionType.toUpperCase())}</span>
                    </div>
                    <div style="padding:16px 20px 0; flex-grow:1;">
                      <h3 style="margin:0 0 4px;">Kurban Hissesi</h3>
                      <p style="margin:0; color:var(--muted); font-size:12.5px;">Kurban Kodu: ${esc(s.receiptNo || 'KRB-HISSE')}</p>
                      
                      <div style="margin-top:12px; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:12px; color:var(--muted);">Operasyon Durumu:</span>
                        <span class="badge ${isSlaughtered ? 'confirmed' : 'unmatched'}" style="font-size:10px; padding:3px 8px;">
                          ${isSlaughtered ? 'KESİLDİ' : 'SIRADA (BEKLİYOR)'}
                        </span>
                      </div>
                    </div>
                    
                    <div style="margin:16px 20px 20px;">
                      ${isSlaughtered ? `
                        <button type="button" data-action="watchKurbanVideo" data-video="${esc(s.videoUrl || '')}"
                                style="width:100%; min-height:40px; border:0; background:#0f172a; color:#fff; border-radius:var(--r); font-weight:bold; font-size:12.5px; cursor:pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                          🎥 Kesim Videosunu İzle
                        </button>
                      ` : `
                        <div style="text-align:center; padding:10px; background:#fff7ed; border:1px solid #ffedd5; border-radius:var(--r); color:#9a3412; font-size:11.5px; font-weight:bold; font-family:sans-serif; line-height:1.4;">
                          Kesim yapıldığında SMS ile video linki gönderilecektir.
                        </div>
                      `}
                    </div>
                  </article>
                `;
              }).join("")}
            </div>
          `}
        </div>
      </main>
    </div>
  `);
}

function data(form) { const fd = new FormData(form); const out = Object.fromEntries(fd.entries()); form.querySelectorAll('input[type="checkbox"]').forEach((i) => out[i.name] = i.checked); return out; }
document.addEventListener("submit", async (e) => {
  const form = e.target.closest("form[data-form]"); if (!form) return; e.preventDefault();
  const payload = data(form); const type = form.dataset.form;
  try {
    let res;
    if (type === "donation") {
      res = await api("/api/donations", { method: "POST", body: JSON.stringify(payload) });
      if (res.vposRedirect) {
        state.toast = "3D Secure ödeme sayfasına yönlendiriliyorsunuz...";
        render();
        const f = document.createElement("form");
        f.method = "POST";
        f.action = res.gatewayUrl;
        for (const [k, v] of Object.entries(res.inputs)) {
          const inp = document.createElement("input");
          inp.type = "hidden";
          inp.name = k;
          inp.value = v;
          f.appendChild(inp);
        }
        document.body.appendChild(f);
        f.submit();
        return;
      }
      state.toast = `Bağış kaydı oluşturuldu. Makbuz: ${res.receiptNo}`;
    }
    if (type === "sponsorship") {
      res = await api("/api/sponsorships", { method: "POST", body: JSON.stringify(payload) });
      state.toast = `Sponsorluk başlatıldı! Makbuz No: ${res.receiptNo}`;
      state.selectedOrphan = null;
    }
    if (type === "lead") { res = await api("/api/company-leads", { method: "POST", body: JSON.stringify(payload) }); state.toast = "Demo talebiniz kaydedildi."; }
    if (type === "contact") {
      const contactPayload = {
        orgSlug: payload.orgSlug,
        donorId: null,
        channel: "mail",
        target: payload.email,
        body: `İletişim Mesajı | Gönderen: ${payload.name} | Konu: ${payload.subject} | Mesaj: ${payload.message}`
      };
      res = await api("/api/messages/send", { method: "POST", body: JSON.stringify(contactPayload) });
      state.toast = "Mesajınız başarıyla iletildi! Teşekkür ederiz.";
    }
    if (type === "message") { res = await api("/api/messages/send", { method: "POST", body: JSON.stringify(payload) }); state.toast = "Mesaj kuyruğa alındı."; }
    if (type === "kurbanAnimal") { res = await api("/api/kurban/animals", { method: "POST", body: JSON.stringify(payload) }); state.toast = "Kurban operasyon kaydı eklendi."; }
    if (type === "tenant") { res = await api("/api/tenants", { method: "POST", body: JSON.stringify(payload) }); state.selectedOrgSlug = res.slug; state.toast = "Yeni kurum sitesi oluşturuldu."; }
    if (type === "vposSettings") { res = await api(`/api/tenants/${encodeURIComponent(payload.slug)}/vpos`, { method: "PATCH", body: JSON.stringify(payload) }); state.toast = "Vakıf Katılım Sanal POS ayarları kaydedildi."; }
    if (type === "bankMatch") {
      res = await api("/api/bank/match", { method: "POST", body: JSON.stringify(payload) });
      state.toast = "Banka hareketi bağış kaydıyla başarıyla eşleştirildi.";
      state.selectedBankMovementId = null;
    }
    if (type === "campaignCMS") {
      const isEdit = !!payload.id;
      // Convert suggested amounts from string to array of numbers
      const suggestedStr = payload.suggestedAmounts || "100, 250, 500, 1000";
      payload.suggestedAmounts = suggestedStr.split(",").map(n => Number(n.trim())).filter(Boolean);
      payload.active = !!payload.active;
      
      if (isEdit) {
        res = await api(`/api/campaigns/${payload.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        state.toast = "Kampanya başarıyla güncellendi.";
      } else {
        res = await api("/api/campaigns", { method: "POST", body: JSON.stringify(payload) });
        state.toast = "Yeni kampanya başarıyla yayına alındı.";
      }
      state.editingCampaignId = null;
    }
    if (res?.data) state.data = res.data;
    form.reset(); render(); setTimeout(() => { state.toast = ""; render(); }, 2600);
  } catch (err) { state.toast = err.message; render(); }
});
document.addEventListener("click", async (e) => {
  const wantsCert = e.target.closest("#wants-certificate-cb");
  if (wantsCert) {
    const container = document.getElementById("certificate-fields-container");
    if (container) container.style.display = wantsCert.checked ? "flex" : "none";
  }
  const wantsGebis = e.target.closest("#gebis-tax-cb");
  if (wantsGebis) {
    const container = document.getElementById("gebis-fields-container");
    if (container) container.style.display = wantsGebis.checked ? "flex" : "none";
  }
  const faqTitle = e.target.closest(".faq-title");
  if (faqTitle) {
    const item = faqTitle.closest(".faq-item");
    const content = item.querySelector(".faq-content");
    const icon = faqTitle.querySelector(".faq-icon");
    if (content.style.display === "block") {
      content.style.display = "none";
      if (icon) icon.textContent = "▼";
    } else {
      content.style.display = "block";
      if (icon) icon.textContent = "▲";
    }
  }
  const fill = e.target.closest("[data-fill]"); if (fill) fill.closest("form").querySelector('[name="amount"]').value = fill.dataset.fill;
  const tab = e.target.closest("[data-tab]"); if (tab) { state.adminTab = tab.dataset.tab; state.selectedDonorId = null; state.selectedBankMovementId = null; render(); }
  
  const slideDot = e.target.closest("[data-slide-dot]");
  if (slideDot) {
    state.currentSlideIndex = Number(slideDot.dataset.slideDot);
    render();
    return;
  }
  
  const catTab = e.target.closest("[data-category-tab]");
  if (catTab) {
    state.selectedCategory = catTab.dataset.categoryTab;
    render();
    return;
  }
  
  const countryEl = e.target.closest("[data-country]");
  if (countryEl) {
    state.activeCountry = countryEl.dataset.country;
    render();
    return;
  }
  
  const rowDonor = e.target.closest("[data-click-donor]");
  if (rowDonor) {
    state.selectedDonorId = Number(rowDonor.dataset.clickDonor);
    render();
    return;
  }
  
  const action = e.target.closest("[data-action]"); if (!action) return;
  
  if (action.dataset.action === "closeDonor") {
    state.selectedDonorId = null;
    render();
    return;
  }
  if (action.dataset.action === "setPaymentMethod") {
    state.selectedPaymentMethod = action.dataset.value;
    render();
    return;
  }
  if (action.dataset.action === "copyIban") {
    const txt = document.getElementById("iban-val-text");
    if (txt) {
      navigator.clipboard.writeText(txt.textContent.trim());
      state.toast = "IBAN panoya kopyalandı!";
      render();
      setTimeout(() => { state.toast = ""; render(); }, 2000);
    }
    return;
  }
  if (action.dataset.action === "reconcileBank") {
    state.selectedBankMovementId = Number(action.dataset.id);
    render();
    return;
  }
  if (action.dataset.action === "cancelBankMatch") {
    state.selectedBankMovementId = null;
    render();
    return;
  }
  if (action.dataset.action === "toggleQuickRecurring") {
    state.quickRecurring = action.dataset.value === "true";
    render();
    return;
  }
  if (action.dataset.action === "toggleCheckoutRecurring") {
    state.checkoutRecurring = action.dataset.value === "true";
    render();
    return;
  }
  if (action.dataset.action === "toggleDarkMode") {
    state.darkMode = !state.darkMode;
    document.body.classList.toggle("dark-theme", !!state.darkMode);
    render();
    return;
  }
  if (action.dataset.action === "openSponsorModal") {
    state.selectedOrphan = {
      id: Number(action.dataset.orphanId),
      name: action.dataset.name,
      country: action.dataset.country
    };
    render();
    return;
  }
  if (action.dataset.action === "closeOrphanModal") {
    state.selectedOrphan = null;
    render();
    return;
  }
  if (action.dataset.action === "toggleDonorTab") {
    state.donorTab = action.dataset.tab;
    render();
    return;
  }
  if (action.dataset.action === "watchKurbanVideo") {
    state.activeKurbanVideo = action.dataset.video || "https://www.w3schools.com/html/mov_bbb.mp4";
    render();
    return;
  }
  if (action.dataset.action === "closeKurbanVideoModal") {
    state.activeKurbanVideo = null;
    render();
    return;
  }
  if (action.dataset.action === "donateCalculatedZekat") {
    const amt = action.dataset.amount;
    state.quickRecurring = false;
    render(); // Segmented controlün güncellenmesi için render
    const container = document.getElementById("quick-donate-container");
    if (container) {
      container.querySelector('[name="amount"]').value = amt;
      const select = container.querySelector('[name="campaignSlug"]');
      if (select) {
        const opt = Array.from(select.options).find(o => o.value.includes("zekat") || o.text.toLowerCase().includes("zekat"));
        if (opt) select.value = opt.value;
      }
      container.scrollIntoView({ behavior: "smooth" });
    }
    return;
  }
  if (action.dataset.action === "editCampaign") {
    state.editingCampaignId = Number(action.dataset.id);
    render();
    return;
  }
  if (action.dataset.action === "cancelCampaignEdit") {
    state.editingCampaignId = null;
    render();
    return;
  }
  if (action.dataset.action === "deleteCampaign") {
    if (confirm("Bu kampanyayı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) {
      try {
        const orgSlug = action.dataset.org;
        const res = await api(`/api/campaigns/${action.dataset.id}?orgSlug=${encodeURIComponent(orgSlug)}`, { method: "DELETE" });
        if (res?.data) state.data = res.data;
        if (state.editingCampaignId === Number(action.dataset.id)) state.editingCampaignId = null;
        state.toast = "Kampanya başarıyla silindi.";
        render();
      } catch (err) {
        state.toast = err.message;
        render();
      }
    }
    return;
  }

  try {
    let res;
    if (action.dataset.action === "autoAssign") res = await api("/api/kurban/auto-assign", { method: "POST", body: JSON.stringify({ orgSlug: action.dataset.org }) });
    if (action.dataset.action === "animalStatus") res = await api(`/api/kurban/animals/${action.dataset.id}`, { method: "PATCH", body: JSON.stringify({ orgSlug: action.dataset.org, status: action.dataset.status }) });
    if (res?.data) state.data = res.data;
    state.toast = "İşlem tamamlandı."; render();
  } catch (err) { state.toast = err.message; render(); }
});
document.addEventListener("change", (e) => {
  const select = e.target.closest("[data-org]");
  if (select) {
    state.selectedOrgSlug = select.value;
    render();
  }
  const donorSelect = e.target.closest("#donor-profile-select");
  if (donorSelect) {
    state.activeDonorId = Number(donorSelect.value);
    state.donorTab = "donations"; // Reset tab to donations
    render();
  }
  const kRegion = e.target.closest("#kurban-region-select");
  const kShares = e.target.closest("#kurban-shares-select");
  if (kRegion || kShares) {
    const form = e.target.closest("form");
    if (form) {
      const regSelect = form.querySelector("#kurban-region-select");
      const shSelect = form.querySelector("#kurban-shares-select");
      const opt = regSelect.options[regSelect.selectedIndex];
      const price = Number(opt.dataset.price || 4500);
      const qty = Number(shSelect.value || 1);
      const total = price * qty;
      
      const totalDisplay = form.querySelector("#kurban-total-display");
      if (totalDisplay) totalDisplay.innerHTML = money(total);
      
      const amtInput = form.querySelector('[name="amount"]');
      if (amtInput) amtInput.value = total;
    }
  }
});
addEventListener("hashchange", () => { state.route = route(); load(); });
document.addEventListener("input", (e) => {
  const input = e.target;
  
  if (input.name === "ccName") {
    const sim = document.getElementById("sim-name");
    if (sim) sim.textContent = input.value.toUpperCase() || "AD SOYAD";
  }
  if (input.name === "ccNumber") {
    const sim = document.getElementById("sim-number");
    if (sim) {
      let val = input.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
      let formatted = "";
      for (let i = 0; i < val.length; i++) {
        if (i > 0 && i % 4 === 0) formatted += " ";
        formatted += val[i];
      }
      sim.textContent = formatted || "•••• •••• •••• ••••";
    }
  }
  if (input.name === "ccExpiry") {
    const sim = document.getElementById("sim-expiry");
    if (sim) sim.textContent = input.value || "AA/YY";
  }
  if (input.name === "ccCvc") {
    const sim = document.getElementById("sim-cvc");
    if (sim) sim.textContent = input.value || "•••";
  }
  
  const zekatInput = input.closest("[data-zekat-input]");
  if (zekatInput) {
    const panel = zekatInput.closest(".panel");
    if (panel) {
      const cash = Number(panel.querySelector('[data-zekat-input="cash"]').value) || 0;
      const foreign = Number(panel.querySelector('[data-zekat-input="foreign"]').value) || 0;
      const gold = Number(panel.querySelector('[data-zekat-input="gold"]').value) || 0;
      
      state.zekatNakit = cash;
      state.zekatDoviz = foreign;
      state.zekatAltin = gold;
      
      const total = cash + foreign + (gold * 3000);
      const nisab = 80.18 * 3000;
      const owes = total >= nisab;
      const amt = owes ? Math.round(total * 0.025) : 0;
      
      const totalNode = panel.querySelector("#zekat-total-wealth");
      if (totalNode) totalNode.innerHTML = money(total);
      
      const amountNode = panel.querySelector("#zekat-amount-val");
      if (amountNode) amountNode.innerHTML = money(amt);
      
      const actionNode = panel.querySelector("#zekat-action-container");
      if (actionNode) {
        actionNode.innerHTML = amt > 0 ? `
          <button type="button" data-action="donateCalculatedZekat" data-amount="${amt}" style="min-height:32px; padding:0 12px; font-size:11px; border:0; background:var(--brand); color:#fff; border-radius:var(--r); font-weight:bold;">Zekatı Bağışla</button>
        ` : `
          <span style="font-size:10px; color:var(--muted); text-align:right; max-width:145px; display:block; line-height:1.3;">Nisab sınırının altında kaldığı için zekat gerekmemektedir.</span>
        `;
      }
    }
  }

  if (input.dataset.mask === "cc") {
    let val = input.value.replace(/\D/g, "");
    let parts = [];
    for (let i = 0; i < val.length; i += 4) { parts.push(val.substring(i, i + 4)); }
    input.value = parts.join(" ");
  }
  if (input.dataset.mask === "expiry") {
    let val = input.value.replace(/\D/g, "");
    if (val.length > 2) {
      input.value = val.substring(0, 2) + "/" + val.substring(2, 4);
    } else {
      input.value = val;
    }
  }
  if (input.dataset.mask === "cvc") {
    input.value = input.value.replace(/\D/g, "");
  }
});
document.addEventListener("focusin", (e) => {
  if (e.target.name === "ccCvc") {
    const sim = document.getElementById("card-simulator");
    if (sim) sim.classList.add("flipped");
  }
});
document.addEventListener("focusout", (e) => {
  if (e.target.name === "ccCvc") {
    const sim = document.getElementById("card-simulator");
    if (sim) sim.classList.remove("flipped");
  }
});
function campaignsEditor(o) {
  const list = campaigns(o.slug);
  const editing = state.editingCampaignId ? list.find(c => c.id === state.editingCampaignId) : null;
  
  const formHtml = `
    <article class="panel">
      <h2>${editing ? "Kampanyayı Düzenle" : "Yeni Kampanya Oluştur"}</h2>
      <form class="form" data-form="campaignCMS" style="gap: 12px;">
        <input type="hidden" name="id" value="${editing ? editing.id : ''}">
        <input type="hidden" name="orgSlug" value="${o.slug}">
        
        <div>
          <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Kampanya Başlığı</label>
          <input name="title" required placeholder="Kampanya Başlığı" value="${editing ? esc(editing.title) : ''}" style="font-size:13px; padding:8px 10px; width:100%; border: 1px solid var(--line); border-radius: var(--r);">
        </div>
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Kategori</label>
            <select name="category" required style="font-size:13px; padding:8px 10px; height: 38px; width:100%; border: 1px solid var(--line); border-radius: var(--r);">
              ${Object.entries(labels).map(([val, name]) => `<option value="${val}" ${editing && editing.category === val ? "selected" : ""}>${esc(name)}</option>`).join("")}
            </select>
          </div>
          <div>
            <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Hedef Tutar (TL)</label>
            <input type="number" name="target" required placeholder="Hedef Tutar" value="${editing ? Math.round(editing.target) : '500000'}" style="font-size:13px; padding:8px 10px; width:100%; border: 1px solid var(--line); border-radius: var(--r);">
          </div>
        </div>
        
        <div>
          <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Kapak Görseli (URL veya boş bırakın)</label>
          <input name="visual" placeholder="https://images.unsplash.com/photo-..." value="${editing ? esc(editing.visual) : ''}" style="font-size:13px; padding:8px 10px; width:100%; border: 1px solid var(--line); border-radius: var(--r);">
        </div>

        <div>
          <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Önerilen Tutar Seçenekleri (Virgülle ayırın)</label>
          <input name="suggestedAmounts" placeholder="100, 250, 500, 1000" value="${editing ? (editing.suggestedAmounts || []).join(', ') : '100, 250, 500, 1000'}" style="font-size:13px; padding:8px 10px; width:100%; border: 1px solid var(--line); border-radius: var(--r);">
        </div>
        
        <div>
          <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Kısa Özet (Arama sonuçları için)</label>
          <input name="summary" required placeholder="Kısa kampanya özeti..." value="${editing ? esc(editing.summary) : ''}" style="font-size:13px; padding:8px 10px; width:100%; border: 1px solid var(--line); border-radius: var(--r);">
        </div>
        
        <div>
          <label style="font-size:11px; font-weight:bold; color:var(--muted); display:block; margin-bottom:4px;">Kampanya Detaylı Hikayesi</label>
          <textarea name="story" required placeholder="Kampanyanın amacı ve detaylı açıklaması..." style="font-size:13px; padding:8px 10px; height:80px; font-family:sans-serif; width:100%; border: 1px solid var(--line); border-radius: var(--r);">${editing ? esc(editing.story) : ''}</textarea>
        </div>

        <div style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" name="active" id="cms-active-cb" ${!editing || editing.active ? 'checked' : ''} style="width:auto; margin:0;">
          <label for="cms-active-cb" style="font-size:12px; font-weight:bold; color:var(--ink); cursor:pointer; user-select:none; margin:0;">Kampanya Aktif (Sitede Gösterilsin)</label>
        </div>
        
        <div style="display:flex; gap:10px; margin-top:10px;">
          <button class="primary" style="flex:1;">${editing ? "Değişiklikleri Kaydet" : "Kampanyayı Yayına Al"}</button>
          ${editing ? `<button type="button" class="ghost" data-action="cancelCampaignEdit" style="flex:1;">Vazgeç</button>` : ''}
        </div>
      </form>
    </article>
  `;

  const listHtml = `
    <article class="panel" style="overflow-x: auto;">
      <h2>Mevcut Kampanyalar</h2>
      <div class="table">
        <table>
          <thead>
            <tr>
              <th>Kampanya</th>
              <th>Kategori</th>
              <th>Toplanan / Hedef</th>
              <th>Durum</th>
              <th class="no-print" style="text-align:right;">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(c => `
              <tr>
                <td>
                  <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:40px; height:30px; background:url('${c.visual}') center/cover; border-radius:4px; flex-shrink:0;"></div>
                    <div>
                      <strong style="font-size:13px; color:var(--ink);">${esc(c.title)}</strong><br>
                      <small style="color:var(--muted); font-size:10px;">${esc(c.slug)}</small>
                    </div>
                  </div>
                </td>
                <td>${esc(labels[c.category] || c.category)}</td>
                <td><b>${money(c.collected)}</b> / <small style="color:var(--muted);">${money(c.target)}</small></td>
                <td><span style="font-weight:bold; color:${c.active ? '#0f766e' : '#64748b'}">${c.active ? 'Aktif' : 'Pasif'}</span></td>
                <td class="no-print" style="text-align:right; white-space:nowrap;">
                  <button class="ghost" data-action="editCampaign" data-id="${c.id}" style="min-height:28px; padding:0 10px; font-size:11px; font-weight:bold; border: 1px solid var(--line); border-radius: var(--r); margin-right:4px;">Düzenle</button>
                  <button class="primary" data-action="deleteCampaign" data-id="${c.id}" data-org="${o.slug}" style="min-height:28px; padding:0 10px; font-size:11px; font-weight:bold; background:#e11d48; box-shadow:none; border-radius: var(--r);">Sil</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;

  return `<section class="split" style="grid-template-columns:1fr 1.3fr; gap:20px; align-items:start;">
    ${formHtml}
    ${listHtml}
  </section>`;
}

load().catch((err) => paint(`<main class="loading"><h1>Uygulama açılamadı</h1><p>${esc(err.message)}</p></main>`));
