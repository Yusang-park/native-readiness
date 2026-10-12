import type { Report } from './types.js';

export type Baseline = { version: 1; counts: Record<string, number> };

export type BaselineChange = { key: string; before: number; after: number };

export const toBaseline = (report: Report): Baseline => {
  const counts: Record<string, number> = {};
  for (const finding of report.findings) {
    const key = `${finding.rule}|${finding.file}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return { version: 1, counts };
};

export const compareBaseline = (report: Report, baseline: Baseline) => {
  const current = toBaseline(report).counts;
  const keys = [...new Set([...Object.keys(current), ...Object.keys(baseline.counts)])].sort();
  const regressions: BaselineChange[] = [];
  const improvements: BaselineChange[] = [];
  for (const key of keys) {
    const before = baseline.counts[key] ?? 0;
    const after = current[key] ?? 0;
    if (after > before) regressions.push({ key, before, after });
    if (after < before) improvements.push({ key, before, after });
  }
  return { regressions, improvements };
};
