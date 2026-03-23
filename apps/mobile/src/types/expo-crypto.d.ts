declare module 'expo-crypto' {
  export function digestStringAsync(
    algorithm: string,
    data: string,
    options?: { encoding?: string }
  ): Promise<string>;

  export const CryptoDigestAlgorithm: {
    SHA256: string;
    SHA512: string;
    MD5: string;
    SHA1: string;
    SHA384: string;
  };

  export function getRandomBytes(byteCount: number): Uint8Array;
  export function getRandomBytesAsync(byteCount: number): Promise<Uint8Array>;
  export function randomUUID(): string;
}
