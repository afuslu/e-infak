const baseConfig = require('./app.json');

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

module.exports = () => {
  const tenantKey = (process.env.EXPO_PUBLIC_TENANT || '').trim().toLowerCase();
  const profile = TENANT_PROFILES[tenantKey];

  if (!profile) {
    return baseConfig;
  }

  const expo = JSON.parse(JSON.stringify(baseConfig.expo));
  expo.name = profile.name;
  expo.scheme = profile.scheme;
  expo.icon = profile.icon;
  expo.splash = {
    ...(expo.splash || {}),
    image: profile.splashImage,
    backgroundColor: profile.primaryColor,
  };
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
  delete expo.android.googleServicesFile;

  expo.plugins = (expo.plugins || []).map((plugin) => {
    if (Array.isArray(plugin) && plugin[0] === 'expo-notifications') {
      return ['expo-notifications', { ...(plugin[1] || {}), color: profile.primaryColor }];
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

  return { expo };
};
