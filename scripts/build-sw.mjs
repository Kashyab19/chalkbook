import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const root = process.argv[2] || 'dist/client';
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]))).flat();
}
const assets = (await files(root)).filter(p => /\.(js|css|woff2?|png|svg|webp|webmanifest)$/.test(p) && !p.endsWith('/sw.js')).sort();
const hash = createHash('sha256');
for (const file of assets) hash.update(await readFile(file));
const template = await readFile('scripts/sw-template.js', 'utf8');
hash.update(template);
const version = hash.digest('hex').slice(0, 16);
await writeFile(join(root, 'sw.js'), template.replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify(assets.map(p => p.slice(root.length)))));
console.log(`Offline shell ${version}: ${assets.length} assets`);
