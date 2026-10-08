// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  // Archived browser transcripts are evidence, not independently executable modules.
  { ignores: ["dist*/**", "docs/**"] },
  { files: ["**/*.cjs"], languageOptions: { globals: { __dirname: "readonly", Buffer: "readonly" } } },
  { files: ["tests/**/*.cjs"], languageOptions: { globals: { __w3: "readonly", __w4: "readonly" } } },
  // The static auth handoff deliberately remains ES5-compatible.
  { files: ["public/auth-return.js"], rules: { "no-var": "off" } },
]);
