import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('package root for app bundles', () => {
  it('exports the createElement fallback Babel imports from the JSX import source', async () => {
    const root = await import('./runtime-root.js');
    expect(typeof root.createElement).toBe('function');
    expect(root.Fragment).toBeDefined();
  });

  it('is what React Native and browser bundlers resolve, while Node keeps the tooling', () => {
    const manifest: { exports: Record<string, unknown> } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(manifest.exports['.']).toMatchObject({
      'react-native': './dist/runtime-root.js',
      browser: './dist/runtime-root.js',
      default: './dist/index.js',
    });
  });
});
