const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const dist = process.env.MOBILE_TEST_DIST;
assert.ok(dist, 'MOBILE_TEST_DIST gerekli');

// Hafıza içi localStorage + React Native / Expo modül mock'ları
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.__DEV__ = false;

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Platform: { OS: 'web' },
      Linking: { openURL: async () => {} },
    };
  }
  if (request === 'expo-secure-store') {
    return {
      getItemAsync: async (k) => (store.has(k) ? store.get(k) : null),
      setItemAsync: async (k, v) => { store.set(k, String(v)); },
      deleteItemAsync: async (k) => { store.delete(k); },
    };
  }
  if (request === 'expo-file-system') {
    return { File: class {}, Paths: { document: '' } };
  }
  if (request.startsWith('@/')) {
    return origLoad.call(this, path.join(dist, request.slice(2)), parent, isMain);
  }
  return origLoad.call(this, request, parent, isMain);
};

const access = require(path.join(dist, 'lib', 'access.js'));
const format = require(path.join(dist, 'lib', 'format.js'));
const api = require(path.join(dist, 'lib', 'api.js'));
const offline = require(path.join(dist, 'lib', 'offlineQueue.js'));
const notificationRoute = require(path.join(dist, 'lib', 'notificationRoute.js'));

test('access: yetki ve paket kontrolleri', () => {
  const sample = {
    plan: 'pro',
    features: ['donor_crm', 'sms', 'kurban'],
    addons: [],
    me: {
      id: 'u1',
      role: 'operasyon',
      is_platform_admin: false,
      permissions: [],
      capabilities: ['receipts.create', 'donors.update'],
      modules: ['receipts', 'operations'],
    },
  };
  assert.equal(access.hasFeature(sample, 'kurban'), true);
  assert.equal(access.hasFeature(sample, 'water_well'), false);
  assert.equal(access.hasFeature(sample, undefined), true);
  assert.equal(access.can(sample, 'receipts.create'), true);
  assert.equal(access.can(sample, 'receipts.cancel'), false);
  assert.equal(access.can(null, 'receipts.create'), false);
  assert.equal(access.hasModule(sample, 'receipts'), true);
  assert.equal(access.hasModule(sample, ['finance', 'operations']), true);
  assert.equal(access.hasModule(sample, 'settings'), false);
  assert.equal(access.allowed(sample, 'donor_crm', 'receipts'), true);
  assert.equal(access.allowed(sample, 'water_well', 'receipts'), false);
});

test('format: tutar, tarih, telefon ve IBAN yardımcıları', () => {
  assert.equal(format.toCents('1.250,50'), 125050);
  assert.equal(format.toCents('500'), 50000);
  assert.equal(format.toCents('1250.5'), 125050);
  assert.equal(format.toCents('-10'), null);
  assert.equal(format.toCents('abc'), null);
  assert.equal(format.centsToInput(125050), '1250,50');
  assert.equal(format.centsToInput(50000), '500');
  assert.equal(format.centsToInput(null), '');

  assert.equal(format.trDateToIso('22.11.2026'), '2026-11-22');
  assert.equal(format.trDateToIso('31.02.2026'), null);
  assert.equal(format.isoToTrDate('2026-11-22'), '22.11.2026');

  assert.equal(format.initials('Ahmet Fatih Uslu'), 'AF');
  assert.equal(format.initials(''), '?');
  assert.equal(format.isDialable('0532 111 22 33'), true);
  assert.equal(format.isDialable('0532 *** ** 33'), false);
  assert.equal(format.isDialable('123'), false);

  assert.equal(format.validTrIban('TR33 0006 1005 1978 6457 8413 26'), true);
  assert.equal(format.validTrIban('TR00 0006 1005 1978 6457 8413 26'), false);
  assert.equal(format.daysAgo(0), 'bugün');
  assert.equal(format.daysAgo(1), 'dün');
  assert.equal(format.daysAgo(14), '14 gün önce');
  assert.ok(format.idempotencyKey('test').length >= 16);
});

test('api: cleanHost, queryString ve errorMessage', async () => {
  assert.equal(api.cleanHost('  HTTPS://OrnekDernek.org/admin  '), 'ornekdernek.org');
  assert.equal(api.cleanHost('hakder'), 'hakder.e-infak.org');
  await api.saveRememberedLogin({ remember: true, identifier: 'hakder@gmail.com', donorContact: '05321112233' });
  const saved = await api.loadRememberedLogin();
  assert.equal(saved.remember, true);
  assert.equal(saved.identifier, 'hakder@gmail.com');
  assert.equal(saved.donorContact, '05321112233');
  await api.saveRememberedLogin({ remember: false });
  const cleared = await api.loadRememberedLogin();
  assert.equal(cleared.remember, false);
  assert.equal(cleared.identifier, undefined);
  assert.equal(api.queryString({ q: 'ali veli', page: 2, empty: '', skip: null }), '?q=ali%20veli&page=2');
  assert.equal(api.queryString({}), '');
  assert.deepEqual(
    api.errorMessage({ detail: { code: 'feature_not_in_plan', message: 'Pakette yok' } }, 403),
    { message: 'Pakette yok', code: 'feature_not_in_plan' }
  );
  assert.equal(api.errorMessage({ detail: 'Organization not found' }, 404).message, 'Kurum bulunamadı ya da etkin değil.');
  assert.equal(api.errorMessage(null, 429).message, 'Çok fazla deneme yapıldı. Lütfen biraz bekleyin.');
  assert.equal(api.errorMessage(null, 500).message, 'Sunucu hatası. Lütfen tekrar deneyin.');
});

test('offlineQueue: senkronizasyon sırasında eklenen kayıt korunur ve çıkışta temizlenir', async () => {
  store.clear();
  const first = await offline.enqueueOffline({
    kind: 'receipt',
    label: 'Ahmet · 500 TL',
    endpoint: '/donations/manual',
    useAf: true,
    body: { amount_cents: 50000 },
  });
  assert.equal((await offline.listOfflineQueue()).length, 1);

  let addedDuringSync = null;
  globalThis.fetch = async () => {
    // Senkronizasyon sürerken araya yeni bir kayıt eklensin:
    if (!addedDuringSync) {
      addedDuringSync = await offline.enqueueOffline({
        kind: 'receipt',
        label: 'Mehmet · 250 TL',
        endpoint: '/donations/manual',
        useAf: true,
        body: { amount_cents: 25000 },
      });
    }
    return { ok: true, status: 201, text: async () => JSON.stringify({ id: 'd1', receipt_number: 'M-1' }) };
  };

  const result = await offline.syncOfflineQueue();
  assert.deepEqual(result, { synced: 1, failed: 0 });

  const remaining = await offline.listOfflineQueue();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, addedDuringSync.id);
  assert.notEqual(remaining[0].id, first.id);

  await offline.clearOfflineData();
  assert.equal((await offline.listOfflineQueue()).length, 0);
});

test('notificationRoute: personel, bağışçı ve platform bildirim yönlendirmeleri', () => {
  const pushed = [];
  const router = { push: (target) => pushed.push(target) };

  // Personel: etkileşimli butonlar, hatırlatma ve modül rotaları
  notificationRoute.openNotificationTarget(router, { donation_id: 'd1', receipt_number: 'BG-1' }, 'open_donation', 'tenant');
  assert.deepEqual(pushed.pop(), { pathname: '/bagis/[id]', params: { id: 'd1', no: 'BG-1' } });

  notificationRoute.openNotificationTarget(router, { type: 'reminder', donor_id: 'dn1' }, undefined, 'tenant');
  assert.deepEqual(pushed.pop(), { pathname: '/bagisci/[id]', params: { id: 'dn1' } });

  notificationRoute.openNotificationTarget(router, { type: 'reminder' }, undefined, 'tenant');
  assert.equal(pushed.pop(), '/hatirlatici');

  notificationRoute.openNotificationTarget(router, { type: 'reminder', route: 'search', donor_id: null }, undefined, 'tenant');
  assert.equal(pushed.pop(), '/hatirlatici');

  notificationRoute.openNotificationTarget(router, { route: 'recurring' }, undefined, 'tenant');
  assert.equal(pushed.pop(), '/duzenli-odemeler');

  // Bağışçı rotaları
  notificationRoute.openNotificationTarget(router, { route: 'donor_kurban' }, undefined, 'donor');
  assert.equal(pushed.pop(), '/(donor)/projelerim');

  notificationRoute.openNotificationTarget(router, { route: 'donor_wells' }, undefined, 'donor');
  assert.equal(pushed.pop(), '/(donor)/su-kuyularim');

  notificationRoute.openNotificationTarget(router, { route: 'donor_subscriptions' }, undefined, 'donor');
  assert.equal(pushed.pop(), '/(donor)/talimatlarim');

  // Platform yöneticisi rotaları
  notificationRoute.openNotificationTarget(router, { route: 'platform_ticket', ticket_id: 't9' }, undefined, 'platform');
  assert.deepEqual(pushed.pop(), { pathname: '/talep/[id]', params: { id: 't9' } });

  notificationRoute.openNotificationTarget(router, { route: 'platform_demos' }, undefined, 'platform');
  assert.deepEqual(pushed.pop(), { pathname: '/(tabs)/talepler', params: { tab: 'demos' } });

  notificationRoute.openNotificationTarget(router, { route: 'platform_org', org_id: 'o5' }, undefined, 'platform');
  assert.deepEqual(pushed.pop(), { pathname: '/kurum/[id]', params: { id: 'o5' } });
});
