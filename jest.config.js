export default {
  globalSetup: process.env.SKIP_SETUP ? undefined : './tests/setup/jest.setup.js',
  globalTeardown: process.env.SKIP_TEARDOWN ? undefined : './tests/setup/jest.teardown.js',
  testEnvironment: 'node',
  testTimeout: 30000
}
