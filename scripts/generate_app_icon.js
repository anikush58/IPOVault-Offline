const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// PNG CRC calculation
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
    rawData[offset++] = 0; // filter None
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

// Distance to rounded rectangle
function sdRoundedBox(px, py, bx, by, bw, bh, rad) {
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  const dx = Math.abs(px - cx) - (bw / 2 - rad);
  const dy = Math.abs(py - cy) - (bh / 2 - rad);
  const outsideDist = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  const insideDist = Math.min(Math.max(dx, dy), 0);
  return outsideDist + insideDist - rad;
}

function renderAppIcon(x, y, w, h, transparentBg = false) {
  const scale = w / 1024;

  // Base background
  let r = 15, g = 23, b = 42, a = 255; // #0F172A

  if (transparentBg) {
    r = 0; g = 0; b = 0; a = 0;
  } else {
    // Subtle radial light gradient
    const centerDist = Math.hypot(x - w / 2, y - h * 0.4) / (w * 0.7);
    if (centerDist < 1.0) {
      const glow = (1 - centerDist) * 0.15;
      r = Math.min(255, r + 255 * glow * 0.2);
      g = Math.min(255, g + 255 * glow * 0.5);
      b = Math.min(255, b + 255 * glow * 0.4);
    }
  }

  // 3 Ascending Growth Bars
  // Bar 1
  const b1 = { x: 200 * scale, y: 580 * scale, w: 155 * scale, h: 260 * scale, rad: 45 * scale };
  // Bar 2
  const b2 = { x: 435 * scale, y: 390 * scale, w: 155 * scale, h: 450 * scale, rad: 45 * scale };
  // Bar 3
  const b3 = { x: 670 * scale, y: 190 * scale, w: 155 * scale, h: 650 * scale, rad: 45 * scale };

  const bars = [
    { ...b1, colStart: [5, 150, 105], colEnd: [16, 185, 129] },    // #059669 -> #10B981
    { ...b2, colStart: [16, 185, 129], colEnd: [52, 211, 153] },   // #10B981 -> #34D399
    { ...b3, colStart: [5, 150, 105], colEnd: [16, 185, 129] },    // #059669 -> #10B981
  ];

  for (const bar of bars) {
    const dist = sdRoundedBox(x, y, bar.x, bar.y, bar.w, bar.h, bar.rad);
    if (dist < 1.5) {
      const alpha = Math.max(0, Math.min(1, (1.0 - dist) / 1.5));
      const t = Math.max(0, Math.min(1, (y - bar.y) / bar.h)); // 0 top, 1 bottom
      // Vertical gradient from colEnd (top) to colStart (bottom)
      const br = bar.colEnd[0] * (1 - t) + bar.colStart[0] * t;
      const bg = bar.colEnd[1] * (1 - t) + bar.colStart[1] * t;
      const bb = bar.colEnd[2] * (1 - t) + bar.colStart[2] * t;

      r = r * (1 - alpha) + br * alpha;
      g = g * (1 - alpha) + bg * alpha;
      b = b * (1 - alpha) + bb * alpha;
      a = Math.max(a, alpha * 255);
    }
  }

  return [r, g, b, a];
}

const assetsImagesDir = path.resolve(__dirname, '..', 'assets', 'images');
const assetsDir = path.resolve(__dirname, '..', 'assets');

console.log('Generating 1024x1024 app icon assets...');

// 1. App Icon (1024x1024)
const icon1024 = createPng(1024, 1024, (x, y, w, h) => renderAppIcon(x, y, w, h, false));
fs.writeFileSync(path.join(assetsImagesDir, 'icon.png'), icon1024);
fs.writeFileSync(path.join(assetsDir, 'app-icon.png'), icon1024);

// 2. Android Adaptive Foreground (1024x1024 with icon centered with safe margin)
const androidForeground = createPng(1024, 1024, (x, y, w, h) => {
  // Center scale inside adaptive icon safe area (72% size)
  const pad = 1024 * 0.14;
  const innerW = 1024 * 0.72;
  const innerH = 1024 * 0.72;
  if (x >= pad && x < pad + innerW && y >= pad && y < pad + innerH) {
    const ix = (x - pad) * (1024 / innerW);
    const iy = (y - pad) * (1024 / innerH);
    return renderAppIcon(ix, iy, 1024, 1024, false);
  }
  return [0, 0, 0, 0];
});
fs.writeFileSync(path.join(assetsImagesDir, 'android-icon-foreground.png'), androidForeground);

// 3. Web Favicon (512x512)
const favicon512 = createPng(512, 512, (x, y, w, h) => renderAppIcon(x, y, w, h, false));
fs.writeFileSync(path.join(assetsImagesDir, 'favicon.png'), favicon512);

console.log('App icon assets generated successfully in assets/ and assets/images/.');
