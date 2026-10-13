#!/usr/bin/env node
// Link-preview card (1200x630) for the landing page, in the same style as the store images.
// Writes docs/social-card-v2.png and docs/social-card-es-v2.png. The "-v2" suffix is on
// purpose: social networks cache the old file name for weeks.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fontFaceCss } from './fonts.mjs';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const fonts = await fontFaceCss(join(root, 'store-assets/play/.cache'));
const template = readFileSync(join(root, 'scripts/store-shots/social-card.html'), 'utf8');

const cards = [
  { file: 'social-card-v2.png', lang: 'en',
    headline: 'Stop wasting food you forgot you had',
    features: 'Expiry tracking · Shopping list · Receipt scan · Waste insights',
    free: 'Free · Android · No account' },
  { file: 'social-card-es-v2.png', lang: 'es',
    headline: 'Deja de tirar comida que olvidaste que tenías',
    features: 'Caducidades · Lista de la compra · Escaneo de ticket · Análisis del desperdicio',
    free: 'Gratis · Android · Sin cuenta' },
];
const tmp = join(tmpdir(), 'pantry-social');
mkdirSync(tmp, { recursive: true });
for (const c of cards) {
  const html = template
    .replace('/*__FONTS__*/', fonts)
    .replace('{{ICON}}', pathToFileURL(join(root, 'resources/icon.png')).href)
    .replace('{{HEADLINE}}', c.headline)
    .replace('{{FEATURES}}', c.features)
    .replace('{{FREE}}', c.free)
    .replace('{{IMG}}', pathToFileURL(join(root, 'store-assets/play', c.lang, 'crop/01-dashboard.png')).href);
  const page = join(tmp, `${c.lang}.html`);
  writeFileSync(page, html);
  await run(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
    '--virtual-time-budget=6000', '--force-device-scale-factor=1', '--window-size=1200,630',
    `--screenshot=${join(root, 'docs', c.file)}`, pathToFileURL(page).href]);
  console.log('ok', c.file);
}
