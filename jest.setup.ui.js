// UI test setup: Reanimated/Worklets run without native modules in Jest.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  return { ...mock, __esModule: true, useReducedMotion: () => false, default: mock.default };
});
