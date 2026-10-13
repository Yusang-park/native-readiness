import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const stub = (name: string) => fileURLToPath(new URL(`./test/stubs/${name}`, import.meta.url));

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    // Primitive tests render through react-native-web in jsdom.
    alias: [
      { find: /^react-native$/, replacement: 'react-native-web' },
      { find: /^nativewind\/jsx-runtime$/, replacement: 'react/jsx-runtime' },
      { find: /^nativewind\/jsx-dev-runtime$/, replacement: 'react/jsx-dev-runtime' },
      { find: /^expo-image$/, replacement: stub('expo-image.tsx') },
      { find: /^react-native-svg$/, replacement: stub('react-native-svg.tsx') },
      { find: /^nativewind$/, replacement: stub('nativewind.ts') },
      { find: /^react-native-safe-area-context$/, replacement: stub('safe-area.tsx') },
    ],
  },
  test: { exclude: ['**/node_modules/**', 'dist/**', 'test/fixtures/**'] },
});
