/**
 * §HANDOFF 5.4.1 — recruit-sprite-row.png → 16개 개별 PNG
 * 검정·체커보드 배경 인식 · 2줄(11+5) gutter · 36px centre · 타일 defringe
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const defaultSrc = path.join(root, 'image/discord-emojis/recruit-sprite-row.png');
const src = process.argv[2] ? path.resolve(process.argv[2]) : defaultSrc;
const outDir = path.join(root, 'image/discord-emojis');

const FILES = [
  'star.png',
  'skull.png',
  'classical_building.png',
  'wing.png',
  'hatching_chick.png',
  'man_climbing.png',
  'mage.png',
  'blue_heart.png',
  'bear.png',
  'teddy_bear.png',
  'fish.png',
  'oncoming_bus.png',
  'troll.png',
  'bird.png',
  'mage_alt.png', // 스프라이트 16칸용 · UI 카탈로그에는 미사용(중복 :mage:)
  'squid.png',
];

const TARGET = 36;
let ROW_CONTENT_MIN = 50;
let COL_MIN_WIDTH = 25;
const BG_CHROMA = 22;
const BG_LUM_MIN = 175;
const BG_LUM_MAX = 250;

if (!fs.existsSync(src)) {
  console.error('Source not found:', src);
  process.exit(1);
}

function pixelMetrics(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return { chroma: mx - mn, lum: (r + g + b) / 3 };
}

/** 검정 누끼 또는 체커보드 회색 배경 */
function isKeyBackground(r, g, b) {
  const { chroma, lum } = pixelMetrics(r, g, b);
  if (lum <= 24) return true;
  if (lum <= 40 && chroma < 14) return true;
  return chroma < BG_CHROMA && lum > BG_LUM_MIN && lum < BG_LUM_MAX;
}

/** 누끼 잔여(하얀·연회색·검은 테두리) */
function isFringePixel(r, g, b, a) {
  if (a < 8) return true;
  const { chroma, lum } = pixelMetrics(r, g, b);
  if (isKeyBackground(r, g, b)) return true;
  if (lum <= 38 && chroma < 18 && a < 248) return true;
  if (a < 252 && lum > 228 && chroma < 32) return true;
  if (a < 200 && lum > 210 && chroma < 28) return true;
  return false;
}

function applyAlphaCleanup(buf, w, h, channels) {
  for (let i = 0; i < buf.length; i += channels) {
    const r = buf[i];
    const g = buf[i + 1];
    const b = buf[i + 2];
    const a = buf[i + 3];
    if (isFringePixel(r, g, b, a)) buf[i + 3] = 0;
  }
  const w2 = w * h;
  const alpha = new Uint8Array(w2);
  for (let p = 0; p < w2; p++) alpha[p] = buf[p * channels + 3];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const a0 = alpha[p];
      if (a0 < 8) continue;
      const i = p * channels;
      const { chroma, lum } = pixelMetrics(buf[i], buf[i + 1], buf[i + 2]);
      if (lum < 218 || chroma > 36) continue;
      let transparentNeighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
            transparentNeighbors++;
            continue;
          }
          if (alpha[ny * w + nx] < 20) transparentNeighbors++;
        }
      }
      if (transparentNeighbors >= 6 || (transparentNeighbors >= 4 && a0 < 220)) {
        buf[i + 3] = 0;
      }
    }
  }
}

let { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let { width, height, channels } = info;
ROW_CONTENT_MIN = Math.max(24, Math.round(width * 0.08));
COL_MIN_WIDTH = Math.max(10, Math.round(width / 45));

/** 스프라이트 전체: 배경 키잉 */
if (channels >= 4) {
  for (let i = 0; i < data.length; i += channels) {
    if (isKeyBackground(data[i], data[i + 1], data[i + 2])) data[i + 3] = 0;
  }
}
const keyedPng = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
const keyed = await sharp(keyedPng).raw().toBuffer({ resolveWithObject: true });
data = keyed.data;
info = keyed.info;
channels = info.channels;

function isContentPixel(x, y) {
  const i = (y * width + x) * channels;
  return data[i + 3] >= 24;
}

function findRowBands() {
  const rowFill = new Uint16Array(height);
  for (let y = 0; y < height; y++) {
    let n = 0;
    for (let x = 0; x < width; x++) {
      if (isContentPixel(x, y)) n++;
    }
    rowFill[y] = n;
  }

  const raw = [];
  let y = 0;
  while (y < height) {
    while (y < height && rowFill[y] < ROW_CONTENT_MIN) y++;
    if (y >= height) break;
    const top = y;
    while (y < height && rowFill[y] >= ROW_CONTENT_MIN) y++;
    raw.push({ top, bottom: y, mass: 0 });
  }

  for (const band of raw) {
    for (let yy = band.top; yy < band.bottom; yy++) band.mass += rowFill[yy];
  }

  raw.sort((a, b) => b.mass - a.mass);
  const main = raw.slice(0, 2).sort((a, b) => a.top - b.top);
  if (main[0] && main[0].top > 0 && main[0].top < 24) main[0].top = 0;
  if (main[1]) main[1].bottom = Math.min(height, main[1].bottom + 2);
  return main;
}

function columnSegments(band) {
  const colFill = new Uint16Array(width);
  for (let x = 0; x < width; x++) {
    let n = 0;
    for (let y = band.top; y < band.bottom; y++) {
      if (isContentPixel(x, y)) n++;
    }
    colFill[x] = n;
  }

  const segs = [];
  let x = 0;
  while (x < width) {
    while (x < width && colFill[x] === 0) x++;
    if (x >= width) break;
    const left = x;
    while (x < width && colFill[x] > 0) x++;
    const w = x - left;
    if (w >= COL_MIN_WIDTH) segs.push({ left, right: x });
  }
  return segs;
}

function tightBox(seg, band) {
  let l = seg.right;
  let r = seg.left;
  let t = band.bottom;
  let b = band.top;
  for (let y = band.top; y < band.bottom; y++) {
    for (let x = seg.left; x < seg.right; x++) {
      if (isContentPixel(x, y)) {
        if (x < l) l = x;
        if (x > r) r = x;
        if (y < t) t = y;
        if (y > b) b = y;
      }
    }
  }
  if (l > r) return null;
  const pad = 1;
  return {
    left: Math.max(seg.left, l - pad),
    top: Math.max(band.top, t - pad),
    width: Math.min(seg.right, r + pad + 1) - Math.max(seg.left, l - pad),
    height: Math.min(band.bottom, b + pad + 1) - Math.max(band.top, t - pad),
  };
}

const rowBands = findRowBands();
const boxes = [];
for (const band of rowBands) {
  for (const seg of columnSegments(band)) {
    const box = tightBox(seg, band);
    if (box && box.width > 2 && box.height > 2) boxes.push(box);
  }
}

boxes.sort((a, b) => {
  const rowA = a.top + a.height / 2 < height / 2 ? 0 : 1;
  const rowB = b.top + b.height / 2 < height / 2 ? 0 : 1;
  return rowA - rowB || a.left - b.left;
});

if (boxes.length !== FILES.length) {
  console.error(`expected ${FILES.length} icons, found ${boxes.length}`);
  console.error('rows:', rowBands);
  process.exit(1);
}

for (let i = 0; i < FILES.length; i++) {
  const box = boxes[i];
  let tile = await sharp(keyedPng)
    .extract(box)
    .resize(TARGET, TARGET, {
      fit: 'contain',
      position: 'centre',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  applyAlphaCleanup(tile.data, tile.info.width, tile.info.height, tile.info.channels);
  const buf = await sharp(tile.data, {
    raw: { width: tile.info.width, height: tile.info.height, channels: tile.info.channels },
  })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(outDir, FILES[i]), buf);
  console.log('wrote', FILES[i], `${box.width}x${box.height}@${box.left},${box.top}`);
}

console.log('done', FILES.length, width, 'x', height, 'bands', rowBands.length);
