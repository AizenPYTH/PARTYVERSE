// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    files: ['jest.setup.*.js', 'tests/**/*.{js,mjs,ts}', 'scripts/**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },
  {
    ignores: ['dist/*', '.cache/*', 'supabase/functions/*', 'tests/e2e/artifacts/*'],
  },
]);
