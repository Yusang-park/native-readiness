export const DEFAULT_WEB_ONLY_PACKAGES = [
  'react-dom',
  'react-dom/*',
  'react-router-dom',
  'react-router',
  '@radix-ui/*',
  'recharts',
  '@nivo/*',
  'chart.js',
  'react-chartjs-2',
  'd3',
  'd3-*',
  '@dnd-kit/*',
  'framer-motion',
  'slate',
  'slate-*',
  '@udecode/plate*',
  '@udecode/cmdk',
  '@tiptap/*',
  'react-helmet',
  'react-helmet-async',
  'react-player',
  'react-dropzone',
  'cmdk',
];

export const DEFAULT_NATIVE_SAFE_PACKAGES = ['@radix-ui/react-slot', '@udecode/cn'];

export const DEFAULT_SHARED_STATE_PACKAGES = [
  'zustand',
  '@tanstack/react-query',
  '@apollo/client',
  'react-redux',
  'jotai',
  'recoil',
  'valtio',
  'mobx-react',
  'mobx-react-lite',
];

export const packageName = (specifier: string) => {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
};

const matches = (pattern: string, value: string) =>
  pattern.endsWith('*') ? value.startsWith(pattern.slice(0, -1)) : pattern === value;

export const matchesAny = (patterns: string[], specifier: string) =>
  patterns.some((pattern) => matches(pattern, specifier) || matches(pattern, packageName(specifier)));

export const isBareSpecifier = (specifier: string) =>
  !specifier.startsWith('.') && !specifier.startsWith('/') && !/^[a-z]+:/.test(specifier);
