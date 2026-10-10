// Renders public/icon.svg to the PNG sizes the web app manifest needs. Run after editing icon.svg:
//   node scripts/generate-icons.mjs
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const svg = await readFile(resolve(publicDir, 'icon.svg'));

const outputs = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['apple-touch-icon.png', 180, 0],
  // Maskable icons keep everything important inside the central 80%, so pad the artwork.
  ['icon-maskable-512.png', 512, 64],
];

for (const [name, size, padding] of outputs) {
  const inner = size - padding * 2;
  const artwork = await sharp(svg).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: '#f06e46' } })
    .composite([{ input: artwork, left: padding, top: padding }])
    .png()
    .toFile(resolve(publicDir, name));
  console.log(`wrote ${name}`);
}
