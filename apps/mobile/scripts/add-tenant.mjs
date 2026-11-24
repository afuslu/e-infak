/**
 * Platform panelinden indirilen başvuru paketinden kuruma özel uygulama ekler.
 *   node scripts/add-tenant.mjs <paket-klasörü>   (app.json, icon.png, splash.png)
 * src/config/tenants.json, eas.json ve assets/tenants/<kurum>/ günceller; derleme başlatmaz.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.ADD_TENANT_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = (text) => { console.error(`HATA: ${text}`); process.exit(1); };
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, data) => fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);

const dir = process.argv[2];
if (!dir || !fs.existsSync(path.join(dir, 'app.json'))) fail('Kullanım: node scripts/add-tenant.mjs <paket-klasörü>');
const app = read(path.join(dir, 'app.json'));

const rules = {
  slug: /^[a-z0-9][a-z0-9-]{1,40}$/,
  host: /^[a-z0-9.-]+\.[a-z]{2,}$/,
  primaryColor: /^#[0-9a-f]{6}$/i,
  accentColor: /^#[0-9a-f]{6}$/i,
  splashColor: /^#[0-9a-f]{6}$/i,
  packageAndroid: /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/,
  bundleIos: /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/,
  scheme: /^[a-z][a-z0-9]*$/,
};
for (const [key, rule] of Object.entries(rules)) if (!rule.test(String(app[key] || ''))) fail(`app.json: ${key} geçersiz`);
for (const key of ['name', 'fullName']) if (!String(app[key] || '').trim()) fail(`app.json: ${key} boş`);
for (const file of ['icon.png', 'splash.png']) {
  const full = path.join(dir, file);
  if (!fs.existsSync(full) || fs.readFileSync(full).subarray(1, 4).toString() !== 'PNG') fail(`${file} bulunamadı veya PNG değil`);
}

const tenantsFile = path.join(root, 'src/config/tenants.json');
const tenants = read(tenantsFile);
const base = read(path.join(root, 'app.json')).expo;
const others = Object.values(tenants).filter((t) => t.slug !== app.slug);
if ([base.android.package, base.ios.bundleIdentifier, ...others.flatMap((t) => [t.packageAndroid, t.bundleIos])]
  .some((id) => id === app.packageAndroid || id === app.bundleIos)) fail('Paket kimliği başka bir uygulamada kullanılıyor');
if ([base.scheme, ...others.map((t) => t.scheme)].includes(app.scheme)) fail('Bağlantı şeması (scheme) başka bir uygulamada kullanılıyor');
const existing = tenants[app.slug];
if (existing && existing.packageAndroid !== app.packageAndroid) fail('Bu kurumun uygulaması başka bir paket kimliğiyle kayıtlı; kimlik değiştirilemez');
if (existing && !process.argv.includes('--guncelle')) fail('Bu kurum zaten ekli. Ad ve görselleri yenilemek için --guncelle ekleyin');

const assets = path.join(root, 'assets/tenants', app.slug);
fs.mkdirSync(assets, { recursive: true });
fs.copyFileSync(path.join(dir, 'icon.png'), path.join(assets, 'icon.png'));
fs.copyFileSync(path.join(dir, 'splash.png'), path.join(assets, 'splash.png'));
const adaptive = path.join(assets, 'adaptive-icon.png');
fs.copyFileSync(path.join(dir, 'icon.png'), adaptive);
try {
  // Android uyarlanabilir ikonun kenarını kırpar: ikon ortaya küçültülür.
  execFileSync('sips', ['-p', '1536', '1536', '--padColor', app.splashColor.slice(1), adaptive], { stdio: 'ignore' });
  execFileSync('sips', ['-z', '1024', '1024', adaptive], { stdio: 'ignore' });
} catch {
  console.warn('UYARI: sips yok; adaptive-icon.png kenarları kırpılabilir, elle küçültün.');
}

tenants[app.slug] = Object.fromEntries([
  ...['slug', 'name', 'fullName', 'tagline', 'host', 'primaryColor', 'accentColor', 'packageAndroid', 'bundleIos', 'scheme', 'splashColor']
    .map((key) => [key, app[key] || '']),
  ['adaptiveColor', app.splashColor],
]);
write(tenantsFile, tenants);

const easFile = path.join(root, 'eas.json');
const eas = read(easFile);
const env = { EXPO_PUBLIC_TENANT: app.slug, EXPO_PUBLIC_API_HOST: app.host };
eas.build[`${app.slug}-preview`] = { distribution: 'internal', android: { buildType: 'apk' }, env };
eas.build[`${app.slug}-production`] = { autoIncrement: true, env };
write(easFile, eas);
console.log(`${app.name} eklendi. Sıradaki: eas build --platform android --profile ${app.slug}-production`);
