import { describe, expect, it } from 'vitest';
import { matchesGlob } from './glob.js';

describe('matchesGlob', () => {
  it('matches nested files with **', () => {
    expect(matchesGlob('design-system/button/index.tsx', 'design-system/**')).toBe(true);
  });

  it('keeps * within one path segment', () => {
    expect(matchesGlob('src/lib/a/b.ts', 'src/lib/*.ts')).toBe(false);
    expect(matchesGlob('src/lib/b.ts', 'src/lib/*.ts')).toBe(true);
  });

  it('matches exact paths', () => {
    expect(matchesGlob('src/env.ts', 'src/env.ts')).toBe(true);
    expect(matchesGlob('src/env.tsx', 'src/env.ts')).toBe(false);
  });

  it('escapes regex characters in paths', () => {
    expect(matchesGlob('src/a+b.ts', 'src/a+b.ts')).toBe(true);
  });
});
