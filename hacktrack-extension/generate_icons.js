import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CRC32 table for PNG chunk checksums
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function createPng(width, height, r, g, b) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bit depth
  ihdrData[9] = 6; // RGBA color type
  ihdrData[10] = 0; // Deflate
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // No interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // Raw image data with scanline filters
  // Rounded rectangle sticky note with yellow pastel fill (#FEF08A / #EAB308)
  const scanlines = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0; // filter byte: None
    for (let x = 0; x < width; x++) {
      const idx = 1 + x * 4;
      // Border radius check
      const radius = Math.max(2, Math.floor(width * 0.15));
      const inCornerX = x < radius ? radius - x : (x >= width - radius ? x - (width - radius - 1) : 0);
      const inCornerY = y < radius ? radius - y : (y >= height - radius ? y - (height - radius - 1) : 0);
      const isOutsideCorner = (inCornerX * inCornerX + inCornerY * inCornerY) > (radius * radius);

      if (isOutsideCorner) {
        // Transparent
        row[idx] = 0;
        row[idx + 1] = 0;
        row[idx + 2] = 0;
        row[idx + 3] = 0;
      } else {
        // Shaded yellow sticky note with accent header
        const isHeader = y < Math.floor(height * 0.25);
        if (isHeader) {
          row[idx] = 234;     // #EAB308
          row[idx + 1] = 179;
          row[idx + 2] = 8;
          row[idx + 3] = 255;
        } else {
          row[idx] = r;       // #FEF08A
          row[idx + 1] = g;
          row[idx + 2] = b;
          row[idx + 3] = 255;
        }
      }
    }
    scanlines.push(row);
  }

  const rawData = Buffer.concat(scanlines);
  const compressed = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

const sizes = [16, 48, 128];
const publicIconsDir = path.resolve(__dirname, 'public/icons');
const distIconsDir = path.resolve(__dirname, 'dist/icons');

fs.mkdirSync(publicIconsDir, { recursive: true });
fs.mkdirSync(distIconsDir, { recursive: true });

for (const size of sizes) {
  const pngBuf = createPng(size, size, 254, 240, 138); // Pastel Yellow #FEF08A
  fs.writeFileSync(path.join(publicIconsDir, `icon${size}.png`), pngBuf);
  fs.writeFileSync(path.join(distIconsDir, `icon${size}.png`), pngBuf);
  console.log(`Generated icon${size}.png (${pngBuf.length} bytes)`);
}
console.log('All icons generated successfully!');
