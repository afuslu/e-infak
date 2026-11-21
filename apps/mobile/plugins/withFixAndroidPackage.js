let cp;
try {
  cp = require("expo/config-plugins");
} catch {
  cp = require("@expo/config-plugins");
}
const { withMainActivity, withMainApplication, withAndroidManifest } = cp;

function fixPackage(contents, pkg) {
  return contents.replace(/^package\s+[^\s;]+/m, `package ${pkg}`);
}

module.exports = function withFixAndroidPackage(config) {
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
