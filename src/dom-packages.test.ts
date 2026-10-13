import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { domRenderingPackages, isDomRenderingModule } from './dom-packages.js';

let root: string;

const writeJson = (file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
};

const addPackage = (name: string, manifest: Record<string, unknown>) =>
  writeJson(path.join(root, 'node_modules', name, 'package.json'), { name, ...manifest });

const setDependencies = (dependencies: Record<string, string>) =>
  writeJson(path.join(root, 'package.json'), { name: 'web', dependencies });

describe('domRenderingPackages', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dom-packages-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('finds a React component library that has no React Native support', () => {
    setDependencies({ 'react-loading-skeleton': '3' });
    addPackage('react-loading-skeleton', { peerDependencies: { react: '*' } });
    expect(domRenderingPackages(root)).toEqual(['react-loading-skeleton']);
  });

  it('counts react in dependencies too', () => {
    setDependencies({ 'old-kit': '1' });
    addPackage('old-kit', { dependencies: { react: '*' } });
    expect(domRenderingPackages(root)).toEqual(['old-kit']);
  });

  it('skips packages that do not use React', () => {
    setDependencies({ lodash: '4' });
    addPackage('lodash', {});
    expect(domRenderingPackages(root)).toEqual([]);
  });

  it('skips packages that depend on react-native', () => {
    setDependencies({ 'rn-kit': '1' });
    addPackage('rn-kit', { peerDependencies: { react: '*', 'react-native': '*' } });
    expect(domRenderingPackages(root)).toEqual([]);
  });

  it('skips packages with a react-native entry point', () => {
    setDependencies({ 'dual-kit': '1' });
    addPackage('dual-kit', { peerDependencies: { react: '*' }, 'react-native': 'native.js' });
    expect(domRenderingPackages(root)).toEqual([]);
  });

  it('skips packages with a react-native export condition', () => {
    setDependencies({ 'cond-kit': '1' });
    addPackage('cond-kit', { peerDependencies: { react: '*' }, exports: { '.': { 'react-native': './n.js', default: './w.js' } } });
    expect(domRenderingPackages(root)).toEqual([]);
  });

  it('skips React Native and Expo packages by name', () => {
    setDependencies({ 'react-native-svg': '1', 'expo-image': '1', '@react-native-async-storage/async-storage': '1' });
    addPackage('react-native-svg', { peerDependencies: { react: '*' } });
    addPackage('expo-image', { peerDependencies: { react: '*' } });
    addPackage('@react-native-async-storage/async-storage', { peerDependencies: { react: '*' } });
    expect(domRenderingPackages(root)).toEqual([]);
  });

  it('skips packages native-readiness shims and react itself', () => {
    setDependencies({ 'framer-motion': '1', react: '18', 'react-dom': '18' });
    addPackage('framer-motion', { peerDependencies: { react: '*' } });
    addPackage('react', {});
    addPackage('react-dom', { peerDependencies: { react: '*' } });
    expect(domRenderingPackages(root)).toEqual([]);
  });

  it('skips shared state libraries, which render no DOM', () => {
    setDependencies({ '@tanstack/react-query': '5', zustand: '4' });
    addPackage('@tanstack/react-query', { peerDependencies: { react: '*' } });
    addPackage('zustand', { peerDependencies: { react: '*' } });
    expect(domRenderingPackages(root)).toEqual([]);
  });

  it('ignores dependencies that are not installed', () => {
    setDependencies({ missing: '1' });
    expect(domRenderingPackages(root)).toEqual([]);
  });

  it('adds packages listed in include, for libraries that do not declare react', () => {
    setDependencies({ 'legacy-auth-ui': '1' });
    addPackage('legacy-auth-ui', {});
    expect(domRenderingPackages(root, { include: ['legacy-auth-ui'] })).toEqual(['legacy-auth-ui']);
  });

  it('returns scoped packages sorted', () => {
    setDependencies({ 'z-kit': '1', '@a/kit': '1' });
    addPackage('z-kit', { peerDependencies: { react: '*' } });
    addPackage('@a/kit', { peerDependencies: { react: '*' } });
    expect(domRenderingPackages(root)).toEqual(['@a/kit', 'z-kit']);
  });
});

describe('isDomRenderingModule', () => {
  const test = isDomRenderingModule(['react-loading-skeleton', '@a/kit']);

  it('matches files of a listed package', () => {
    expect(test('/app/node_modules/react-loading-skeleton/dist/index.js')).toBe(true);
  });

  it('matches files inside the pnpm store', () => {
    expect(test('/app/node_modules/.pnpm/react-loading-skeleton@3.5.0/node_modules/react-loading-skeleton/dist/index.js')).toBe(true);
  });

  it('matches scoped packages', () => {
    expect(test('/app/node_modules/@a/kit/index.js')).toBe(true);
  });

  it('does not match a package that only shares a prefix', () => {
    expect(test('/app/node_modules/react-loading-skeleton-extra/index.js')).toBe(false);
  });

  it('does not match app source', () => {
    expect(test('/app/src/react-loading-skeleton/index.js')).toBe(false);
  });

  it('does not match a missing filename', () => {
    expect(test(undefined)).toBe(false);
  });
});
