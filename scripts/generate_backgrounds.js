const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// PNG CRC calculation table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const length = data.length;
  const chunk = Buffer.alloc(4 + 4 + length + 4);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.slice(4, 8 + length));
  chunk.writeUInt32BE(crc, 8 + length);
  return chunk;
}

function createPng(width, height, drawFn) {
  const bytesPerPixel = 4; // RGBA
  const rawData = Buffer.alloc(height * (width * bytesPerPixel + 1));

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawFn(x, y, width, height);
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(r)));
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(g)));
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(b)));
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(a)));
    }
  }

  const compressedData = zlib.deflateSync(rawData, { level: 9 });

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const W = 840;
const H = 1870;

// Ensure output directories exist
const assetsDir = path.resolve(__dirname, '..', 'assets', 'images');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// 1. Auth Screen Light Background (Soft flowing mint & emerald curved aura from top)
console.log('Generating auth-bg.png...');
const authBgLight = createPng(W, H, (x, y, w, h) => {
  // Base background: clean crisp soft white-gray (#F8FAFC)
  let r = 248, g = 250, b = 252, a = 255;

  const nx = x / w;
  const ny = y / h;

  // Organic Top-Right Cyan/Teal glow: Center at (0.85, 0.08), radius 0.55
  const dist1 = Math.hypot(nx - 0.85, ny - 0.06);
  if (dist1 < 0.6) {
    const intensity = Math.pow(1 - dist1 / 0.6, 2) * 0.45;
    // Mint / Emerald (#10B981 -> #00D084)
    r = r * (1 - intensity) + 16 * intensity;
    g = g * (1 - intensity) + 185 * intensity;
    b = b * (1 - intensity) + 129 * intensity;
  }

  // Organic Top-Left Soft Emerald ribbon glow: Center at (0.1, 0.02), radius 0.45
  const dist2 = Math.hypot(nx - 0.1, ny - 0.02);
  if (dist2 < 0.5) {
    const intensity = Math.pow(1 - dist2 / 0.5, 2) * 0.35;
    r = r * (1 - intensity) + 52 * intensity;
    g = g * (1 - intensity) + 211 * intensity;
    b = b * (1 - intensity) + 153 * intensity;
  }

  // Center subtle ambient glow at (0.5, 0.12)
  const dist3 = Math.hypot(nx - 0.5, ny - 0.12);
  if (dist3 < 0.4) {
    const intensity = Math.pow(1 - dist3 / 0.4, 2) * 0.2;
    r = r * (1 - intensity) + 209 * intensity;
    g = g * (1 - intensity) + 250 * intensity;
    b = b * (1 - intensity) + 229 * intensity;
  }

  return [r, g, b, 255];
});
fs.writeFileSync(path.join(assetsDir, 'auth-bg.png'), authBgLight);

// 2. Auth Screen Dark Background (Deep navy/slate with glowing emerald ambient aura)
console.log('Generating auth-bg-dark.png...');
const authBgDark = createPng(W, H, (x, y, w, h) => {
  // Base background: #0B0F17
  let r = 11, g = 15, b = 23, a = 255;

  const nx = x / w;
  const ny = y / h;

  // Top-Right Emerald glow
  const dist1 = Math.hypot(nx - 0.85, ny - 0.06);
  if (dist1 < 0.65) {
    const intensity = Math.pow(1 - dist1 / 0.65, 2) * 0.35;
    r = r * (1 - intensity) + 5 * intensity;
    g = g * (1 - intensity) + 150 * intensity;
    b = b * (1 - intensity) + 105 * intensity;
  }

  // Top-Left Teal glow
  const dist2 = Math.hypot(nx - 0.1, ny - 0.03);
  if (dist2 < 0.55) {
    const intensity = Math.pow(1 - dist2 / 0.55, 2) * 0.25;
    r = r * (1 - intensity) + 16 * intensity;
    g = g * (1 - intensity) + 185 * intensity;
    b = b * (1 - intensity) + 129 * intensity;
  }

  return [r, g, b, 255];
});
fs.writeFileSync(path.join(assetsDir, 'auth-bg-dark.png'), authBgDark);

// 3. Onboarding Slide 1 Background (Discover - dynamic upward wave)
console.log('Generating onboarding-bg-1.png...');
const onbBg1 = createPng(W, H, (x, y, w, h) => {
  let r = 248, g = 250, b = 252;
  const nx = x / w;
  const ny = y / h;

  const distTop = Math.hypot(nx - 0.8, ny - 0.15);
  if (distTop < 0.65) {
    const intensity = Math.pow(1 - distTop / 0.65, 2) * 0.4;
    r = r * (1 - intensity) + 16 * intensity;
    g = g * (1 - intensity) + 185 * intensity;
    b = b * (1 - intensity) + 129 * intensity;
  }

  const distMid = Math.hypot(nx - 0.2, ny - 0.45);
  if (distMid < 0.55) {
    const intensity = Math.pow(1 - distMid / 0.55, 2) * 0.25;
    r = r * (1 - intensity) + 52 * intensity;
    g = g * (1 - intensity) + 211 * intensity;
    b = b * (1 - intensity) + 153 * intensity;
  }
  return [r, g, b, 255];
});
fs.writeFileSync(path.join(assetsDir, 'onboarding-bg-1.png'), onbBg1);

// 4. Onboarding Slide 2 Background (Apply - central fluid aura)
console.log('Generating onboarding-bg-2.png...');
const onbBg2 = createPng(W, H, (x, y, w, h) => {
  let r = 248, g = 250, b = 252;
  const nx = x / w;
  const ny = y / h;

  const dist1 = Math.hypot(nx - 0.2, ny - 0.12);
  if (dist1 < 0.6) {
    const intensity = Math.pow(1 - dist1 / 0.6, 2) * 0.4;
    r = r * (1 - intensity) + 16 * intensity;
    g = g * (1 - intensity) + 185 * intensity;
    b = b * (1 - intensity) + 129 * intensity;
  }

  const dist2 = Math.hypot(nx - 0.85, ny - 0.4);
  if (dist2 < 0.55) {
    const intensity = Math.pow(1 - dist2 / 0.55, 2) * 0.28;
    r = r * (1 - intensity) + 52 * intensity;
    g = g * (1 - intensity) + 211 * intensity;
    b = b * (1 - intensity) + 153 * intensity;
  }
  return [r, g, b, 255];
});
fs.writeFileSync(path.join(assetsDir, 'onboarding-bg-2.png'), onbBg2);

// 5. Onboarding Slide 3 Background (Track - expansive success emerald aura)
console.log('Generating onboarding-bg-3.png...');
const onbBg3 = createPng(W, H, (x, y, w, h) => {
  let r = 248, g = 250, b = 252;
  const nx = x / w;
  const ny = y / h;

  const dist1 = Math.hypot(nx - 0.5, ny - 0.2);
  if (dist1 < 0.65) {
    const intensity = Math.pow(1 - dist1 / 0.65, 2) * 0.42;
    r = r * (1 - intensity) + 16 * intensity;
    g = g * (1 - intensity) + 185 * intensity;
    b = b * (1 - intensity) + 129 * intensity;
  }

  const dist2 = Math.hypot(nx - 0.15, ny - 0.5);
  if (dist2 < 0.5) {
    const intensity = Math.pow(1 - dist2 / 0.5, 2) * 0.22;
    r = r * (1 - intensity) + 52 * intensity;
    g = g * (1 - intensity) + 211 * intensity;
    b = b * (1 - intensity) + 153 * intensity;
  }
  return [r, g, b, 255];
});
fs.writeFileSync(path.join(assetsDir, 'onboarding-bg-3.png'), onbBg3);

// 6. Onboarding Dark Background (Universal deep background)
console.log('Generating onboarding-bg-dark.png...');
const onbBgDark = createPng(W, H, (x, y, w, h) => {
  let r = 11, g = 15, b = 23;
  const nx = x / w;
  const ny = y / h;

  const distTop = Math.hypot(nx - 0.8, ny - 0.15);
  if (distTop < 0.7) {
    const intensity = Math.pow(1 - distTop / 0.7, 2) * 0.32;
    r = r * (1 - intensity) + 5 * intensity;
    g = g * (1 - intensity) + 150 * intensity;
    b = b * (1 - intensity) + 105 * intensity;
  }
  return [r, g, b, 255];
});
fs.writeFileSync(path.join(assetsDir, 'onboarding-bg-dark.png'), onbBgDark);

console.log('All full-screen background assets generated successfully.');
