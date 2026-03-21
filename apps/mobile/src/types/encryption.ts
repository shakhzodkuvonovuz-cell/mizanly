export interface EncryptionKeyInfo {
  userId: string;
  publicKey: string;
  fingerprint: string;
}

export interface KeyEnvelope {
  conversationId: string;
  senderId?: string;
  encryptedKey: string;
  nonce: string;
  version: number;
}

export interface EncryptedPayload {
  ciphertext: string;  // base64
  nonce: string;       // base64
}
