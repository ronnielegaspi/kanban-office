/* Generates icon.png (256px) + a multi-resolution icon.ico (Kanban Office logo:
   navy tile + gold "KO"). No deps. The multi-size .ico is what gives a crisp,
   correct file/taskbar icon at every Windows size. */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const NAVY = [45, 63, 99, 255], GOLD = [232, 181, 77, 255], EDGE = [16, 19, 28, 255];

// 5x7 letter bitmaps
const K = ["10001", "10010", "10100", "11000", "10100", "10010", "10001"];
const O = ["01110", "10001", "10001", "10001", "10001", "10001", "01110"];

// Render the logo at resolution N×N, returning an RGBA buffer.
function render(N) {
  const px = Buffer.alloc(N * N * 4);
  const set = (x, y, c) => { if (x < 0 || y < 0 || x >= N || y >= N) return; const i = (y * N + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3]; };
  const edge = Math.max(1, Math.round(N * 3 / 64));
  const band = Math.max(edge + 1, Math.round(N * 6 / 64));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let c = NAVY;
    if (x < edge || y < edge || x >= N - edge || y >= N - edge) c = EDGE;
    else if (x < band || y < band || x >= N - band || y >= N - band) c = GOLD;
    set(x, y, c);
  }
  const S = Math.max(1, Math.round(N / 16));            // per-pixel letter scale
  const lw = 5 * S, gap = Math.max(1, Math.round(N * 6 / 64)), total = lw * 2 + gap;
  const ox = Math.round((N - total) / 2), oy = Math.round((N - 7 * S) / 2);
  const letter = (bm, lx) => { for (let r = 0; r < bm.length; r++) for (let col = 0; col < bm[r].length; col++) if (bm[r][col] === '1') for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) set(lx + col * S + a, oy + r * S + b, GOLD); };
  letter(K, ox); letter(O, ox + lw + gap);
  return px;
}

// --- PNG encode ---
function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & (-(c & 1))); } return (~c) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const t = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0); return Buffer.concat([len, t, data, crc]); }
function pngEncode(N, px) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((N * 4 + 1) * N);
  for (let y = 0; y < N; y++) { raw[y * (N * 4 + 1)] = 0; px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const pngs = SIZES.map(N => ({ N, png: pngEncode(N, render(N)) }));

// 256px PNG for app/window/web use
fs.writeFileSync(path.join(__dirname, 'icon.png'), pngs.find(p => p.N === 256).png);

// --- multi-image ICO (each entry a PNG; Vista+/Win10/11 support) ---
const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
let offset = 6 + pngs.length * 16;
const entries = [], blobs = [];
for (const { N, png } of pngs) {
  const e = Buffer.alloc(16);
  e[0] = N >= 256 ? 0 : N; e[1] = N >= 256 ? 0 : N; e[2] = 0; e[3] = 0;
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(png.length, 8); e.writeUInt32LE(offset, 12);
  entries.push(e); blobs.push(png); offset += png.length;
}
fs.writeFileSync(path.join(__dirname, 'icon.ico'), Buffer.concat([head, ...entries, ...blobs]));
console.log('wrote icon.png (256) + icon.ico (' + SIZES.join(',') + ')');
