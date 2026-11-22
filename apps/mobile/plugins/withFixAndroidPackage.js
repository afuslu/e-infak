function fixPackage(contents, pkg) {
  return contents.replace(/^package\s+[^\s;]+/m, `package ${pkg}`);
}

function loadConfigPlugins() {
  for (const mod of ["expo/config-plugins", "@expo/config-plugins"]) {
    try {
      return require(mod);
    } catch {
      // Module may not be installed yet during EAS READ_APP_CONFIG phase.
    }
  }
  return null;
}

module.exports = function withFixAndroidPackage(config) {
  const cp = loadConfigPlugins();
  if (!cp) return config;

  const { withMainActivity, withMainApplication, withAndroidManifest } = cp;
  const pkg = config.android?.package || "org.einfak.app";

  config = withMainActivity(config, (c) => {
    c.modResults.contents = fixPackage(c.modResults.contents, pkg);
    return c;
  });
  config = withMainApplication(config, (c) => {
    c.modResults.contents = fixPackage(c.modResults.contents, pkg);
    return c;
  });
  config = withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;
    manifest["uses-feature"] = manifest["uses-feature"] || [];
    if (!manifest["uses-feature"].some((f) => f.$?.["android:name"] === "android.hardware.screen.portrait")) {
      manifest["uses-feature"].push({
        $: { "android:name": "android.hardware.screen.portrait", "android:required": "false" },
      });
    }
    return c;
  });
  return config;
};
