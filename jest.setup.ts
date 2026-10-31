
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Native SQLite is unavailable under Jest; tests inject an in-memory database via setDatabaseForTesting.
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => {
    throw new Error('expo-sqlite is not available in tests; call setDatabaseForTesting().');
  }),
}));
