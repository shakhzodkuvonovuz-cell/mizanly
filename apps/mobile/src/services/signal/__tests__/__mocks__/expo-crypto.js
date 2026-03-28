const crypto = require('crypto');

module.exports = {
  getRandomBytes: (length) => new Uint8Array(crypto.randomBytes(length)),
  getRandomValues: (arr) => {
    const bytes = crypto.randomBytes(arr.length);
    arr.set(new Uint8Array(bytes));
    return arr;
  },
};
