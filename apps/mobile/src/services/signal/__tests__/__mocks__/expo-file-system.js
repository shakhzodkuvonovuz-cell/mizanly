// In-memory FileSystem mock for testing media encryption
const files = new Map();
// Optional size overrides: uri -> number (for testing large files without allocating memory)
const sizeOverrides = new Map();

// Overridable function implementations (allows tests to replace behavior)
const overrides = {
  uploadAsync: null,
  createDownloadResumable: null,
  deleteAsync: null,
};

module.exports = {
  cacheDirectory: '/tmp/test-cache/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  FileSystemUploadType: { BINARY_CONTENT: 0 },

  getInfoAsync: async (uri, options) => {
    if (sizeOverrides.has(uri)) {
      return { exists: true, size: sizeOverrides.get(uri) };
    }
    const data = files.get(uri);
    if (data === undefined) return { exists: false };
    const decoded = Buffer.from(data, 'base64');
    return { exists: true, size: decoded.length };
  },

  readAsStringAsync: async (uri, options) => {
    const data = files.get(uri);
    if (!data) throw new Error(`File not found: ${uri}`);
    if (options?.encoding === 'base64') {
      const buf = Buffer.from(data, 'base64');
      const start = options.position ?? 0;
      const end = options.length ? start + options.length : buf.length;
      return buf.slice(start, end).toString('base64');
    }
    return data;
  },

  writeAsStringAsync: async (uri, content, options) => {
    if (options?.encoding === 'base64') {
      // Overwrite (matches real expo-file-system behavior)
      files.set(uri, content);
    } else {
      files.set(uri, content);
    }
  },

  deleteAsync: async (uri, opts) => {
    if (overrides.deleteAsync) return overrides.deleteAsync(uri, opts);
    files.delete(uri);
  },
  uploadAsync: async (url, fileUri, opts) => {
    if (overrides.uploadAsync) return overrides.uploadAsync(url, fileUri, opts);
    return { status: 200, headers: {}, body: '', mimeType: null };
  },
  createDownloadResumable: (url, localUri, options, cb) => {
    if (overrides.createDownloadResumable) return overrides.createDownloadResumable(url, localUri, options, cb);
    return {
      downloadAsync: async () => {
        files.set(localUri, files.get(url) ?? '');
        cb?.({ totalBytesWritten: 100, totalBytesExpectedToWrite: 100 });
        return { status: 200 };
      },
    };
  },

  // Test helpers
  __reset: () => {
    files.clear();
    sizeOverrides.clear();
    overrides.uploadAsync = null;
    overrides.createDownloadResumable = null;
    overrides.deleteAsync = null;
  },
  __setFile: (uri, base64Content) => files.set(uri, base64Content),
  __getFile: (uri) => files.get(uri),
  __getFiles: () => files,
  __setSizeOverride: (uri, size) => sizeOverrides.set(uri, size),
  __clearSizeOverride: (uri) => sizeOverrides.delete(uri),
  __setUploadAsync: (fn) => { overrides.uploadAsync = fn; },
  __setCreateDownloadResumable: (fn) => { overrides.createDownloadResumable = fn; },
  __setDeleteAsync: (fn) => { overrides.deleteAsync = fn; },
};
