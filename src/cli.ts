#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { analyze } from './analyze.js';
import { findGoogleFontSpecs, syncFonts } from './fonts/fonts.js';
import { extractThemeVariables, renderNativeTheme, type ThemeVariables } from './theme/variables.js';
import { compareBaseline, toBaseline, type Baseline } from './baseline.js';
import { loadConfig } from './config.js';
import { renderMarkdown } from './markdown.js';
import { RULES } from './rules.js';
import type { RuleId } from './types.js';

const HELP = `native-readiness — report how ready a React web codebase is for React Native.

Usage:
  native-readiness check [options]
  native-readiness explain [rule]
  native-readiness fonts --out <dir> [--css <file>] [--root <dir>] [--include <path>]...
  native-readiness theme --css <file>... --out <file> [--light <selector>]... [--dark <selector>]...

Check options:
  --root <dir>            Project root (default: current directory)
  --config <file>         Config file (default: native-readiness.config.json)
  --entry <file>          Entry screen; repeatable. Overrides config entries.
  --format <md|json>      Output format (default: md)
  --out <file>            Write the report to a file instead of stdout
  --changed               Only list findings in files changed since HEAD
  --baseline <file>       Compare with a saved baseline
  --write-baseline <file> Save the current findings as a baseline
  --fail-on-regression    Exit 1 when --baseline finds new findings

Fonts:
  Finds the Google Fonts the web app loads (index.html and source), downloads every
  weight as TrueType into --out with a fonts.json manifest, and writes --css with embedded
  @font-face rules for DOM islands. Use expoFontPluginEntry() from 'native-readiness/fonts'
  in app.config.js to embed the files in native builds.

Theme:
  Copies the CSS custom properties of the web theme (light and dark) into a stylesheet
  NativeWind reads, so Tailwind colors defined as rgb(var(--…)) resolve on native.

The checker only reports. It never edits files and exits 0 unless
--fail-on-regression is set and readiness got worse.`;

const isRuleId = (value: string): value is RuleId => Object.hasOwn(RULES, value);

const git = (root: string, args: string[]) =>
  execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).split('\n').filter(Boolean);

const changedFiles = (root: string) => [
  ...git(root, ['diff', '--name-only', '--relative', 'HEAD']),
  ...git(root, ['ls-files', '--others', '--exclude-standard']),
];

const lastCommitTime = (root: string) => (file: string) => {
  try {
    const [time] = git(root, ['log', '-1', '--format=%ct', '--', file]);
    return time === undefined ? undefined : Number(time);
  } catch {
    return undefined;
  }
};

const isBaseline = (value: unknown): value is Baseline =>
  typeof value === 'object' && value !== null && Reflect.get(value, 'version') === 1 &&
  typeof Reflect.get(value, 'counts') === 'object';

const explain = (rule: string | undefined) => {
  if (rule === undefined) {
    for (const [id, doc] of Object.entries(RULES)) console.log(`${id.padEnd(22)} ${doc.impact.padEnd(14)} ${doc.title}`);
    return;
  }
  if (!isRuleId(rule)) throw new Error(`Unknown rule: ${rule}`);
  const doc = RULES[rule];
  console.log(`${rule} (${doc.impact})\n\n${doc.title}\n\nHow to fix: ${doc.fix}`);
};

const check = (argv: string[]) => {
  const { values } = parseArgs({
    args: argv,
    options: {
      root: { type: 'string' },
      config: { type: 'string' },
      entry: { type: 'string', multiple: true },
      format: { type: 'string', default: 'md' },
      out: { type: 'string' },
      changed: { type: 'boolean', default: false },
      baseline: { type: 'string' },
      'write-baseline': { type: 'string' },
      'fail-on-regression': { type: 'boolean', default: false },
    },
  });
  const root = path.resolve(values.root ?? process.cwd());
  const config = loadConfig(root, values.config);
  const entries = values.entry ?? config.entries;
  if (!entries || entries.length === 0) throw new Error('No entries. Pass --entry or set "entries" in the config file.');
  if (values.format !== 'md' && values.format !== 'json') throw new Error('--format must be md or json.');

  const lastChanged = lastCommitTime(root);
  const report = analyze({ ...config, root, entries, lastChanged });
  const shown = values.changed
    ? analyze({ ...config, root, entries, lastChanged, changedFiles: changedFiles(root) })
    : report;

  if (values['write-baseline']) {
    fs.writeFileSync(path.resolve(values['write-baseline']), `${JSON.stringify(toBaseline(report), null, 2)}\n`);
  }
  let diff: ReturnType<typeof compareBaseline> | undefined;
  if (values.baseline) {
    const saved: unknown = JSON.parse(fs.readFileSync(path.resolve(values.baseline), 'utf8'));
    if (!isBaseline(saved)) throw new Error(`${values.baseline} is not a native-readiness baseline.`);
    diff = compareBaseline(report, saved);
  }

  let output: string;
  if (values.format === 'json') {
    output = `${JSON.stringify(diff ? { ...shown, baseline: diff } : shown, null, 2)}\n`;
  } else {
    output = renderMarkdown(shown);
    if (diff) {
      const rows = (changes: typeof diff.regressions) =>
        changes.map((change) => `- \`${change.key.replace('|', '` in `')}\`: ${change.before} → ${change.after}`);
      output += [
        '## Compared with baseline',
        '',
        `New findings: ${diff.regressions.length}. Resolved: ${diff.improvements.length}.`,
        '',
        ...rows(diff.regressions),
        ...rows(diff.improvements),
        '',
      ].join('\n');
    }
  }
  if (values.out) fs.writeFileSync(path.resolve(values.out), output);
  else process.stdout.write(output);

  if (values['fail-on-regression'] && diff && diff.regressions.length > 0) process.exitCode = 1;
};

const fonts = async (argv: string[]) => {
  const { values } = parseArgs({
    args: argv,
    options: {
      root: { type: 'string' },
      out: { type: 'string' },
      css: { type: 'string' },
      include: { type: 'string', multiple: true },
    },
  });
  if (!values.out) throw new Error('--out is required.');
  const root = path.resolve(values.root ?? process.cwd());
  const specs = findGoogleFontSpecs(root, values.include);
  if (specs.length === 0) {
    console.log('No Google Fonts found.');
    return;
  }
  const manifest = await syncFonts({
    specs,
    outDir: path.resolve(values.out),
    ...(values.css ? { cssFile: path.resolve(values.css) } : {}),
  });
  for (const spec of specs) console.log(`${spec.family}: ${spec.variants.map((v) => `${v.weight}${v.style === 'italic' ? 'i' : ''}`).join(', ')}`);
  console.log(`${manifest.length} font files in ${values.out}`);
};

const theme = (argv: string[]) => {
  const { values } = parseArgs({
    args: argv,
    options: {
      css: { type: 'string', multiple: true },
      out: { type: 'string' },
      light: { type: 'string', multiple: true },
      dark: { type: 'string', multiple: true },
    },
  });
  if (!values.out || !values.css || values.css.length === 0) throw new Error('--css and --out are required.');
  const merged: ThemeVariables = { light: {}, dark: {} };
  for (const file of values.css) {
    const variables = extractThemeVariables(fs.readFileSync(path.resolve(file), 'utf8'), {
      ...(values.light ? { lightSelectors: values.light } : {}),
      ...(values.dark ? { darkSelectors: values.dark } : {}),
    });
    Object.assign(merged.light, variables.light);
    Object.assign(merged.dark, variables.dark);
  }
  fs.mkdirSync(path.dirname(path.resolve(values.out)), { recursive: true });
  fs.writeFileSync(path.resolve(values.out), `/* Generated by native-readiness theme. Do not edit. */\n${renderNativeTheme(merged)}`);
  console.log(`${Object.keys(merged.light).length} light and ${Object.keys(merged.dark).length} dark variables in ${values.out}`);
};

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === 'check') check(rest);
  else if (command === 'explain') explain(rest[0]);
  else if (command === 'fonts') await fonts(rest);
  else if (command === 'theme') theme(rest);
  else console.log(HELP);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
