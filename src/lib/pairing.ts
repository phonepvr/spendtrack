const WORDLIST = [
  'amber', 'anchor', 'apple', 'arrow', 'autumn', 'badger', 'basil', 'beach',
  'beacon', 'birch', 'bison', 'blossom', 'breeze', 'bridge', 'bronze', 'butter',
  'cactus', 'canyon', 'cedar', 'cherry', 'cinder', 'clover', 'cobalt', 'comet',
  'copper', 'coral', 'cotton', 'crane', 'crystal', 'cypress', 'dahlia', 'daisy',
  'dawn', 'delta', 'denim', 'dolphin', 'dragon', 'driftwood', 'dune', 'ember',
  'falcon', 'fern', 'finch', 'flame', 'forest', 'fossil', 'galaxy', 'garnet',
  'ginger', 'glacier', 'granite', 'harbor', 'harvest', 'hazel', 'heron', 'horizon',
  'indigo', 'island', 'ivory', 'jade', 'jasmine', 'juniper', 'kestrel', 'lagoon',
  'lantern', 'lavender', 'lemon', 'lichen', 'lily', 'linen', 'lotus', 'lumen',
  'magnet', 'mango', 'maple', 'marble', 'meadow', 'mercury', 'mesa', 'meteor',
  'mint', 'mirror', 'moss', 'mulberry', 'nectar', 'neon', 'nimbus', 'oak',
  'ocean', 'olive', 'onyx', 'opal', 'orchid', 'otter', 'paper', 'parsley',
  'peach', 'pebble', 'pepper', 'pewter', 'phoenix', 'pine', 'plum', 'pollen',
  'poppy', 'prairie', 'quartz', 'quill', 'rain', 'raven', 'reed', 'reef',
  'ridge', 'river', 'rose', 'rust', 'saffron', 'sage', 'salt', 'sand',
  'sapphire', 'scarlet', 'shadow', 'shell', 'silk', 'silver', 'slate', 'snow',
  'solar', 'sorrel', 'spruce', 'star', 'storm', 'summer', 'sunset', 'tangerine',
  'teal', 'thistle', 'thunder', 'tide', 'tiger', 'topaz', 'tulip', 'tundra',
  'umber', 'valley', 'velvet', 'vine', 'violet', 'walnut', 'wave', 'whisper',
  'willow', 'wind', 'winter', 'wisp', 'wolf', 'wood', 'yarrow', 'zephyr',
];

const WORD_COUNT = 6;

function getRandomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

export function generatePassphrase(): string {
  const bytes = getRandomBytes(WORD_COUNT * 2);
  const words: string[] = [];
  for (let i = 0; i < WORD_COUNT; i++) {
    const idx = ((bytes[i * 2] << 8) | bytes[i * 2 + 1]) % WORDLIST.length;
    words.push(WORDLIST[idx]);
  }
  return words.join('-');
}

export function normalizePassphrase(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s,]+/g, '-')
    .replace(/-+/g, '-');
}

export function isValidPassphrase(input: string): boolean {
  const parts = normalizePassphrase(input).split('-').filter(Boolean);
  if (parts.length < 4) return false;
  return parts.every((w) => /^[a-z]{2,16}$/.test(w));
}

const SALT_ROOM = 'spendtrack/v1/room';
const SALT_PASSWORD = 'spendtrack/v1/password';
const SALT_DOC = 'spendtrack/v1/doc';
const SALT_FILE = 'spendtrack/v1/file';
const SALT_HINT = 'spendtrack/v1/hint';

async function hkdf(passphrase: string, salt: string, length: number): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'HKDF',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode(salt),
      info: enc.encode('spendtrack-pairing'),
    },
    keyMaterial,
    length * 8,
  );
  return new Uint8Array(bits);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function derivePairingHint(passphraseInput: string): Promise<string> {
  const passphrase = normalizePassphrase(passphraseInput);
  const bytes = await hkdf(passphrase, SALT_HINT, 4);
  return bytesToBase64Url(bytes);
}

export async function deriveFileKey(passphraseInput: string): Promise<CryptoKey> {
  const passphrase = normalizePassphrase(passphraseInput);
  const raw = await hkdf(passphrase, SALT_FILE, 32);
  return crypto.subtle.importKey(
    'raw',
    raw.slice(),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface PairingSecrets {
  passphrase: string;
  roomId: string;
  webrtcPassword: string;
  docName: string;
  pairingHint: string;
}

export async function deriveSecrets(passphraseInput: string): Promise<PairingSecrets> {
  const passphrase = normalizePassphrase(passphraseInput);
  const [roomBytes, passwordBytes, docBytes, hintBytes] = await Promise.all([
    hkdf(passphrase, SALT_ROOM, 16),
    hkdf(passphrase, SALT_PASSWORD, 32),
    hkdf(passphrase, SALT_DOC, 8),
    hkdf(passphrase, SALT_HINT, 4),
  ]);
  return {
    passphrase,
    roomId: 'spendtrack-' + toHex(roomBytes),
    webrtcPassword: toHex(passwordBytes),
    docName: 'spendtrack-doc-' + toHex(docBytes),
    pairingHint: bytesToBase64Url(hintBytes),
  };
}

const STORAGE_KEY = 'spendtrack/pairing/v2';
const LEGACY_STORAGE_KEY = 'spendtrack/pairing/v1';
const KEYSTORE_DB = 'spendtrack-keystore';
const KEYSTORE_STORE = 'keys';
const KEY_ID = 'pairing-aes-v1';

export interface StoredPairing {
  passphrase: string;
  roomId: string;
  webrtcPassword: string;
  docName: string;
  pairingHint: string;
  createdAt: number;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function openKeyStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KEYSTORE_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(KEYSTORE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getOrCreateWrappingKey(): Promise<CryptoKey> {
  const db = await openKeyStore();
  try {
    const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
      const tx = db.transaction(KEYSTORE_STORE, 'readonly');
      const req = tx.objectStore(KEYSTORE_STORE).get(KEY_ID);
      req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
      req.onerror = () => reject(req.error);
    });
    if (existing) return existing;
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(KEYSTORE_STORE, 'readwrite');
      tx.objectStore(KEYSTORE_STORE).put(key, KEY_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return key;
  } finally {
    db.close();
  }
}

async function encryptBlob(plain: string): Promise<string> {
  const key = await getOrCreateWrappingKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain),
  );
  const combined = new Uint8Array(iv.byteLength + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.byteLength);
  return bytesToBase64(combined);
}

async function decryptBlob(b64: string): Promise<string> {
  const key = await getOrCreateWrappingKey();
  const data = base64ToBytes(b64);
  const iv = data.slice(0, 12);
  const cipher = data.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

async function backfill(p: StoredPairing): Promise<StoredPairing> {
  if (p.pairingHint) return p;
  const hint = await derivePairingHint(p.passphrase);
  return { ...p, pairingHint: hint };
}

export async function loadStoredPairing(): Promise<StoredPairing | null> {
  try {
    const ciphertext = localStorage.getItem(STORAGE_KEY);
    if (ciphertext) {
      const plain = await decryptBlob(ciphertext);
      const filled = await backfill(JSON.parse(plain) as StoredPairing);
      return filled;
    }
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed = await backfill(JSON.parse(legacy) as StoredPairing);
      try {
        await saveStoredPairing(parsed);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        /* migration best-effort; keep legacy as fallback */
      }
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveStoredPairing(p: StoredPairing): Promise<void> {
  const ciphertext = await encryptBlob(JSON.stringify(p));
  localStorage.setItem(STORAGE_KEY, ciphertext);
}

export function clearStoredPairing(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}
