export const CLOUD_VAULT_ENVELOPE_VERSION = 1 as const;
export const CLOUD_VAULT_PAYLOAD_CIPHER = 'AES-256-GCM' as const;
export const CLOUD_VAULT_PASSWORD_KDF = 'Argon2id' as const;

export interface CloudVaultKdfDescriptor {
  algorithm: typeof CLOUD_VAULT_PASSWORD_KDF;
  salt: string;
  memoryKiB: number;
  iterations: number;
  parallelism: number;
}

export interface CloudVaultWrappedKey {
  algorithm: typeof CLOUD_VAULT_PAYLOAD_CIPHER;
  nonce: string;
  ciphertext: string;
}

export interface CloudVaultCiphertext {
  algorithm: typeof CLOUD_VAULT_PAYLOAD_CIPHER;
  nonce: string;
  ciphertext: string;
}

export interface CloudVaultEnvelopeV1 {
  version: typeof CLOUD_VAULT_ENVELOPE_VERSION;
  kdf: CloudVaultKdfDescriptor;
  wrappedVaultKey: CloudVaultWrappedKey;
  payload: CloudVaultCiphertext;
  updatedAt: string;
}

export const FORBIDDEN_PLAINTEXT_CLOUD_CONNECTION_FIELDS = [
  'name',
  'host',
  'port',
  'username',
  'password',
  'databaseName',
  'databases',
  'connectorUrl',
  'baseUrl'
] as const;
