module.exports = {
  extends: ['next/core-web-vitals', 'prettier'],
  rules: {
    // Organisation images come from any host they type in (logos, covers, CMS media); next/image
    // needs every host configured, so plain <img loading="lazy"> is used on purpose.
    '@next/next/no-img-element': 'off',
  },
}
