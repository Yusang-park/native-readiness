import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from '@babel/core';
import { describe, expect, it } from 'vitest';
import viteCompatBabel from './babel.js';
import { loadViteEnv } from './env.js';
import { pregenerateViteModules, resolveViteSpecifier } from './resolve.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../test/fixtures/vite-app');
const origin = path.join(root, 'src/app.tsx');

const transform = (code: string, mode = 'development', platform = 'ios', extra: object = {}) =>
  transformSync(code, {
    filename: origin,
    babelrc: false,
    configFile: false,
    caller: { name: 'metro', ...{ platform } },
    parserOpts: { plugins: ['jsx', 'typescript'] },
    plugins: [[viteCompatBabel, { root, mode, ...extra }]],
  })?.code ?? '';

describe('loadViteEnv', () => {
  it('merges .env files in Vite order with later files winning', () => {
    expect(loadViteEnv(root, 'development')).toMatchObject({ VITE_NAME: 'local', VITE_MODE_ONLY: 'yes' });
  });

  it('only exposes VITE_ variables', () => {
    expect(loadViteEnv(root, 'development')).not.toHaveProperty('SECRET');
  });

  it('strips quotes and ignores comments', () => {
    expect(loadViteEnv(root, 'development').VITE_QUOTED).toBe('hello world');
  });

  it('adds MODE, DEV, PROD, SSR, and BASE_URL', () => {
    expect(loadViteEnv(root, 'production')).toMatchObject({
      VITE_NAME: 'prod',
      MODE: 'production',
      DEV: false,
      PROD: true,
      SSR: false,
      BASE_URL: '/',
    });
  });
});

describe('vite compat babel plugin', () => {
  it('inlines import.meta.env members', () => {
    expect(transform('const a = import.meta.env.VITE_NAME;')).toContain('const a = "local";');
  });

  it('inlines DEV as a boolean', () => {
    expect(transform('if (import.meta.env.DEV) run();')).toContain('if (true)');
  });

  it('replaces unknown env members with undefined', () => {
    expect(transform('const a = import.meta.env.VITE_MISSING;')).toContain('const a = undefined;');
  });

  it('replaces the whole env object with an object literal', () => {
    const code = transform('const env = import.meta.env;');
    expect(code).toContain('VITE_NAME: "local"');
    expect(code).not.toContain('SECRET');
  });

  it('expands eager import.meta.glob with a query and default import', () => {
    const code = transform(
      "const icons = import.meta.glob('./icons/*.svg', { query: '?react', import: 'default', eager: true });",
    );
    expect(code).toContain('import __vite_glob_0_0 from "./icons/a.svg?react";');
    expect(code).toContain('import __vite_glob_0_1 from "./icons/b.svg?react";');
    expect(code).toContain('"./icons/a.svg": __vite_glob_0_0');
  });

  it('expands lazy import.meta.glob into dynamic imports', () => {
    const code = transform("const pages = import.meta.glob('./lib/*.ts');");
    expect(code).toContain('"./lib/value.ts": () => import("./lib/value.ts")');
  });

  it('expands eager import.meta.glob without import option as a namespace', () => {
    const code = transform("const mods = import.meta.glob('./lib/*.ts', { eager: true });");
    expect(code).toContain('import * as __vite_glob_0_0 from "./lib/value.ts";');
  });

  it('bundles dynamic imports eagerly for web so DOM islands never fetch chunks outside the app', () => {
    const code = transform("const load = () => import('./lib/value');", 'development', 'web');
    expect(code).not.toContain('import(');
    expect(code).toContain('require("./lib/value")');
  });

  it('keeps the module namespace shape for eager imports', () => {
    const code = transform("const load = () => import('./lib/value');", 'development', 'web');
    expect(code).toContain('__esModule');
  });

  it('leaves dynamic imports alone on native platforms', () => {
    expect(transform("const load = () => import('./lib/value');", 'development', 'ios')).toMatch(/import\(['"]\.\/lib\/value['"]\)/);
  });

  it('can turn eager imports off', () => {
    const code = transform("const load = () => import('./lib/value');", 'development', 'web', { eagerImports: false });
    expect(code).toMatch(/import\(['"]\.\/lib\/value['"]\)/);
  });

  it('leaves other import.meta properties alone', () => {
    expect(transform('const u = import.meta.url;')).toContain('import.meta.url');
  });
});

describe('resolveViteSpecifier', () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-cache-'));
  const options = { root, cacheDir };

  it('maps tsconfig path aliases from the web root', () => {
    expect(resolveViteSpecifier('@/lib/value', origin, options)).toEqual({ moduleName: path.join(root, 'src/lib/value') });
    expect(resolveViteSpecifier('shared', origin, options)).toEqual({ moduleName: path.join(root, 'shared/index.ts') });
  });

  it('ignores aliases that only point at type declarations, like Vite does', () => {
    expect(resolveViteSpecifier('typed-only', origin, options)).toBeNull();
  });

  it('maps Vite root-absolute imports to the web root', () => {
    expect(resolveViteSpecifier('/shared/style.css', origin, options)).toEqual({
      moduleName: path.join(root, 'shared/style.css'),
    });
  });

  it('compiles ?react SVG imports into a React component module', () => {
    const result = resolveViteSpecifier('./icons/a.svg?react', origin, options);
    expect(result && 'filePath' in result).toBe(true);
    const filePath = result && 'filePath' in result ? result.filePath : '';
    const code = fs.readFileSync(filePath, 'utf8');
    expect(code).toContain('export default');
    expect(code).toContain('<svg');
  });

  it('drops editor-only namespaced tags and attributes that Babel JSX rejects', () => {
    const result = resolveViteSpecifier('./icons/inkscape.svg?react', origin, options);
    const code = fs.readFileSync(result && 'filePath' in result ? result.filePath : '', 'utf8');
    expect(code).not.toMatch(/<\/?[\w-]+:[\w-]+/);
    expect(code).not.toMatch(/\s[\w-]+:[\w-]+=/);
    expect(code).toContain('<circle');
    expect(code).toContain('xlinkHref');
  });

  it('turns ?raw imports into a string module', () => {
    const result = resolveViteSpecifier('./lib/notes.txt?raw', origin, options);
    const filePath = result && 'filePath' in result ? result.filePath : '';
    expect(fs.readFileSync(filePath, 'utf8')).toContain('"hello raw\\n"');
  });

  it('strips ?url so the file resolves as an asset', () => {
    expect(resolveViteSpecifier('./icons/a.svg?url', origin, options)).toEqual({ moduleName: './icons/a.svg' });
  });

  it('returns null for ordinary specifiers', () => {
    expect(resolveViteSpecifier('react', origin, options)).toBeNull();
    expect(resolveViteSpecifier('./lib/value', origin, options)).toBeNull();
  });

  it('redirects tslib to its ES build, whose wrapper Metro cannot interop', () => {
    expect(resolveViteSpecifier('tslib', origin, options)).toEqual({ moduleName: 'tslib/tslib.es6.js' });
  });

  it('redirects aliased packages to a replacement module', () => {
    expect(
      resolveViteSpecifier('react-router-dom', origin, { ...options, aliases: { 'react-router-dom': '/app/shim.tsx' } }),
    ).toEqual({ moduleName: '/app/shim.tsx' });
  });

  it('lets the replacement module import the real package', () => {
    expect(
      resolveViteSpecifier('react-router-dom', '/app/shim.tsx', { ...options, aliases: { 'react-router-dom': '/app/shim.tsx' } }),
    ).toBeNull();
  });

  it('keeps one copy of singleton packages by resolving them from the app', () => {
    expect(resolveViteSpecifier('react', origin, { ...options, singletons: ['react'], appRoot: '/app' })).toEqual({
      moduleName: 'react',
      originModulePath: '/app/package.json',
    });
    expect(
      resolveViteSpecifier('react/jsx-runtime', origin, { ...options, singletons: ['react'], appRoot: '/app' }),
    ).toEqual({ moduleName: 'react/jsx-runtime', originModulePath: '/app/package.json' });
  });
});

describe('pregenerateViteModules', () => {
  it('writes every SVG component and ?raw module before Metro starts, so Metro can hash them', () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-pregen-'));
    const options = { root, cacheDir };
    pregenerateViteModules(options);
    const svg = resolveViteSpecifier('./icons/b.svg?react', origin, options);
    const raw = resolveViteSpecifier('./lib/notes.txt?raw', path.join(root, 'src/uses-raw.ts'), options);
    const generated = fs.readdirSync(cacheDir, { recursive: true }).map(String);
    expect(generated.filter((file) => file.endsWith('.js'))).toHaveLength(4);
    expect(svg && 'filePath' in svg ? generated.some((file) => svg.filePath.endsWith(file)) : false).toBe(true);
    expect(raw && 'filePath' in raw ? generated.some((file) => raw.filePath.endsWith(file)) : false).toBe(true);
  });

  it('skips ignored folders', () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-pregen-'));
    pregenerateViteModules({ root, cacheDir, ignore: ['src/icons'] });
    const generated = fs.readdirSync(cacheDir, { recursive: true }).map(String).filter((file) => file.endsWith('.js'));
    expect(generated).toHaveLength(1);
  });

  it('only scans the included folders when given', () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-pregen-'));
    pregenerateViteModules({ root, cacheDir, include: ['src/lib', 'src/uses-raw.ts'] });
    const generated = fs.readdirSync(cacheDir, { recursive: true }).map(String).filter((file) => file.endsWith('.js'));
    expect(generated).toHaveLength(1);
  });
});
