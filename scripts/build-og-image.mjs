import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetDir = path.join(root, 'scripts', 'assets');
const chunks = [
  'og-cleansub.part1.b64',
  'og-cleansub.part2.b64',
  'og-cleansub.part3.b64'
];

const encoded = (await Promise.all(
  chunks.map(async (name) => (await readFile(path.join(assetDir, name), 'utf8')).trim())
)).join('');

if (encoded.length !== 16476) {
  throw new Error(`CleanSub social image is incomplete: expected 16476 base64 characters, got ${encoded.length}.`);
}

const image = Buffer.from(encoded, 'base64');
if (
  image.length !== 12357 ||
  image[0] !== 0xff ||
  image[1] !== 0xd8 ||
  image.at(-2) !== 0xff ||
  image.at(-1) !== 0xd9
) {
  throw new Error('CleanSub social image failed JPEG validation.');
}

const publicDir = path.join(root, 'public');
await mkdir(publicDir, { recursive: true });
await writeFile(path.join(publicDir, 'og-cleansub.jpg'), image);
console.log('Prepared public/og-cleansub.jpg for social link previews.');
