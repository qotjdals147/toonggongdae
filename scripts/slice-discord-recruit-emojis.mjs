/**
 * §HANDOFF 5.4.1 — recruit-sprite-row.png → 16개 개별 PNG
 * 체커보드(회색) 배경 인식 · 2줄(11+5) gutter 분할 · 36px 가운데 정렬
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
  'mage_alt.png',
  'squid.png',
];

const TARGET = 36;
const ROW_CONTENT_MIN = 50;
const COL_MIN_WIDTH = 25;
const BG_CHROMA = 22;
const BG_LUM_MIN = 175;
const BG_LUM_MAX = 250;

if (!fs.existsSync(src)) {
  console.error('Source not found:', src);
  process.exit(1);
}

function isBackground(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const lum = (r + g + b) / 3;
  return mx - mn < BG_CHROMA && lum > BG_LUM_MIN && lum < BG_LUM_MAX;
}

let { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let { width, height, channels } = info;

/** 체커보드 배경 → 진짜 투명(슬라이스·UI에서 옆 칸 비침 방지) */
if (channels >= 4) {
  for (let i = 0; i < data.length; i += channels) {
    if (isBackground(data[i], data[i + 1], data[i + 2])) {
      data[i + 3] = 0;
    }
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

boxes.sort((a, b) => a.top - b.top || a.left - b.left);

if (boxes.length !== FILES.length) {
  console.error(`expected ${FILES.length} icons, found ${boxes.length}`);
  console.error('rows:', rowBands);
  process.exit(1);
}

for (let i = 0; i < FILES.length; i++) {
  const box = boxes[i];
  const buf = await sharp(keyedPng)
    .extract(box)
    .resize(TARGET, TARGET, {
      fit: 'contain',
      position: 'centre',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(outDir, FILES[i]), buf);
  console.log('wrote', FILES[i], `${box.width}x${box.height}@${box.left},${box.top}`);
}

console.log('done', FILES.length, width, 'x', height, 'bands', rowBands.length);
