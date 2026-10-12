import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { DEFAULT_NATIVE_SAFE_PACKAGES, DEFAULT_SHARED_STATE_PACKAGES, DEFAULT_WEB_ONLY_PACKAGES, isBareSpecifier, matchesAny, packageName } from './packages.js';
import { RULES } from './rules.js';
import { scanFile, type FileScan } from './scan.js';
import type {
  AnalyzeOptions,
  BlockedBoundary,
  FileInfo,
  FileStatus,
  Finding,
  IslandCandidate,
  PortableCandidate,
  Report,
  RuleId,
} from './types.js';

const STYLESHEET = /\.(css|scss|sass|less)$/;
const SOURCE = /\.(tsx?|jsx?|mjs|cjs)$/;
const COMPONENT = /\.(tsx|jsx)$/;

type Node = {
  scan: FileScan;
  edges: string[];
  packages: string[];
  findings: Finding[];
};

const toPosix = (value: string) => value.split(path.sep).join('/');

const loadCompilerOptions = (root: string, tsconfig: string | undefined, suffixes: string[]) => {
  const configPath = path.resolve(root, tsconfig ?? 'tsconfig.json');
  const options: ts.CompilerOptions = fs.existsSync(configPath)
    ? (ts.getParsedCommandLineOfConfigFile(configPath, {}, {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
          throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
        },
      })?.options ?? {})
    : { moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX };
  return { ...options, allowJs: true, moduleSuffixes: suffixes };
};

const reachable = (starts: string[], graph: Map<string, Node>, stop: (file: string) => boolean) => {
  const seen = new Set<string>();
  const queue = [...starts];
  while (queue.length > 0) {
    const file = queue.shift();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    if (stop(file) && !starts.includes(file)) continue;
    queue.push(...(graph.get(file)?.edges ?? []));
  }
  return seen;
};

export const analyze = (options: AnalyzeOptions): Report => {
  const root = path.resolve(options.root);
  const relative = (file: string) => toPosix(path.relative(root, file));
  const ignore = options.ignore ?? [];
  const webOnly = [...DEFAULT_WEB_ONLY_PACKAGES, ...(options.webOnlyPackages ?? [])];
  const nativeSafe = [...DEFAULT_NATIVE_SAFE_PACKAGES, ...(options.nativeSafePackages ?? [])];
  const islandMaxImporters = options.islandMaxImporters ?? 3;
  const sharedState = [...DEFAULT_SHARED_STATE_PACKAGES, ...(options.sharedStatePackages ?? [])];
  const compilerOptions = loadCompilerOptions(root, options.tsconfig, options.platformSuffixes ?? ['.ios', '.native', '']);
  const cache = ts.createModuleResolutionCache(root, (name) => name, compilerOptions);

  const isProjectFile = (file: string) => {
    const rel = relative(file);
    return (
      !rel.startsWith('..') &&
      !rel.split('/').includes('node_modules') &&
      !file.endsWith('.d.ts') &&
      SOURCE.test(file) &&
      !ignore.some((prefix) => rel.startsWith(prefix))
    );
  };

  const entries = options.entries.map((entry) => path.resolve(root, entry));
  const graph = new Map<string, Node>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift();
    if (file === undefined || graph.has(file)) continue;
    const scan = scanFile(file, fs.readFileSync(file, 'utf8'));
    const node: Node = { scan, edges: [], packages: [], findings: [] };
    const rel = relative(file);
    const add = (rule: RuleId, at: { line: number; column: number }, message: string) =>
      node.findings.push({ rule, impact: RULES[rule].impact, file: rel, ...at, message, inIsland: false });

    for (const ref of scan.imports) {
      if (STYLESHEET.test(ref.specifier)) {
        add('css-import', ref, `Imports the stylesheet \`${ref.specifier}\`.`);
        continue;
      }
      const resolved = ts.resolveModuleName(ref.specifier, file, compilerOptions, ts.sys, cache).resolvedModule;
      if (resolved && !resolved.isExternalLibraryImport && isProjectFile(resolved.resolvedFileName)) {
        const target = path.resolve(resolved.resolvedFileName);
        if (!node.edges.includes(target)) node.edges.push(target);
        queue.push(target);
        continue;
      }
      if (!isBareSpecifier(ref.specifier) || (resolved && !resolved.isExternalLibraryImport)) continue;
      const name = packageName(ref.specifier);
      if (!node.packages.includes(name)) node.packages.push(name);
      if (matchesAny(webOnly, ref.specifier) && !matchesAny(nativeSafe, ref.specifier)) add('web-package', ref, `Imports the web-only package \`${ref.specifier}\`.`);
    }
    for (const finding of scan.findings) add(finding.rule, finding, finding.message);
    graph.set(file, node);
  }

  const importers = new Map<string, string[]>();
  for (const [file, node] of graph) {
    for (const target of node.edges) importers.set(target, [...(importers.get(target) ?? []), file]);
  }

  const isIslandRoot = (file: string) => graph.get(file)?.scan.isDomRoot === true;
  const nativeSide = reachable(
    entries.filter((entry) => !isIslandRoot(entry)),
    graph,
    isIslandRoot,
  );
  for (const islandRoot of [...nativeSide].filter(isIslandRoot)) nativeSide.delete(islandRoot);
  const reachByEntry = entries.map((entry) => reachable([entry], graph, () => false));
  const reach = (file: string) => reachByEntry.filter((set) => set.has(file)).length;
  const hasImpact = (file: string, impact: Finding['impact']) =>
    graph.get(file)?.findings.some((finding) => finding.impact === impact) === true;

  const status = new Map<string, FileStatus>();
  for (const file of graph.keys()) {
    if (!nativeSide.has(file)) status.set(file, 'island');
    else if (hasImpact(file, 'blocks-native')) status.set(file, 'blocked');
    else if (hasImpact(file, 'needs-port')) status.set(file, 'portable');
    else status.set(file, 'native');
  }
  for (const [file, node] of graph) {
    if (status.get(file) === 'island') node.findings.forEach((finding) => (finding.inIsland = true));
  }

  const sharedStateEvidence = (files: Iterable<string>) => {
    const evidence: string[] = [];
    for (const file of files) {
      const node = graph.get(file);
      if (!node) continue;
      const via = ` via ${relative(file)}`;
      for (const name of node.packages.filter((pkg) => matchesAny(sharedState, pkg))) evidence.push(`${name}${via}`);
      if (node.scan.usesContext) evidence.push(`useContext${via}`);
    }
    return evidence;
  };

  const islandRoots = [...graph.keys()].filter(isIslandRoot);
  const islandFindings: Finding[] = [];
  const islands: IslandCandidate[] = islandRoots.map((file) => {
    const node = graph.get(file);
    const rel = relative(file);
    const subtree = reachable([file], graph, () => false);
    const covers = [...subtree].filter((member) => status.get(member) === 'island');
    const islandRisk = (rule: RuleId, at: { line: number; column: number }, message: string) =>
      islandFindings.push({ rule, impact: RULES[rule].impact, file: rel, ...at, message, inIsland: true });

    const evidence = sharedStateEvidence(subtree);
    if (evidence.length > 0) {
      islandRisk('island-shared-state', { line: 1, column: 1 }, `Reads app state inside the island: ${evidence.join(', ')}.`);
    }
    for (const issue of node?.scan.propIssues ?? []) {
      islandRisk(
        'island-props',
        issue,
        issue.kind === 'function'
          ? `Prop \`${issue.name}\` is a function; it becomes an async bridge call.`
          : `Prop \`${issue.name}\` carries React nodes or refs, which cannot cross the boundary.`,
      );
    }
    if (node && !node.scan.hasDefaultExport) {
      islandRisk('island-default-export', { line: 1, column: 1 }, "The 'use dom' file has no default export.");
    }

    const coveredFindings = covers.flatMap((member) => graph.get(member)?.findings ?? []);
    const effort =
      coveredFindings.filter((finding) => finding.impact === 'blocks-native').length * 3 +
      coveredFindings.filter((finding) => finding.impact === 'needs-port').length;
    const nativeImporters = (importers.get(file) ?? []).filter((importer) => nativeSide.has(importer)).length;
    return {
      file: rel,
      covers: covers.map(relative),
      reach: reach(file),
      importers: nativeImporters,
      effort,
      score: reach(file) * 10 + nativeImporters * 3 - effort,
      rules: [...new Set(coveredFindings.map((finding) => finding.rule))],
    };
  });
  islands.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));

  const isBlocked = (file: string) => status.get(file) === 'blocked';
  const blocked: BlockedBoundary[] = [...graph.keys()]
    .filter(isBlocked)
    .filter(
      (file) =>
        entries.includes(file) ||
        (importers.get(file) ?? []).some((importer) => nativeSide.has(importer) && !isBlocked(importer)),
    )
    .map((file) => {
      const covers = [...reachable([file], graph, (member) => !isBlocked(member))].filter(isBlocked);
      const importerCount = (importers.get(file) ?? []).length;
      const widelyImported = importerCount >= islandMaxImporters;
      const strategy = COMPONENT.test(file) && !widelyImported ? 'use-dom' : 'native-file';
      const notes: string[] = [];
      if (COMPONENT.test(file) && widelyImported) {
        notes.push(`Imported by ${importerCount} files, so an island here would mean one WebView per use. Write a .native.tsx sibling instead.`);
      }
      if (entries.includes(file)) {
        notes.push('This is an entry screen. Wrapping the whole screen is only a stopgap; push the boundary into its children.');
      }
      if (strategy === 'use-dom') {
        const evidence = sharedStateEvidence(covers);
        if (evidence.length > 0) {
          notes.push(`Reads app state that will not be shared with an island: ${evidence.join(', ')}. Pass values as props or move the boundary below the read.`);
        }
        const props = graph.get(file)?.scan.propIssues ?? [];
        if (props.length > 0) {
          notes.push(`Props that do not serialize cleanly: ${props.map((prop) => prop.name).join(', ')}.`);
        }
      }
      return {
        boundary: relative(file),
        strategy,
        covers: covers.map(relative),
        rules: [
          ...new Set(
            covers.flatMap((member) =>
              (graph.get(member)?.findings ?? []).filter((f) => f.impact === 'blocks-native').map((f) => f.rule),
            ),
          ),
        ],
        notes,
        reach: reach(file),
      };
    });
  blocked.sort((a, b) => b.reach - a.reach || b.covers.length - a.covers.length || a.boundary.localeCompare(b.boundary));

  const portable: PortableCandidate[] = [...graph.keys()]
    .filter((file) => status.get(file) === 'portable')
    .map((file) => ({
      file: relative(file),
      reach: reach(file),
      importers: (importers.get(file) ?? []).length,
      findings: (graph.get(file)?.findings ?? []).length,
    }))
    .sort((a, b) => b.reach - a.reach || b.importers - a.importers || a.findings - b.findings || a.file.localeCompare(b.file));

  const files: Record<string, FileInfo> = {};
  for (const [file, node] of graph) {
    files[relative(file)] = {
      status: status.get(file) ?? 'native',
      imports: node.edges.map(relative),
      importers: (importers.get(file) ?? []).map(relative),
      packages: node.packages,
      reach: reach(file),
    };
  }

  const changed = options.changedFiles ? new Set(options.changedFiles.map(toPosix)) : undefined;
  const findings = [...[...graph.values()].flatMap((node) => node.findings), ...islandFindings]
    .filter((finding) => changed === undefined || changed.has(finding.file))
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);

  const count = (value: FileStatus) => [...status.values()].filter((s) => s === value).length;
  return {
    version: 1,
    entries: entries.map(relative),
    summary: {
      files: graph.size,
      native: count('native'),
      portable: count('portable'),
      island: count('island'),
      blocked: count('blocked'),
      islandRatio: graph.size === 0 ? 0 : Math.round((count('island') / graph.size) * 100) / 100,
    },
    files,
    blocked,
    islands,
    portable,
    findings,
  };
};
