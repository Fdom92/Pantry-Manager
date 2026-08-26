#!/usr/bin/env node
/**
 * Fails when a template names an icon that `app-icons.ts` never registers.
 *
 * Ionicons resolves names lazily, so an unregistered icon renders as nothing
 * and only warns in the browser console — it survives code review, tests and
 * the production build, and shows up as a blank square on someone's phone.
 * That happened for real in 5.3: extracting the dev panel into its own
 * component left `flag-outline` behind.
 *
 * This is a static check over files, which is why it is a script rather than a
 * spec: nothing here needs a browser or a rendered component.
 *
 * It reads both `name="x"` and the string literals inside `[name]="…"`. The
 * dynamic form was skipped at first as "out of reach", and `toggle` — half of
 * a ternary in the dev panel — slipped through that gap and had to be found by
 * hand as well. A literal sitting after a comparison operator is what the
 * expression tests, not an icon, so those are dropped.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src/app';

function walk(dir) {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(ROOT);

const registry = readFileSync(join(ROOT, 'app-icons.ts'), 'utf8');
const body = registry.slice(registry.indexOf('APP_ICONS'));
// Keys come both quoted ('flag-outline': flagOutline) and bare (add: add),
// since a single-word name is a valid identifier.
const registered = new Set(
  [...body.matchAll(/^\s+(?:'([a-z0-9-]+)'|([a-z][a-zA-Z0-9]*))\s*:/gm)].map(m => m[1] ?? m[2])
);

if (registered.size === 0) {
  console.error('check-icons: parsed zero icons out of app-icons.ts — the file shape changed.');
  process.exit(2);
}

const used = new Map();
let templatesSeen = 0;

function note(name, file) {
  used.set(name, [...(used.get(name) ?? []), file]);
}

for (const file of files.filter(f => f.endsWith('.html'))) {
  templatesSeen++;
  const html = readFileSync(file, 'utf8');

  for (const match of html.matchAll(/<ion-icon[^>]*\sname="([a-z0-9-]+)"/g)) {
    note(match[1], file);
  }

  // `[name]="cond ? 'a' : 'b'"` — every literal the expression can produce is
  // an icon that must exist. Literals being compared against are not.
  for (const match of html.matchAll(/<ion-icon[^>]*\[name\]="([^"]*)"/g)) {
    const results = match[1].replace(/(?:===|!==|==|!=)\s*'[^']*'/g, '');
    for (const literal of results.matchAll(/'([a-z0-9-]+)'/g)) {
      note(literal[1], file);
    }
  }
}

if (templatesSeen === 0) {
  console.error(`check-icons: found no templates under ${ROOT} — the glob is wrong.`);
  process.exit(2);
}

const missing = [...used].filter(([name]) => !registered.has(name));

if (missing.length > 0) {
  console.error('Icons named in a template but never registered in app-icons.ts:\n');
  for (const [name, where] of missing) {
    console.error(`  ${name}`);
    for (const file of where) console.error(`    ${file}`);
  }
  console.error('\nImport it from ionicons/icons and add it to APP_ICONS.');
  process.exit(1);
}

console.log(`check-icons: ${used.size} icon names across ${templatesSeen} templates, all registered.`);
