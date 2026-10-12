import fs from 'node:fs';
import path from 'node:path';
import { matchesGlob } from '../glob.js';

const walk = (dir: string, out: string[]) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
};

const staticPrefix = (pattern: string) => {
  const segments = pattern.split('/');
  const index = segments.findIndex((segment) => /[*?{[]/.test(segment));
  return segments.slice(0, index === -1 ? segments.length - 1 : index).join('/');
};

/**
 * Expands Vite glob patterns relative to `fromDir` (or `root` for `/`-prefixed patterns).
 * Keys keep the form Vite uses: `./x`, `../x`, or `/x`.
 */
export const expandGlobs = (patterns: string[], fromDir: string, root: string) => {
  const positive = patterns.filter((pattern) => !pattern.startsWith('!'));
  const negative = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1));
  const keys = new Set<string>();
  for (const pattern of positive) {
    const base = pattern.startsWith('/') ? root : fromDir;
    const relativePattern = pattern.startsWith('/') ? pattern.slice(1) : path.posix.normalize(pattern);
    const searchDir = path.resolve(base, staticPrefix(relativePattern));
    if (!fs.existsSync(searchDir)) continue;
    for (const file of walk(searchDir, [])) {
      const relative = path.relative(base, file).split(path.sep).join('/');
      if (!matchesGlob(relative, relativePattern)) continue;
      const key = pattern.startsWith('/') ? `/${relative}` : relative.startsWith('..') ? relative : `./${relative}`;
      if (!negative.some((exclude) => matchesGlob(key.replace(/^\.\//, ''), exclude.replace(/^\.\//, '')))) {
        keys.add(key);
      }
    }
  }
  return [...keys].sort();
};
