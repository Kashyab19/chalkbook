import { spawnSync } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

// Rebuild the workout icons from the source PNGs. The displayed hero is at most
// ~276 CSS pixels, so a 640px WebP is enough for phone screens and is small
// enough to fetch on a weak gym connection. Requires ffmpeg with libwebp.
const dir = 'public/exercise-icons-v2';
const sources = (await readdir(dir)).filter((name) => name.endsWith('.png')).sort();
let bytes = 0;
for (const name of sources) {
  const input = join(dir, name);
  const output = join(dir, name.replace(/\.png$/, '.webp'));
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-i',
      input,
      '-vf',
      "scale=w='min(640,iw)':h='min(640,ih)':force_original_aspect_ratio=decrease:flags=lanczos",
      '-c:v',
      'libwebp',
      '-quality',
      '80',
      '-compression_level',
      '6',
      output,
    ],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
  bytes += (await stat(output)).size;
}
console.log(`${sources.length} icons, ${Math.round(bytes / 1024)} KB`);
