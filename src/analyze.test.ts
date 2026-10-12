import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyze } from './analyze.js';
import { compareBaseline, toBaseline } from './baseline.js';
import { renderMarkdown } from './markdown.js';
import type { Report } from './types.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../test/fixtures/app');
const entries = ['src/screens/sheet.tsx', 'src/screens/dashboard.tsx'];

const findingsFor = (report: Report, file: string, rule?: string) =>
  report.findings.filter((f) => f.file === file && (rule === undefined || f.rule === rule));

describe('analyze', () => {
  let report: Report;

  beforeAll(() => {
    report = analyze({ root, entries });
  });

  it('resolves a .native.tsx sibling instead of the web file', () => {
    expect(report.files['src/atoms/button.native.tsx']?.status).toBe('native');
    expect(report.files['src/atoms/button.tsx']).toBeUndefined();
  });

  it('follows tsconfig path aliases and ignores unreachable files', () => {
    expect(report.files['src/components/header.tsx']).toBeDefined();
    expect(report.files['src/components/unused.tsx']).toBeUndefined();
  });

  it('reports intrinsic DOM elements with line numbers', () => {
    const [finding] = findingsFor(report, 'src/components/header.tsx', 'dom-element');
    expect(finding).toMatchObject({ impact: 'needs-port', line: 8 });
    expect(finding?.message).toContain('div');
  });

  it('reports Tailwind classes NativeWind cannot express, including cn() arguments', () => {
    const messages = findingsFor(report, 'src/components/header.tsx', 'tw-unsupported')
      .map((f) => f.message)
      .join(' ');
    expect(messages).toContain('grid-cols-2');
    expect(messages).toContain('group-hover:underline');
    expect(messages).not.toContain('md:flex');
  });

  it('reports web-only packages and CSS imports as native blockers', () => {
    expect(findingsFor(report, 'src/components/chart.tsx', 'web-package')[0]).toMatchObject({
      impact: 'blocks-native',
      line: 1,
    });
    expect(findingsFor(report, 'src/components/chart.tsx', 'css-import')).toHaveLength(1);
  });

  it('reports DOM globals and import.meta', () => {
    expect(findingsFor(report, 'src/components/chart-tooltip.tsx', 'dom-global')[0]?.message).toContain(
      'window',
    );
    expect(findingsFor(report, 'src/lib/env.ts', 'import-meta')).toHaveLength(1);
  });

  it('classifies every reachable file into native, portable, island, or blocked', () => {
    const statuses = Object.fromEntries(Object.entries(report.files).map(([file, info]) => [file, info.status]));
    expect(statuses).toEqual({
      'src/screens/sheet.tsx': 'native',
      'src/screens/dashboard.tsx': 'native',
      'src/atoms/button.native.tsx': 'native',
      'src/lib/cn.ts': 'native',
      'src/components/header.tsx': 'portable',
      'src/components/chart.tsx': 'blocked',
      'src/components/chart-tooltip.tsx': 'blocked',
      'src/lib/env.ts': 'blocked',
      'src/atoms/tooltip.tsx': 'blocked',
      'src/components/editor.tsx': 'island',
      'src/stores/sheet-store.ts': 'island',
      'src/components/dom-map.tsx': 'island',
    });
    expect(report.summary).toMatchObject({ files: 12, native: 4, portable: 1, blocked: 4, island: 3 });
  });

  it('suggests one use dom boundary at the highest blocked component and covers its subtree', () => {
    const chart = report.blocked.find((b) => b.boundary === 'src/components/chart.tsx');
    expect(chart).toMatchObject({ strategy: 'use-dom' });
    expect(chart?.covers).toEqual(['src/components/chart.tsx', 'src/components/chart-tooltip.tsx']);
    expect(report.blocked.some((b) => b.boundary === 'src/components/chart-tooltip.tsx')).toBe(false);
  });

  it('suggests a .native file split for blocked non-component modules', () => {
    expect(report.blocked.find((b) => b.boundary === 'src/lib/env.ts')).toMatchObject({
      strategy: 'native-file',
    });
  });

  it('does not flag packages known to be native-safe', () => {
    expect(findingsFor(report, 'src/components/header.tsx', 'web-package')).toEqual([]);
  });

  it('suggests a .native.tsx file instead of an island for widely imported components', () => {
    const tooltip = report.blocked.find((b) => b.boundary === 'src/atoms/tooltip.tsx');
    expect(tooltip).toMatchObject({ strategy: 'native-file' });
    expect(tooltip?.notes.join(' ')).toContain('3 files');
  });

  it('keeps the island suggestion when the import threshold is raised', () => {
    const relaxed = analyze({ root, entries, islandMaxImporters: 10 });
    expect(relaxed.blocked.find((b) => b.boundary === 'src/atoms/tooltip.tsx')).toMatchObject({ strategy: 'use-dom' });
  });

  it('flags island roots that read shared state or take unserializable props', () => {
    expect(findingsFor(report, 'src/components/editor.tsx', 'island-shared-state')[0]?.message).toContain(
      'zustand',
    );
    const props = findingsFor(report, 'src/components/editor.tsx', 'island-props')
      .map((f) => f.message)
      .join(' ');
    expect(props).toContain('onChange');
    expect(props).toContain('children');
  });

  it('flags use dom files without a default export', () => {
    expect(findingsFor(report, 'src/components/dom-map.tsx', 'island-default-export')).toHaveLength(1);
    expect(findingsFor(report, 'src/components/editor.tsx', 'island-default-export')).toHaveLength(0);
  });

  it('lists every use dom island as a ranked native migration candidate', () => {
    expect(report.islands.map((i) => i.file).sort()).toEqual([
      'src/components/dom-map.tsx',
      'src/components/editor.tsx',
    ]);
    const editor = report.islands.find((i) => i.file === 'src/components/editor.tsx');
    expect(editor?.covers).toContain('src/stores/sheet-store.ts');
    expect(editor?.effort).toBeGreaterThan(0);
    const scores = report.islands.map((i) => i.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('ranks portable files by how many entries reach them', () => {
    expect(report.portable[0]).toMatchObject({ file: 'src/components/header.tsx', reach: 2 });
  });

  it('limits findings to changed files without changing the classification', () => {
    const changed = analyze({ root, entries, changedFiles: ['src/components/header.tsx'] });
    expect(new Set(changed.findings.map((f) => f.file))).toEqual(new Set(['src/components/header.tsx']));
    expect(changed.summary).toEqual(report.summary);
  });
});

describe('baseline', () => {
  it('detects regressions and improvements per rule and file', () => {
    const report = analyze({ root, entries });
    const baseline = toBaseline(report);
    baseline.counts['dom-global|src/components/chart-tooltip.tsx'] = 0;
    baseline.counts['web-package|src/components/chart.tsx'] = 5;
    const diff = compareBaseline(report, baseline);
    expect(diff.regressions).toEqual([{ key: 'dom-global|src/components/chart-tooltip.tsx', before: 0, after: 1 }]);
    expect(diff.improvements).toEqual([{ key: 'web-package|src/components/chart.tsx', before: 5, after: 1 }]);
  });
});

describe('renderMarkdown', () => {
  it('puts blocked boundaries before island migration candidates', () => {
    const markdown = renderMarkdown(analyze({ root, entries }));
    expect(markdown.indexOf('## Blocked')).toBeGreaterThan(-1);
    expect(markdown.indexOf('## Blocked')).toBeLessThan(markdown.indexOf('## Island migration candidates'));
    expect(markdown).toContain('src/components/chart.tsx');
  });
});
