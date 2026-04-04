/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: '../../..',
  testMatch: ['<rootDir>/src/services/__tests__/offlineMessageQueue.test.ts'],
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
    '^react-native-mmkv$': '<rootDir>/src/services/signal/__tests__/__mocks__/react-native-mmkv.js',
  },
};
