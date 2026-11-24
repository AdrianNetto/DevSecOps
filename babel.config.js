// Used only by Jest (babel-jest): converts the ESM-only parser packages that sanitize-html depends on to CommonJS.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
};
