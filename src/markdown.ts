import { RULES } from './rules.js';
import type { Finding, Report } from './types.js';

const list = (values: string[]) => values.map((value) => `\`${value}\``).join(', ');

const findingLine = (finding: Finding) =>
  `- \`${finding.file}:${finding.line}\` **${finding.rule}** — ${finding.message}`;

export const renderMarkdown = (report: Report, options: { maxPortable?: number; maxFindings?: number } = {}) => {
  const { summary } = report;
  const maxPortable = options.maxPortable ?? 30;
  const maxFindings = options.maxFindings ?? 200;
  const lines: string[] = [
    '# Native readiness report',
    '',
    `Entries: ${list(report.entries)}`,
    '',
    '| Files | Native | Portable | Island | Blocked | Island ratio |',
    '|---|---|---|---|---|---|',
    `| ${summary.files} | ${summary.native} | ${summary.portable} | ${summary.island} | ${summary.blocked} | ${Math.round(summary.islandRatio * 100)}% |`,
    '',
    '- **Native**: runs on React Native as is.',
    '- **Portable**: only needs mechanical porting (DOM tags, unsupported Tailwind classes).',
    "- **Island**: runs inside a `'use dom'` component.",
    "- **Blocked**: breaks the native build. Fix first, usually by adding a `'use dom'` boundary.",
    '',
    '## Blocked — add a boundary first',
    '',
  ];

  if (report.blocked.length === 0) lines.push('Nothing is blocked.', '');
  for (const boundary of report.blocked) {
    const action =
      boundary.strategy === 'use-dom'
        ? "Add `'use dom'` here"
        : 'Add a `.native` sibling file';
    lines.push(`### \`${boundary.boundary}\``, '', `- ${action}. Reached from ${boundary.reach} entr${boundary.reach === 1 ? 'y' : 'ies'}.`);
    lines.push(`- Blocking rules: ${list(boundary.rules)}`);
    if (boundary.covers.length > 1) lines.push(`- Covers ${boundary.covers.length} files: ${list(boundary.covers)}`);
    for (const note of boundary.notes) lines.push(`- ⚠️ ${note}`);
    lines.push('');
  }

  lines.push('## Island migration candidates', '');
  if (report.islands.length === 0) lines.push("No `'use dom'` islands yet.", '');
  else {
    lines.push('| Score | Island | Reach | Native importers | Effort | Rules |', '|---|---|---|---|---|---|');
    for (const island of report.islands) {
      lines.push(
        `| ${island.score} | \`${island.file}\` | ${island.reach} | ${island.importers} | ${island.effort} | ${list(island.rules)} |`,
      );
    }
    lines.push('', 'Higher score = more visible and cheaper to make native. Effort counts blocking findings x3 and porting findings x1 inside the island.', '');
  }

  lines.push('## Portable — mechanical porting', '');
  if (report.portable.length === 0) lines.push('Nothing to port.', '');
  else {
    lines.push('| File | Reach | Importers | Findings |', '|---|---|---|---|');
    for (const file of report.portable.slice(0, maxPortable)) {
      lines.push(`| \`${file.file}\` | ${file.reach} | ${file.importers} | ${file.findings} |`);
    }
    if (report.portable.length > maxPortable) lines.push('', `…and ${report.portable.length - maxPortable} more (see JSON output).`);
    lines.push('');
  }

  lines.push('## Findings', '');
  const islandRisks = report.findings.filter((finding) => finding.impact === 'island-risk');
  const nativeSide = report.findings.filter((finding) => !finding.inIsland && finding.impact !== 'island-risk');
  if (islandRisks.length > 0) lines.push('### Island risks', '', ...islandRisks.map(findingLine), '');
  if (nativeSide.length > 0) {
    lines.push('### Native side', '', ...nativeSide.slice(0, maxFindings).map(findingLine));
    if (nativeSide.length > maxFindings) lines.push(`- …and ${nativeSide.length - maxFindings} more (see JSON output).`);
    lines.push('');
  }
  const usedRules = [...new Set(report.findings.map((finding) => finding.rule))].sort();
  if (usedRules.length > 0) {
    lines.push('## How to fix', '');
    for (const rule of usedRules) lines.push(`- **${rule}** (${RULES[rule].impact}): ${RULES[rule].fix}`);
    lines.push('');
  }
  return lines.join('\n');
};
