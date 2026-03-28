// In-memory MMKV mock for testing
class MockMMKV {
  constructor(config) {
    this._data = new Map();
    this._id = config?.id ?? 'default';
  }

  set(key, value) { this._data.set(key, value); }
  getString(key) { return this._data.get(key) ?? undefined; }
  getNumber(key) { return this._data.get(key) ?? undefined; }
  getBoolean(key) { return this._data.get(key) ?? undefined; }
  delete(key) { this._data.delete(key); }
  contains(key) { return this._data.has(key); }
  getAllKeys() { return Array.from(this._data.keys()); }
  clearAll() { this._data.clear(); }
}

module.exports = { MMKV: MockMMKV };
