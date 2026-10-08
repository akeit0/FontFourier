import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const i18n = await readFile(new URL('assets/i18n.js', root), 'utf8');
const messages = JSON.parse(i18n.match(/\bconst messages = ([\s\S]*?);\r?\n/)[1]);
assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages.ja).sort());
for (const match of html.matchAll(/data-i18n(?:-aria|-placeholder)?="([^"]+)"/g)) {
  for (const lang of ['en', 'ja']) assert.ok(messages[lang][match[1]], `${lang}: missing ${match[1]}`);
}
for (const key of Object.keys(messages.en)) {
  const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  assert.deepEqual(placeholders(messages.en[key]), placeholders(messages.ja[key]), `${key}: placeholder mismatch`);
}
for (const file of ['assets/app.js', 'assets/i18n.js', 'assets/glyph-probes.js', 'assets/glyph-check.js', 'scripts/serve.mjs', 'scripts/build.mjs']) {
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL(file, root))]);
}
for (const match of html.matchAll(/(?:src|href)="\.\/([^"?#]+)"/g)) {
  await access(new URL(match[1], root));
}
await access(new URL('assets/thumbnail.png', root));
console.log('Syntax, local assets, EN/JA keys, and placeholders verified.');
