const fs = require('fs');
const path = require('path');

const TENANT_PROFILES = {
  hakder: {
    name: 'HAKDER',
    slug: 'e-infak',
    scheme: 'hakder',
    icon: './assets/tenants/hakder/icon.png',
    splashImage: './assets/tenants/hakder/splash.png',
    adaptiveIcon: './assets/tenants/hakder/adaptive-icon.png',
    primaryColor: '#00533C',
    androidPackage: 'org.hakder.mobile',
    iosBundleId: 'org.hakder.mobile',
    iosGroupId: 'group.org.hakder.mobile',
    widgetPrefix: 'HAKDER',
  },
};

module.exports = ({ config }) => {
  const tenantKey = (process.env.EXPO_PUBLIC_TENANT || '').trim().toLowerCase();
  const profile = TENANT_PROFILES[tenantKey];

  if (!profile) {
    return config;
  }

  const expo = JSON.parse(JSON.stringify(config));
  expo.name = profile.name;
  expo.scheme = profile.scheme;
  expo.icon = profile.icon;
  expo.ios = {
    ...(expo.ios || {}),
    bundleIdentifier: profile.iosBundleId,
  };
  expo.android = {
    ...(expo.android || {}),
    package: profile.androidPackage,
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: profile.adaptiveIcon,
      backgroundColor: '#FFFFFF',
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
      // Logo koyu yeşil; beyaz zeminde okunur.
      return ['expo-splash-screen', { ...(plugin[1] || {}), image: profile.splashImage, backgroundColor: '#FFFFFF' }];
    }
    if (Array.isArray(plugin) && plugin[0] === 'expo-widgets') {
      return ['expo-widgets', { ...(plugin[1] || {}), groupIdentifier: profile.iosGroupId }];
    }
    if (Array.isArray(plugin) && plugin[0] === 'react-native-android-widget') {
      const cfg = plugin[1] || {};
      return [
        'react-native-android-widget',
        {
          ...cfg,
          widgets: (cfg.widgets || []).map((w) => ({
            ...w,
            label: String(w.label || '').replace(/^e-İnfak/, profile.widgetPrefix),
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
