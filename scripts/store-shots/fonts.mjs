// Roboto, fetched once from Google Fonts and cached next to the store assets (git-ignored),
// so later renders work offline and always use the same font.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function fontFaceCss(cache) {
  mkdirSync(cache, { recursive: true });
  const out = join(cache, 'roboto.css');
  if (existsSync(out)) return readFileSync(out, 'utf8');
  const css = await (await fetch('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&display=swap', {
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
