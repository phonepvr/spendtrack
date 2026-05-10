import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, '..', 'public');
mkdirSync(PUBLIC_DIR, { recursive: true });

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function paintIcon(size, opts) {
  const { bg, fg, accent, padding } = opts;
  const data = Buffer.alloc(size * size * 4);
  const pad = Math.floor(size * padding);
  const inner = size - 2 * pad;
  const cornerRadius = Math.floor(inner * 0.2);

  const bgRgba = parseHex(bg);
  const fgRgba = parseHex(fg);
  const accentRgba = parseHex(accent);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      data[i] = bgRgba[0];
      data[i + 1] = bgRgba[1];
      data[i + 2] = bgRgba[2];
      data[i + 3] = bgRgba[3];
    }
  }

  // rounded square inset
  for (let y = pad; y < size - pad; y++) {
    for (let x = pad; x < size - pad; x++) {
      const dx = Math.max(pad + cornerRadius - x, x - (size - pad - cornerRadius - 1), 0);
      const dy = Math.max(pad + cornerRadius - y, y - (size - pad - cornerRadius - 1), 0);
      if (dx * dx + dy * dy > cornerRadius * cornerRadius) continue;
      const i = (y * size + x) * 4;
      data[i] = fgRgba[0];
      data[i + 1] = fgRgba[1];
      data[i + 2] = fgRgba[2];
      data[i + 3] = fgRgba[3];
    }
  }

  // two stacked horizontal bars to evoke "split"
  const barH = Math.max(2, Math.floor(inner * 0.13));
  const gap = Math.max(2, Math.floor(inner * 0.08));
  const totalH = barH * 2 + gap;
  const startY = Math.floor((size - totalH) / 2);
  const barLeft = pad + Math.floor(inner * 0.18);
  const bar1Right = pad + Math.floor(inner * 0.78);
  const bar2Right = pad + Math.floor(inner * 0.62);

  for (let y = startY; y < startY + barH; y++) {
    for (let x = barLeft; x < bar1Right; x++) {
      const i = (y * size + x) * 4;
      data[i] = accentRgba[0];
      data[i + 1] = accentRgba[1];
      data[i + 2] = accentRgba[2];
      data[i + 3] = accentRgba[3];
    }
  }
  for (let y = startY + barH + gap; y < startY + barH + gap + barH; y++) {
    for (let x = barLeft; x < bar2Right; x++) {
      const i = (y * size + x) * 4;
      data[i] = accentRgba[0];
      data[i + 1] = accentRgba[1];
      data[i + 2] = accentRgba[2];
      data[i + 3] = accentRgba[3];
    }
  }

  return data;
}

function parseHex(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
  return [r, g, b, a];
}

function rgbaToPng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const compressed = deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const palette = {
  bg: '#0f172a',
  fg: '#1e293b',
  accent: '#34d399',
};

const variants = [
  { name: 'icon-192.png', size: 192, padding: 0.12 },
  { name: 'icon-512.png', size: 512, padding: 0.12 },
  { name: 'icon-512-maskable.png', size: 512, padding: 0.22 },
  { name: 'apple-touch-icon.png', size: 180, padding: 0.1 },
];

for (const v of variants) {
  const rgba = paintIcon(v.size, { ...palette, padding: v.padding });
  const png = rgbaToPng(v.size, v.size, rgba);
  const out = resolve(PUBLIC_DIR, v.name);
  writeFileSync(out, png);
  console.log('wrote', out, png.length, 'bytes');
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${palette.bg}"/>
  <rect x="8" y="8" width="48" height="48" rx="10" fill="${palette.fg}"/>
  <rect x="16" y="24" width="36" height="6" rx="2" fill="${palette.accent}"/>
  <rect x="16" y="34" width="26" height="6" rx="2" fill="${palette.accent}"/>
</svg>
`;
writeFileSync(resolve(PUBLIC_DIR, 'favicon.svg'), favicon);
console.log('wrote favicon.svg');
