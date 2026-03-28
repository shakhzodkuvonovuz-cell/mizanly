/** @type {import('jest').Config} */
module.exports = {
  // Don't use jest-expo — these are pure crypto tests that run in Node.js
  testEnvironment: 'node',
  rootDir: '../../../..',
  testMatch: ['<rootDir>/src/services/signal/__tests__/**/*.test.ts'],
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
    '^expo-crypto$': '<rootDir>/src/services/signal/__tests__/__mocks__/expo-crypto.js',
    '^expo-secure-store$': '<rootDir>/src/services/signal/__tests__/__mocks__/expo-secure-store.js',
    '^react-native-mmkv$': '<rootDir>/src/services/signal/__tests__/__mocks__/react-native-mmkv.js',
    '^expo-file-system$': '<rootDir>/src/services/signal/__tests__/__mocks__/expo-file-system.js',
    '^expo-notifications$': '<rootDir>/src/services/signal/__tests__/__mocks__/expo-notifications.js',
  },
};
