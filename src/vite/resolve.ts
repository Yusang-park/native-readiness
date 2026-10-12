import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { transform, type Plugin } from '@svgr/core';
import ts from 'typescript';

export type ViteResolveOptions = {
  /** The web project root (tsconfig.json, `/`-prefixed imports). */
  root: string;
  /** Directory for generated modules (SVG components, raw strings). Must be watched by Metro. */
  cacheDir: string;
  /** Packages that must resolve from the native app so only one copy is bundled. */
  singletons?: string[];
  /** The native app root used to resolve singletons. */
  appRoot?: string;
  /** Specifier → absolute file that replaces it everywhere except inside that file. */
  aliases?: Record<string, string>;
  /** Options passed to SVGR for `?react` imports. */
  svgrOptions?: Record<string, unknown>;
  /** Root-relative folders to skip when pre-generating modules. */
  ignore?: string[];
  /** Root-relative folders or files to scan when pre-generating modules. Defaults to the whole root. */
  include?: string[];
};

export type ViteResolution = { moduleName: string; originModulePath?: string } | { filePath: string } | null;

// @svgr/plugin-jsx assigns the plugin to module.exports; require() reads it the same way under Node and Vitest.
const jsxPlugin: Plugin = createRequire(import.meta.url)('@svgr/plugin-jsx');

// Packages whose default entry Metro cannot bundle for the web, mapped to an entry it can.
// tslib's ESM wrapper default-imports its CommonJS build, which Metro's interop leaves undefined.
const PACKAGE_REDIRECTS: Record<string, string> = { tslib: 'tslib/tslib.es6.js' };

type Alias = { prefix: string; suffix: string; wildcard: boolean; target: string };

const aliasCache = new Map<string, Alias[]>();

const loadAliases = (root: string) => {
  const cached = aliasCache.get(root);
  if (cached) return cached;
  const configPath = path.join(root, 'tsconfig.json');
  const aliases: Alias[] = [];
  if (fs.existsSync(configPath)) {
    const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined });
    const options = parsed?.options;
    const base = options?.baseUrl ?? (typeof options?.pathsBasePath === 'string' ? options.pathsBasePath : root);
    for (const [pattern, targets] of Object.entries(options?.paths ?? {})) {
      const [target] = targets;
      // Vite does not apply type-only path mappings; the package resolves normally instead.
      if (target === undefined || target.endsWith('.d.ts')) continue;
      const star = pattern.indexOf('*');
      aliases.push({
        prefix: star === -1 ? pattern : pattern.slice(0, star),
        suffix: star === -1 ? '' : pattern.slice(star + 1),
        wildcard: star !== -1,
        target: path.resolve(base, target),
      });
    }
  }
  aliases.sort((a, b) => b.prefix.length - a.prefix.length);
  aliasCache.set(root, aliases);
  return aliases;
};

const applyAlias = (specifier: string, root: string) => {
  for (const alias of loadAliases(root)) {
    if (!alias.wildcard) {
      if (specifier === alias.prefix) return alias.target;
      continue;
    }
    if (specifier.startsWith(alias.prefix) && specifier.endsWith(alias.suffix) && specifier.length >= alias.prefix.length + alias.suffix.length) {
      const middle = specifier.slice(alias.prefix.length, specifier.length - alias.suffix.length);
      return alias.target.replace('*', middle);
    }
  }
  return undefined;
};

const rootAbsolute = (specifier: string, root: string) => {
  if (!specifier.startsWith('/') || specifier.startsWith(root)) return undefined;
  const candidate = path.join(root, specifier);
  return fs.existsSync(candidate) ? candidate : undefined;
};

const toAbsolute = (specifier: string, originPath: string, root: string) =>
  applyAlias(specifier, root) ?? rootAbsolute(specifier, root) ?? path.resolve(path.dirname(originPath), specifier);

const writeGenerated = (cacheDir: string, source: string, kind: string, content: string) => {
  const hash = crypto.createHash('sha1').update(source).update(content).digest('hex').slice(0, 16);
  const file = path.join(cacheDir, kind, `${path.basename(source).replace(/[^\w.-]/g, '_')}.${hash}.js`);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return file;
};

// Namespaces SVGR translates into React props; every other prefix is editor metadata.
const KNOWN_NAMESPACES = /^(xlink|xml|xmlns)$/;

/** Removes editor-only namespaced elements and attributes (Inkscape, Sodipodi, RDF), which never render. */
export const stripEditorNamespaces = (svg: string) => {
  let result = svg;
  let previous = '';
  while (previous !== result) {
    previous = result;
    result = result
      .replace(/<([\w-]+):([\w.-]+)\b[^>]*\/>/g, (match, prefix: string) => (KNOWN_NAMESPACES.test(prefix) ? match : ''))
      .replace(/<([\w-]+):([\w.-]+)\b[^>]*>(?:(?!<\1:\2\b)[\s\S])*?<\/\1:\2>/g, (match, prefix: string) =>
        KNOWN_NAMESPACES.test(prefix) ? match : '',
      );
  }
  return result
    .replace(/<metadata\b[^>]*>\s*<\/metadata>/g, '')
    .replace(/\s([\w-]+):([\w.-]+)="[^"]*"/g, (match, prefix: string, name: string) =>
      KNOWN_NAMESPACES.test(prefix) && (prefix !== 'xmlns' || name === 'xlink') ? match : '',
    );
};

const componentName = (file: string) => {
  const name = path.basename(file, path.extname(file)).replace(/[^a-zA-Z0-9]+(.)?/g, (_, char: string | undefined) => (char ?? '').toUpperCase());
  return `Svg${name.charAt(0).toUpperCase()}${name.slice(1)}`;
};

const svgComponent = (file: string, options: ViteResolveOptions) => {
  const svg = stripEditorNamespaces(fs.readFileSync(file, 'utf8'));
  const code = transform.sync(
    svg,
    { jsxRuntime: 'automatic', exportType: 'default', ...options.svgrOptions, plugins: [jsxPlugin] },
    { componentName: componentName(file), filePath: file },
  );
  return writeGenerated(options.cacheDir, file, 'svgr', code);
};

const rawModule = (file: string, options: ViteResolveOptions) =>
  writeGenerated(options.cacheDir, file, 'raw', `export default ${JSON.stringify(fs.readFileSync(file, 'utf8'))};\n`);

const RAW_IMPORT = /['"]([^'"\n]+)\?raw['"]/g;
const SOURCE_FILE = /\.(tsx?|jsx?|mjs|cjs)$/;

/**
 * Generates every SVG component and `?raw` module up front. Metro only hashes files that
 * existed when it started, so modules created during resolution would fail to bundle.
 */
export const pregenerateViteModules = (options: ViteResolveOptions) => {
  const root = path.resolve(options.root);
  const cacheDir = path.resolve(options.cacheDir);
  const ignored = (options.ignore ?? []).map((folder) => path.join(root, folder));
  const visit = (full: string, name: string, isDirectory: boolean) => {
    if (name === 'node_modules' || name.startsWith('.') || full === cacheDir) return;
    if (ignored.some((folder) => full === folder || full.startsWith(`${folder}${path.sep}`))) return;
    if (isDirectory) walk(full);
    else if (name.endsWith('.svg')) svgComponent(full, options);
    else if (SOURCE_FILE.test(name) && !name.endsWith('.d.ts')) {
      for (const match of fs.readFileSync(full, 'utf8').matchAll(RAW_IMPORT)) {
        const target = toAbsolute(match[1] ?? '', full, root);
        if (fs.existsSync(target)) rawModule(target, options);
      }
    }
  };
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      visit(path.join(dir, entry.name), entry.name, entry.isDirectory());
    }
  };
  if (options.include) {
    for (const entry of options.include) {
      const full = path.join(root, entry);
      if (fs.existsSync(full)) visit(full, path.basename(full), fs.statSync(full).isDirectory());
    }
    return;
  }
  walk(root);
};


/**
 * Maps a Vite-style import to something Metro can resolve.
 * Returns null when the specifier needs no help.
 */
export const resolveViteSpecifier = (specifier: string, originPath: string, options: ViteResolveOptions): ViteResolution => {
  const root = path.resolve(options.root);
  const replacement = options.aliases?.[specifier];
  if (replacement !== undefined && path.resolve(replacement) !== path.resolve(originPath)) {
    return { moduleName: path.resolve(replacement) };
  }
  const redirect = PACKAGE_REDIRECTS[specifier];
  if (redirect !== undefined) return { moduleName: redirect };
  for (const singleton of options.singletons ?? []) {
    if ((specifier === singleton || specifier.startsWith(`${singleton}/`)) && options.appRoot) {
      return { moduleName: specifier, originModulePath: path.join(options.appRoot, 'package.json') };
    }
  }

  const queryIndex = specifier.indexOf('?');
  if (queryIndex !== -1) {
    const base = specifier.slice(0, queryIndex);
    const query = new URLSearchParams(specifier.slice(queryIndex + 1));
    if (query.has('react') && base.endsWith('.svg')) {
      return { filePath: svgComponent(toAbsolute(base, originPath, root), options) };
    }
    if (query.has('raw')) {
      return { filePath: rawModule(toAbsolute(base, originPath, root), options) };
    }
    return { moduleName: applyAlias(base, root) ?? rootAbsolute(base, root) ?? base };
  }

  const aliased = applyAlias(specifier, root);
  if (aliased !== undefined) return { moduleName: aliased };
  const absolute = rootAbsolute(specifier, root);
  if (absolute !== undefined) return { moduleName: absolute };
  return null;
};
