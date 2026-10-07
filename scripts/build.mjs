import { mkdir, copyFile, cp, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('_site/', root);
await mkdir(output, { recursive: true });
await copyFile(new URL('index.html', root), new URL('index.html', output));
await cp(new URL('assets/', root), new URL('assets/', output), { recursive: true });
await writeFile(new URL('.nojekyll', output), '');
console.log('Built _site/ (index.html and assets only).');
