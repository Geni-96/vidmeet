// jest.config.js
module.exports = {
    testEnvironment: 'node', // Default environment for server tests
    testMatch: ['<rootDir>/tests/**/*.test.js'], // Match all .test.js files in the tests folder
    setupFilesAfterEnv: [], // Setup files for all tests (initially empty)
    projects: [
      {
        displayName: 'node',
        testEnvironment: 'node',
        testMatch: ['<rootDir>/tests/**/server.test.js'], // Match server tests
      },
      // {
      //   displayName: 'jsdom',
      //   testEnvironment: 'jsdom',
      //   testMatch: ['<rootDir>/tests/**/ui.test.js'], // Match UI tests
      //   setupFilesAfterEnv: [], // Setup for Jest DOM
      // },
    ],
  };