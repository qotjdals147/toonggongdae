/**
 * §HANDOFF 5.4.1 — recruit-sprite-row.png → 16개 개별 PNG (카탈로그 순서)
 * Usage: node scripts/slice-discord-recruit-emojis.mjs [source.png]
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
  'squid.png',
  'mage_alt.png',
];

const COUNT = FILES.length;
const TARGET = 36;

if (!fs.existsSync(src)) {
  console.error('Source not found:', src);
  process.exit(1);
}

const meta = await sharp(src).metadata();
const { width, height } = meta;
const cellW = Math.floor(width / COUNT);

for (let i = 0; i < COUNT; i++) {
  const left = i * cellW;
  const extractW = i === COUNT - 1 ? width - left : cellW;
  const buf = await sharp(src)
    .extract({ left, top: 0, width: extractW, height })
    .trim()
    .resize(TARGET, TARGET, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const outPath = path.join(outDir, FILES[i]);
  fs.writeFileSync(outPath, buf);
  console.log('wrote', FILES[i]);
}

console.log('done', COUNT, 'from', width, 'x', height);
