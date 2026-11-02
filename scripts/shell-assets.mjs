// Classify built client files for the offline shell.
// Critical files are required for the app to open. Optional files are cached
// after install. Exercise art is never part of install: the PNG set is about
// 21MB and a single failed `cache.addAll` used to throw away the whole shell.
export function classifyClientAsset(pathname) {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (path === '/sw.js' || path.endsWith('/sw.js')) return 'ignore';
  if (path.startsWith('/exercise-icons-v2/') && path.endsWith('.webp'))
    return 'art';
  if (path.startsWith('/exercise-icons')) return 'ignore';
  if (/\.(?:js|css|webmanifest)$/.test(path)) return 'critical';
  if (/\.(?:woff2?|png|svg|webp)$/.test(path)) return 'optional';
  return 'ignore';
}
