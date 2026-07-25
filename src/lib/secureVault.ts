import type { DatabaseServerConfig } from 'types';

const DATABASE_NAME = 'coreor-secure-vault';
const DATABASE_VERSION = 1;
const KEY_STORE = 'account-keys';
const VAULT_STORE = 'server-vaults';
const VAULT_VERSION = 1;

const accountKeyPromises = new Map<string, Promise<CryptoKey>>();

interface StoredAccountKey {
  accountId: string;
  key: CryptoKey;
  createdAt: string;
}

interface StoredServerVault {
  accountId: string;
  version: number;
  iv: string;
  ciphertext: string;
  updatedAt: string;
}

function assertBrowserCrypto() {
  if (typeof window === 'undefined' || !window.indexedDB || !window.crypto?.subtle) {
    throw new Error('Güvenli tarayıcı kasası bu ortamda kullanılamıyor.');
  }
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB isteği başarısız oldu.'));
  });
}

function transactionToPromise(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB işlemi başarısız oldu.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB işlemi iptal edildi.'));
  });
}

function openVaultDatabase() {
  assertBrowserCrypto();

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(KEY_STORE)) {
        database.createObjectStore(KEY_STORE, { keyPath: 'accountId' });
      }

      if (!database.objectStoreNames.contains(VAULT_STORE)) {
        database.createObjectStore(VAULT_STORE, { keyPath: 'accountId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Güvenli kasa açılamadı.'));
  });
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return window.btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function additionalAuthenticatedData(accountId: string) {
  return new TextEncoder().encode(`coreor:database-servers:${accountId}:v${VAULT_VERSION}`);
}

async function loadOrCreateAccountKey(accountId: string) {
  const database = await openVaultDatabase();

  try {
    const readTransaction = database.transaction(KEY_STORE, 'readonly');
    const readCompleted = transactionToPromise(readTransaction);
    const storedKey = await requestToPromise<StoredAccountKey | undefined>(readTransaction.objectStore(KEY_STORE).get(accountId));
    await readCompleted;

    if (storedKey?.key) {
      return storedKey.key;
    }

    const key = await window.crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      false,
      ['encrypt', 'decrypt']
    );

    const writeTransaction = database.transaction(KEY_STORE, 'readwrite');
    const writeCompleted = transactionToPromise(writeTransaction);
    writeTransaction.objectStore(KEY_STORE).put({
      accountId,
      key,
      createdAt: new Date().toISOString()
    } satisfies StoredAccountKey);
    await writeCompleted;

    return key;
  } finally {
    database.close();
  }
}

function getOrCreateAccountKey(accountId: string) {
  const existingPromise = accountKeyPromises.get(accountId);

  if (existingPromise) {
    return existingPromise;
  }

  const keyPromise = loadOrCreateAccountKey(accountId).catch(error => {
    accountKeyPromises.delete(accountId);
    throw error;
  });

  accountKeyPromises.set(accountId, keyPromise);
  return keyPromise;
}

export async function readEncryptedServerProfiles(accountId: string) {
  if (!accountId) {
    return [];
  }

  const database = await openVaultDatabase();

  try {
    const transaction = database.transaction(VAULT_STORE, 'readonly');
    const completed = transactionToPromise(transaction);
    const vault = await requestToPromise<StoredServerVault | undefined>(transaction.objectStore(VAULT_STORE).get(accountId));
    await completed;

    if (!vault) {
      return [];
    }

    if (vault.version !== VAULT_VERSION) {
      throw new Error('Sunucu kasası sürümü desteklenmiyor.');
    }

    const key = await getOrCreateAccountKey(accountId);
    const plaintext = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(vault.iv),
        additionalData: additionalAuthenticatedData(accountId)
      },
      key,
      base64ToBytes(vault.ciphertext)
    );

    const parsed = JSON.parse(new TextDecoder().decode(plaintext));

    if (!Array.isArray(parsed)) {
      throw new Error('Sunucu kasası içeriği geçersiz.');
    }

    return parsed as DatabaseServerConfig[];
  } catch (error) {
    if (error instanceof DOMException && error.name === 'OperationError') {
      throw new Error('Şifreli sunucu kasası doğrulanamadı veya bozulmuş.');
    }

    throw error;
  } finally {
    database.close();
  }
}

export async function writeEncryptedServerProfiles(accountId: string, servers: DatabaseServerConfig[]) {
  if (!accountId) {
    throw new Error('Sunucu profili kaydetmek için kullanıcı oturumu gerekli.');
  }

  const key = await getOrCreateAccountKey(accountId);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(servers));
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: additionalAuthenticatedData(accountId)
    },
    key,
    plaintext
  );

  const database = await openVaultDatabase();

  try {
    const transaction = database.transaction(VAULT_STORE, 'readwrite');
    const completed = transactionToPromise(transaction);
    transaction.objectStore(VAULT_STORE).put({
      accountId,
      version: VAULT_VERSION,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      updatedAt: new Date().toISOString()
    } satisfies StoredServerVault);
    await completed;
  } finally {
    database.close();
  }
}
