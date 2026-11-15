const { withMainActivity, withMainApplication } = require("expo/config-plugins");

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
  return config;
};
