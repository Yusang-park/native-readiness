// Finds the web app's dependencies that render DOM elements through React but ship no React
// Native build (skeleton loaders, icon packs, legacy UI kits). Their compiled
// React.createElement('span') calls need the createElement Babel plugin to run natively.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SHARED_STATE_PACKAGES, NATIVE_SHIMS, packageName } from './packages.js';

type Manifest = {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  exports?: unknown;
  'react-native'?: unknown;
};

const readManifest = (file: string): Manifest | null => {
  if (!fs.existsSync(file)) return null;
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  return typeof parsed === 'object' && parsed !== null ? (parsed as Manifest) : null;
};

const NATIVE_NAME = /^(@react-native|@expo|react-native|expo)([-/]|$)/;

const SKIPPED = new Set(['react', ...Object.keys(NATIVE_SHIMS).map(packageName), ...DEFAULT_SHARED_STATE_PACKAGES]);

const usesReact = (manifest: Manifest) => 'react' in (manifest.peerDependencies ?? {}) || 'react' in (manifest.dependencies ?? {});

const targetsReactNative = (manifest: Manifest) =>
  'react-native' in (manifest.peerDependencies ?? {}) ||
  'react-native' in (manifest.dependencies ?? {}) ||
  manifest['react-native'] !== undefined ||
  JSON.stringify(manifest.exports ?? null).includes('"react-native"');

/**
 * The web project's direct dependencies that render DOM with React and have no React Native build.
 * `include` adds libraries that render DOM without declaring react (older packages often do not).
 */
export const domRenderingPackages = (root: string, { include = [] }: { include?: string[] } = {}): string[] => {
  const manifest = readManifest(path.join(root, 'package.json'));
  const detected = Object.keys(manifest?.dependencies ?? {})
    .filter((name) => !SKIPPED.has(name) && !NATIVE_NAME.test(name))
    .filter((name) => {
      const dependency = readManifest(path.join(root, 'node_modules', name, 'package.json'));
      return dependency !== null && usesReact(dependency) && !targetsReactNative(dependency);
    });
  return [...new Set([...detected, ...include])].sort();
};

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A Babel override `test` that matches files of the given packages, including inside the pnpm store. */
export const isDomRenderingModule = (packages: string[]) => {
  const pattern = new RegExp(`[\\\\/]node_modules[\\\\/](${packages.map(escape).join('|')})[\\\\/]`);
  return (filename: string | undefined) => typeof filename === 'string' && packages.length > 0 && pattern.test(filename);
};
