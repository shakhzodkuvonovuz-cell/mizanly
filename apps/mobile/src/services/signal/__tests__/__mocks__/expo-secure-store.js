// In-memory SecureStore mock for testing
const store = new Map();

module.exports = {
  getItemAsync: async (key) => store.get(key) ?? null,
  setItemAsync: async (key, value) => { store.set(key, value); },
  deleteItemAsync: async (key) => { store.delete(key); },
  // Test helper: reset all stored values
  __reset: () => store.clear(),
  __getStore: () => store,
};
