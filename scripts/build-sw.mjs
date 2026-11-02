import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { classifyClientAsset } from './shell-assets.mjs';

const root = (process.argv[2] || 'dist/client').replace(/\/$/, '');
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
      ),
    )
  ).flat();
}
const all = (await files(root)).sort();
const grouped = { critical: [], optional: [], art: [] };
for (const file of all) {
  const pathname = file.slice(root.length);
  const kind = classifyClientAsset(pathname);
  if (kind === 'critical' || kind === 'optional' || kind === 'art')
    grouped[kind].push({ file, pathname });
}
const template = await readFile('scripts/sw-template.js', 'utf8');
async function version(items) {
  const hash = createHash('sha256');
  for (const item of items) hash.update(await readFile(item.file));
  hash.update(template);
  return hash.digest('hex').slice(0, 16);
}
if (!grouped.critical.some((item) => item.pathname.endsWith('.js')))
  throw Error('Offline shell is missing JavaScript.');
const shellVersion = await version([
  ...grouped.critical,
  ...grouped.optional,
  ...grouped.art,
]);
const paths = (items) => JSON.stringify(items.map((item) => item.pathname));
await writeFile(
  join(root, 'sw.js'),
  template
    .replace('__VERSION__', shellVersion)
    .replace('__CRITICAL__', paths(grouped.critical))
    .replace('__OPTIONAL__', paths(grouped.optional))
    .replace('__ART__', paths(grouped.art)),
);
console.log(
  `Offline shell ${shellVersion}: ${grouped.critical.length} critical, ${grouped.optional.length} optional, ${grouped.art.length} art`,
);
