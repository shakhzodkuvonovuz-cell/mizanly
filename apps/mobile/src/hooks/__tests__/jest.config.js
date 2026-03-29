/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: '../../..',
  testMatch: ['<rootDir>/src/hooks/__tests__/**/*.test.ts', '<rootDir>/src/services/__tests__/callkit.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        target: 'ES2022',
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        strict: false,
        jsx: 'react',
        skipLibCheck: true,
      },
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  moduleDirectories: ['node_modules', '../../node_modules'],
};
