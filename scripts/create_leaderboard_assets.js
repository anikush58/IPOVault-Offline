const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

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

  const compressedData = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: 6 (RGBA)
  ihdr[10] = 0; // Compression: 0
  ihdr[11] = 0; // Filter: 0
  ihdr[12] = 0; // Interlace: 0

  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
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

// CRC32 implementation
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Output directories
const dirs = [
  path.join(__dirname, '..', 'assets', 'leaderboard'),
  path.join(__dirname, '..', 'assets', 'images', 'leaderboard'),
];

for (const dir of dirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 1. Crown Asset (width: 96, height: 60)
const crownPng = createPng(96, 60, (x, y, w, h) => {
  // Center coordinates
  const nx = (x / w) * 2 - 1; // -1 to 1
  const ny = y / h; // 0 (top) to 1 (bottom)

  // Crown shape logic
  // Base at bottom (ny: 0.75 to 0.95, nx: -0.75 to 0.75)
  if (ny > 0.75 && ny < 0.95 && Math.abs(nx) < 0.8) {
    const isGold = ny < 0.88;
    return isGold ? [251, 191, 36, 255] : [217, 119, 6, 255];
  }

  // 3 main peaks: center (nx = 0, ny = 0.15), left (nx = -0.55, ny = 0.35), right (nx = 0.55, ny = 0.35)
  const dCenter = Math.hypot(nx, ny - 0.15);
  const dLeft = Math.hypot(nx + 0.55, ny - 0.35);
  const dRight = Math.hypot(nx - 0.55, ny - 0.35);

  // Peak jewel balls
  if (dCenter < 0.1 || dLeft < 0.08 || dRight < 0.08) {
    return [254, 240, 138, 255];
  }

  // Body of crown
  const inCenterPeak = Math.abs(nx) < 0.25 * (1 - (ny - 0.15) / 0.65) && ny >= 0.15 && ny <= 0.8;
  const inLeftPeak = Math.abs(nx + 0.55) < 0.25 * (1 - (ny - 0.35) / 0.45) && ny >= 0.35 && ny <= 0.8;
  const inRightPeak = Math.abs(nx - 0.55) < 0.25 * (1 - (ny - 0.35) / 0.45) && ny >= 0.35 && ny <= 0.8;
  const inConnectors = ny > 0.5 && ny <= 0.8 && Math.abs(nx) < 0.75;

  if (inCenterPeak || inLeftPeak || inRightPeak || inConnectors) {
    const grad = 1 - (ny - 0.15) / 0.75;
    return [
      245 + 10 * grad,
      158 + 33 * grad,
      11 + 25 * grad,
      255
    ];
  }

  return [0, 0, 0, 0];
});

// 2. Laurel Leaf Asset (Left & Right, width: 44, height: 144)
function makeLaurel(isFlip) {
  return createPng(44, 144, (x, y, w, h) => {
    let px = isFlip ? (w - 1 - x) : x;
    let py = y;
    const nx = px / w; // 0 to 1
    const ny = py / h; // 0 to 1

    // Curved stem: x roughly = 0.7 - 0.3 * sin(ny * PI)
    const stemX = 0.75 - 0.35 * Math.sin(ny * Math.PI);
    const distStem = Math.abs(nx - stemX);

    if (distStem < 0.06 && ny > 0.05 && ny < 0.95) {
      return [217, 119, 6, 255];
    }

    // 4 leaf pairs along stem
    const leafNodes = [0.12, 0.32, 0.55, 0.78];
    for (const lny of leafNodes) {
      const lx = 0.75 - 0.35 * Math.sin(lny * Math.PI);
      const d1 = Math.hypot(nx - (lx - 0.3), ny - (lny - 0.04));
      const d2 = Math.hypot(nx - (lx + 0.1), ny - (lny + 0.04));
      if (d1 < 0.18 || d2 < 0.14) {
        return [245, 158, 11, 240];
      }
    }

    return [0, 0, 0, 0];
  });
}
const laurelLeftPng = makeLaurel(false);
const laurelRightPng = makeLaurel(true);

// 3. Colored Rounded Rank Badges (1 at 120x120, 2 & 3 at 96x96)
function makeRankBadge(rank, outerColor, innerColors, textColor, badgeSize = 96) {
  return createPng(badgeSize, badgeSize, (x, y, w, h) => {
    const scale = w / 96;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.hypot(x - cx, y - cy);
    const maxR = 44 * scale;

    if (r > maxR) {
      return [0, 0, 0, 0]; // Transparent outside
    }

    // Outer ring
    const outerR = 38 * scale;
    if (r >= outerR) {
      return outerColor;
    }

    // Inner circle
    const normDist = r / outerR;
    const [r1, g1, b1] = innerColors[0];
    const [r2, g2, b2] = innerColors[1];
    const red = r1 + (r2 - r1) * normDist;
    const grn = g1 + (g2 - g1) * normDist;
    const blu = b1 + (b2 - b1) * normDist;

    // Inner bevel highlight ring
    if (r >= 34 * scale && r <= 37 * scale) {
      return [Math.min(255, red + 40), Math.min(255, grn + 40), Math.min(255, blu + 40), 255];
    }

    // Digit in center
    const dx = Math.abs(x - cx);
    const dy = y - cy;

    if (rank === 1) {
      // Digit 1
      if (dx <= 4 * scale && dy >= -16 * scale && dy <= 16 * scale) return textColor;
      if (x < cx && x >= cx - 12 * scale && dy >= -16 * scale && dy <= -8 * scale && (cx - x) >= -(dy + 8 * scale)) return textColor;
      if (dx <= 12 * scale && dy >= 12 * scale && dy <= 16 * scale) return textColor;
    } else if (rank === 2) {
      // Digit 2
      if (Math.hypot(x - cx, y - (cy - 7 * scale)) <= 11 * scale && Math.hypot(x - cx, y - (cy - 7 * scale)) >= 5 * scale && dy <= 0) return textColor;
      if (dx <= 12 * scale && dy >= 10 * scale && dy <= 16 * scale) return textColor;
      if (x >= cx - 10 * scale && x <= cx + 8 * scale && dy >= 0 && dy <= 12 * scale && Math.abs((x - (cx - 10 * scale)) - (12 * scale - dy)) <= 4 * scale) return textColor;
    } else if (rank === 3) {
      // Digit 3
      if (Math.hypot(x - cx, y - (cy - 7 * scale)) <= 11 * scale && Math.hypot(x - cx, y - (cy - 7 * scale)) >= 5 * scale && x >= cx - 2 * scale && dy <= -1) return textColor;
      if (Math.hypot(x - cx, y - (cy + 7 * scale)) <= 12 * scale && Math.hypot(x - cx, y - (cy + 7 * scale)) >= 5 * scale && x >= cx - 4 * scale && dy >= 0) return textColor;
      if (dx <= 6 * scale && dy >= -2 * scale && dy <= 2 * scale) return textColor;
    }

    return [red, grn, blu, 255];
  });
}

const rank1BadgePng = makeRankBadge(
  1,
  [245, 158, 11, 255], // outer gold
  [[254, 240, 138], [217, 119, 6]], // gradient
  [120, 53, 15, 255], // text deep brown
  120 // 120x120px (25% increase from 96x96)
);

const rank2BadgePng = makeRankBadge(
  2,
  [203, 213, 225, 255], // outer silver
  [[255, 255, 255], [148, 163, 184]], // gradient
  [51, 65, 85, 255], // text slate
  96
);

const rank3BadgePng = makeRankBadge(
  3,
  [254, 215, 170, 255], // outer bronze
  [[255, 237, 213], [234, 88, 12]], // gradient
  [124, 45, 18, 255], // text deep copper
  96
);

// 4. Card Backgrounds for 3 Rankings (width: 140, height: 220)
function makeCardBg(bgColor, borderColor) {
  return createPng(140, 220, (x, y, w, h) => {
    const radius = 22;
    // Check if inside rounded rectangle
    let inside = true;
    if (x < radius && y < radius) {
      inside = Math.hypot(x - radius, y - radius) <= radius;
    } else if (x > w - 1 - radius && y < radius) {
      inside = Math.hypot(x - (w - 1 - radius), y - radius) <= radius;
    } else if (x < radius && y > h - 1 - radius) {
      inside = Math.hypot(x - radius, y - (h - 1 - radius)) <= radius;
    } else if (x > w - 1 - radius && y > h - 1 - radius) {
      inside = Math.hypot(x - (w - 1 - radius), y - (h - 1 - radius)) <= radius;
    }

    if (!inside) return [0, 0, 0, 0];

    // Border check (1.5px)
    const isBorder =
      x <= 1 ||
      x >= w - 2 ||
      y <= 1 ||
      y >= h - 2 ||
      (x < radius && y < radius && Math.hypot(x - radius, y - radius) >= radius - 1.5) ||
      (x > w - 1 - radius && y < radius && Math.hypot(x - (w - 1 - radius), y - radius) >= radius - 1.5) ||
      (x < radius && y > h - 1 - radius && Math.hypot(x - radius, y - (h - 1 - radius)) >= radius - 1.5) ||
      (x > w - 1 - radius && y > h - 1 - radius && Math.hypot(x - (w - 1 - radius), y - (h - 1 - radius)) >= radius - 1.5);

    if (isBorder) return borderColor;
    return bgColor;
  });
}

const rank1CardPng = makeCardBg([255, 253, 240, 255], [253, 230, 138, 255]); // Gold cream + gold border
const rank2CardPng = makeCardBg([248, 250, 252, 255], [226, 232, 240, 255]); // Silver white + silver border
const rank3CardPng = makeCardBg([255, 247, 242, 255], [254, 215, 170, 255]); // Bronze peach + bronze border

// Save all assets
const assets = {
  'crown.png': crownPng,
  'gold-crown.png': crownPng,
  'leaf.png': laurelLeftPng,
  'leaf-left.png': laurelLeftPng,
  'leaf-right.png': laurelRightPng,
  'rank-1-badge.png': rank1BadgePng,
  'rank-2-badge.png': rank2BadgePng,
  'rank-3-badge.png': rank3BadgePng,
  'rank-1-card.png': rank1CardPng,
  'rank-2-card.png': rank2CardPng,
  'rank-3-card.png': rank3CardPng,
};

for (const dir of dirs) {
  for (const [filename, buffer] of Object.entries(assets)) {
    const fullPath = path.join(dir, filename);
    fs.writeFileSync(fullPath, buffer);
  }
}

console.log('Leaderboard assets generated successfully in assets/leaderboard and assets/images/leaderboard!');
