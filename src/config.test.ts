import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../test/fixtures/app');

describe('loadConfig', () => {
  it('reads entries and layers from native-readiness.config.json', () => {
    expect(loadConfig(root)).toEqual({
      entries: ['src/screens/sheet.tsx'],
      layers: { platform: ['src/lib/**'], primitives: ['src/atoms/**'] },
    });
  });

  it('returns an empty config when no file exists and none was requested', () => {
    expect(loadConfig(path.join(root, 'src'))).toEqual({});
  });

  it('throws when a requested config file is missing', () => {
    expect(() => loadConfig(root, 'missing.json')).toThrow('Config file not found');
  });
});
