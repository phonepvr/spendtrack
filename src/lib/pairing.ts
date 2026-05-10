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

export interface PairingSecrets {
  passphrase: string;
  roomId: string;
  webrtcPassword: string;
  docName: string;
}

export async function deriveSecrets(passphraseInput: string): Promise<PairingSecrets> {
  const passphrase = normalizePassphrase(passphraseInput);
  const [roomBytes, passwordBytes, docBytes] = await Promise.all([
    hkdf(passphrase, SALT_ROOM, 16),
    hkdf(passphrase, SALT_PASSWORD, 32),
    hkdf(passphrase, SALT_DOC, 8),
  ]);
  return {
    passphrase,
    roomId: 'spendtrack-' + toHex(roomBytes),
    webrtcPassword: toHex(passwordBytes),
    docName: 'spendtrack-doc-' + toHex(docBytes),
  };
}

const STORAGE_KEY = 'spendtrack/pairing/v1';

export interface StoredPairing {
  passphrase: string;
  roomId: string;
  webrtcPassword: string;
  docName: string;
  createdAt: number;
}

export function loadStoredPairing(): StoredPairing | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredPairing;
  } catch {
    return null;
  }
}

export function saveStoredPairing(p: StoredPairing): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

export function clearStoredPairing(): void {
  localStorage.removeItem(STORAGE_KEY);
}
