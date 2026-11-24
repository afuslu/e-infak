const fs = require('fs');
const path = require('path');

// Kuruma özel uygulamalar. Yenisi scripts/add-tenant.mjs ile eklenir.
const TENANTS = require('./src/config/tenants.json');

module.exports = ({ config }) => {
  const tenantKey = (process.env.EXPO_PUBLIC_TENANT || '').trim().toLowerCase();
  const profile = TENANTS[tenantKey];
  if (tenantKey && !profile) throw new Error(`src/config/tenants.json içinde "${tenantKey}" yok`);

  if (!profile) {
    return config;
  }

  const assets = `./assets/tenants/${tenantKey}`;
  const expo = JSON.parse(JSON.stringify(config));
  expo.name = profile.name;
  expo.scheme = profile.scheme;
  expo.icon = `${assets}/icon.png`;
  expo.ios = {
    ...(expo.ios || {}),
    bundleIdentifier: profile.bundleIos,
  };
  expo.android = {
    ...(expo.android || {}),
    package: profile.packageAndroid,
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: `${assets}/adaptive-icon.png`,
      backgroundColor: profile.adaptiveColor,
    },
  };
  // Google Services JSON sadece e-İnfak paket adına kayıtlı; ayrı Firebase eklenene kadar kaldırılır.
  // Firebase'de bu paket kaydedilip dosya eklenince (google-services.<kurum>.json) bildirimler açılır.
  const firebase = `./google-services.${tenantKey}.json`;
  if (fs.existsSync(path.join(__dirname, firebase))) expo.android.googleServicesFile = firebase;
  else delete expo.android.googleServicesFile;

  expo.plugins = (expo.plugins || []).map((plugin) => {
    if (Array.isArray(plugin) && plugin[0] === 'expo-notifications') {
      return ['expo-notifications', { ...(plugin[1] || {}), color: profile.primaryColor }];
    }
    if (Array.isArray(plugin) && plugin[0] === 'expo-splash-screen') {
      return ['expo-splash-screen', { ...(plugin[1] || {}), image: `${assets}/splash.png`, backgroundColor: profile.splashColor }];
    }
    if (Array.isArray(plugin) && plugin[0] === 'expo-widgets') {
      return ['expo-widgets', { ...(plugin[1] || {}), groupIdentifier: `group.${profile.bundleIos}` }];
    }
    if (Array.isArray(plugin) && plugin[0] === 'react-native-android-widget') {
      const cfg = plugin[1] || {};
      return [
        'react-native-android-widget',
        {
          ...cfg,
          widgets: (cfg.widgets || []).map((w) => ({
            ...w,
            label: String(w.label || '').replace(/^e-İnfak/, profile.name),
          })),
        },
      ];
    }
    return plugin;
  });

  expo.extra = {
    ...(expo.extra || {}),
    tenant: tenantKey,
  };

  return expo;
};
