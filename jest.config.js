/** @type {import('jest').Config} */
const moduleNameMapper = {
  '^@/(.*)$': '<rootDir>/src/$1',
  '^@engines/(.*)$': '<rootDir>/supabase/functions/_shared/engines/$1',
};

module.exports = {
  projects: [
    {
      displayName: 'unit',
      preset: 'jest-expo/node',
      testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/supabase/functions/**/*.test.ts'],
      moduleNameMapper,
    },
    {
      displayName: 'ui',
      preset: 'jest-expo/ios',
      testMatch: ['<rootDir>/src/**/*.test.tsx'],
      setupFiles: ['<rootDir>/jest.setup.ui.js'],
      moduleNameMapper,
    },
    {
      // Requires a database prepared by scripts/db-test.sh (npm run test:db).
      displayName: 'db',
      preset: 'jest-expo/node',
      testMatch: ['<rootDir>/tests/db/**/*.test.ts'],
      moduleNameMapper,
    },
  ],
};
