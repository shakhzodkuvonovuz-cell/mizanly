declare module 'tweetnacl' {
  export interface BoxKeyPair {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  }

  const nacl: {
    box: {
      (message: Uint8Array, nonce: Uint8Array, theirPublicKey: Uint8Array, mySecretKey: Uint8Array): Uint8Array;
      keyPair: {
        (): BoxKeyPair;
        fromSecretKey(secretKey: Uint8Array): BoxKeyPair;
      };
      open(box: Uint8Array, nonce: Uint8Array, theirPublicKey: Uint8Array, mySecretKey: Uint8Array): Uint8Array | null;
    };
    secretbox: {
      (message: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array;
      open(box: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array | null;
    };
    randomBytes(length: number): Uint8Array;
  };

  export default nacl;
  export type { BoxKeyPair };
}

declare module 'tweetnacl-util' {
  const naclUtil: {
    decodeBase64(s: string): Uint8Array;
    encodeBase64(arr: Uint8Array): string;
    decodeUTF8(s: string): Uint8Array;
    encodeUTF8(arr: Uint8Array): string;
  };
  export default naclUtil;
}
