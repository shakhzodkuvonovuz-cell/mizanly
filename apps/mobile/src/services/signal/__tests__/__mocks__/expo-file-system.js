// In-memory FileSystem mock for testing media encryption
const files = new Map();

module.exports = {
  cacheDirectory: '/tmp/test-cache/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  FileSystemUploadType: { BINARY_CONTENT: 0 },

  getInfoAsync: async (uri, options) => {
    const data = files.get(uri);
    if (!data) return { exists: false };
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

  deleteAsync: async (uri) => { files.delete(uri); },
  uploadAsync: async () => ({ status: 200 }),
  createDownloadResumable: (url, localUri, options, cb) => ({
    downloadAsync: async () => {
      files.set(localUri, files.get(url) ?? '');
      cb?.({ totalBytesWritten: 100, totalBytesExpectedToWrite: 100 });
      return { status: 200 };
    },
  }),

  // Test helpers
  __reset: () => files.clear(),
  __setFile: (uri, base64Content) => files.set(uri, base64Content),
  __getFile: (uri) => files.get(uri),
  __getFiles: () => files,
};
