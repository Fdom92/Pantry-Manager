#!/usr/bin/env node
// Composes the Play Store screenshots: gradient background, generic phone bezel,
// the cropped capture inside it and the caption on top. One 1080x1920 PNG per
// slot x language, written to store-assets/play/<lang>/final/<NN>-<id>.png.
//
//   node scripts/store-shots/render.mjs [--slots=dashboard,shopping] [--langs=es,de]
//
// Needs Google Chrome (headless) and, the first time, network access to fetch
// Roboto (cached under store-assets/play/.cache, which git ignores).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const play = join(root, 'store-assets/play');
const cache = join(play, '.cache');
const CHROME = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1]?.split(',');
const onlySlots = arg('slots');
const onlyLangs = arg('langs');

async function fontFaceCss() {
  mkdirSync(cache, { recursive: true });
  const out = join(cache, 'roboto.css');
  if (existsSync(out)) return readFileSync(out, 'utf8');
  const css = await (await fetch('https://fonts.googleapis.com/css2?family=Roboto:wght@400;900&display=swap', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
  })).text();
  let local = css;
  for (const [i, m] of [...css.matchAll(/url\((https:[^)]+\.woff2)\)/g)].entries()) {
    const file = join(cache, `roboto-${i}.woff2`);
    writeFileSync(file, Buffer.from(await (await fetch(m[1])).arrayBuffer()));
    local = local.replace(m[1], pathToFileURL(file).href);
  }
  writeFileSync(out, local);
  return local;
}

const captions = JSON.parse(readFileSync(join(play, 'captions.json'), 'utf8'));
const template = readFileSync(join(root, 'scripts/store-shots/template.html'), 'utf8');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fonts = await fontFaceCss();

const jobs = [];
for (const slot of captions.slots) {
  if (onlySlots && !onlySlots.includes(slot.id)) continue;
  for (const lang of captions.languages) {
    if (onlyLangs && !onlyLangs.includes(lang)) continue;
    const crop = join(play, lang, 'crop', slot.file);
    if (!existsSync(crop)) { console.log(`skip  ${lang} ${slot.id} (no crop)`); continue; }
    jobs.push({ slot, lang, crop });
  }
}

const tmp = join(tmpdir(), 'pantry-store-shots');
mkdirSync(tmp, { recursive: true });

async function render({ slot, lang, crop }) {
  const name = `${String(slot.order).padStart(2, '0')}-${slot.id}`;
  const html = template
    .replace('/*__FONTS__*/', fonts)
    .replace('{{HEADLINE}}', esc(slot.headline[lang]))
    .replace('{{SUB}}', esc(slot.sub[lang]))
    .replace('{{IMG}}', pathToFileURL(crop).href);
  const page = join(tmp, `${lang}-${name}.html`);
  writeFileSync(page, html);
  const outDir = join(play, lang, 'final');
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${name}.png`);
  await run(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
    '--virtual-time-budget=6000', '--force-device-scale-factor=1', '--window-size=1080,1920',
    `--screenshot=${out}`, pathToFileURL(page).href,
  ]);
  console.log(`ok    ${lang} ${name}`);
}

// A few at a time: each Chrome is heavy, and the machine is usually doing something else.
const pool = 3;
let next = 0;
await Promise.all(Array.from({ length: pool }, async () => {
  while (next < jobs.length) await render(jobs[next++]);
}));
console.log(`${jobs.length} image(s) in store-assets/play/<lang>/final/`);
