# Rendering web screens natively

This guide sets up an Expo app (inside the web repo, e.g. `native/`) that renders the web's own React components as real native views: HTML tags become React Native primitives, `className` is styled by NativeWind with the web's Tailwind theme, and browser globals are shimmed. Web changes reach the app without a fork.

Use `'use dom'` islands only for surfaces that cannot run natively (rich-text editors, canvas, iframes).

## Setup

### 1. Entry: install browser globals before any web code loads

`native/index.tsx` (set `"main": "index.tsx"` in `package.json`):

```tsx
import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';
import { installWebGlobals } from 'native-readiness/web-globals';
import { useEffect, useState } from 'react';
import { Dimensions } from 'react-native';

const ready = installWebGlobals({
  target: globalThis,
  origin: 'https://your-web-origin.example', // the dev server origin in development
  storage: AsyncStorage,                      // localStorage persists through AsyncStorage
  dimensions: Dimensions,
  navigate: (path) => { /* hand location/history changes to the native router */ },
});

// Web modules read browser globals as they load, so mount routes after localStorage is hydrated.
const routes = require.context('./app');
function App() {
  const [isReady, setReady] = useState(false);
  useEffect(() => void ready.then(() => setReady(true)), []);
  return isReady ? <ExpoRoot context={routes} /> : null;
}
registerRootComponent(App);
```

### 2. Babel: web JSX through native-readiness, library JSX through NativeWind

```js
const path = require('node:path');
const viteCompat = require('native-readiness/babel').default;
const createElement = require('native-readiness/babel-create-element');

const webRoot = path.resolve(__dirname, '..');
// Compiled web libraries that build DOM with React.createElement (skeletons, icon packs, auth UIs).
// Add packages that render DOM without declaring react to `include`.
const isDomRenderingModule = createElement.isDomRenderingModule(createElement.domRenderingPackages(webRoot, { include: [] }));

module.exports = (api) => {
  const isWeb = api.caller((caller) => caller?.platform === 'web');
  api.cache.using(() => isWeb);
  const shared = [[viteCompat, { root: webRoot }]];
  if (isWeb) return { presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]], plugins: shared };
  return {
    presets: [
      ['babel-preset-expo', { unstable_transformImportMeta: true, jsxImportSource: 'native-readiness' }],
      // NativeWind's preset without its JSX transform:
      () => ({ plugins: [require('react-native-css-interop/dist/babel-plugin').default, 'react-native-reanimated/plugin'] }),
    ],
    plugins: shared,
    overrides: [
      // Library JSX keeps NativeWind's runtime; mapping library JSX to HTML primitives loops.
      { test: /[\\/]node_modules[\\/]/, presets: [['babel-preset-expo', { unstable_transformImportMeta: true, jsxImportSource: 'nativewind' }]] },
      { test: isDomRenderingModule, plugins: [createElement.default] },
    ],
  };
};
```

### 3. Metro and Tailwind

- `metro.config.js`: `withNativeWind(withViteCompat(getDefaultConfig(__dirname), { root: '..', … }), { input: './global.css' })`. Add native modules the web's libraries need (AsyncStorage, netinfo, random values) to `singletons` so they resolve from the app.
- `tailwind.config.js`: `presets: [require('nativewind/preset')]`, the web's `theme`, and `content` covering both `app/` and the web source.
- `npx native-readiness theme --tailwind global.css` copies the web's CSS variables into NativeWind's input file (NativeWind only compiles that one file). `npx native-readiness fonts` downloads the Google Fonts the web loads and writes an `expo-font` manifest.

### 4. Screens

Each route renders a web page inside a memory router whose history hands unknown paths to the native stack, and wraps text in the body classes the web sets on `<body>`:

```tsx
<TextClassProvider value="font-sans text-foreground">
  <Stack screenOptions={{ headerShown: false }} />
</TextClassProvider>
```

### 5. Configuration the web gets from files

The app reads the same `.env*` files and generated config (`aws-exports.js`, etc.) as the web dev server. A fresh clone without them builds fine but every request fails; see Troubleshooting.

## Troubleshooting

Each entry is a failure seen in a real app, its cause, and where the fix lives.

### Rendering and styling

| Symptom | Cause | Fix |
|---|---|---|
| App hangs or loops on start | Library JSX went through the HTML-tag runtime | Keep `node_modules` on NativeWind's JSX runtime (Babel override above) |
| `View config getter callback for component 'span'` | A compiled library calls `React.createElement('span')` | Add it to `domRenderingPackages(…, { include })` (detected automatically when it declares react) |
| Crash with `focus-visible:` + `transition` | NativeWind on Reanimated 4 | The primitives drop `focus-visible:` (no keyboard focus ring on touch) |
| Pressed colors never show | NativeWind's `active:` cannot resolve CSS-variable colors | Primitives track press state and swap plain classes (`hover:` stands in when there is no `active:`) |
| Text inside a button swallows its press | State variants on text make NativeWind attach touch handlers | Primitives strip state variants from text |
| A button that started disabled never accepts a press | `pointer-events-none` (common in disabled styles) sticks on elements with `transition` after the class goes | Primitives set `pointerEvents` explicitly (`none` / `auto`) instead of leaving it to NativeWind |
| A sibling remounts (inputs lose text and focus) when `{value && <X />}` toggles | An empty string child was rendered as text, changing the tree shape | Primitives treat `''` like React does: no text node |
| First tap on a button under a focused input only closes the keyboard | `ScrollView` default `keyboardShouldPersistTaps` | Scroll containers use `handled` (taps land, as on the web) |
| `ring-*` invisible | NativeWind has no box-shadow rings | Translated to `border` |
| `h-[100dvh]`, `h-screen` wrong | No viewport units | Translated to `h-full` |
| `fixed` overlays misplaced | No fixed positioning | Translated to `absolute`; portals render in a full-screen `Modal` |
| Modal content under the status bar | `Modal` starts a new safe-area tree | The `react-dom` portal shim wraps it in `SafeAreaProvider` + top `SafeAreaView` |
| Whole screen read as one element by VoiceOver | `aria-label` on a plain container groups its subtree | Primitives keep labels only on interactive roles |

### Bundling and runtime

| Symptom | Cause | Fix |
|---|---|---|
| `Unable to resolve module ./src/…` for an `import()` page chunk | Metro dev lazy bundles resolve against the app folder, not the web root | `native-readiness/babel` bundles `import()` eagerly on every platform |
| `JSON Parse error: Unexpected character: <` from GraphQL/REST | Empty endpoint (missing `.env.*.local` or generated config), so requests hit Metro's HTML | Copy the env files and generated config the web dev server uses |
| Signed in, but auth calls say "not authenticated" and the session is gone on relaunch | Amplify (and similar SDKs) keep their own storage on React Native while the web code writes `localStorage` | Configure the SDK to use `globalThis.localStorage` (persisted by `installWebGlobals`) |
| `tslib` interop errors | Metro picks `tslib`'s CJS entry | `withViteCompat` redirects to the ES build |
| `console.log` not in the Metro terminal | Recent Expo versions send logs to DevTools only | Attach to the Hermes inspector (`/json/list` on the Metro port) and listen for `Runtime.consoleAPICalled` |

## Verifying on a simulator

- Drive flows with Maestro: `maestro --device <udid> test flow.yaml`. Pass credentials with `-e NAME=value`, never inline.
- `maestro hierarchy` shows what is on screen, including `enabled=false`, which tells a disabled control from a press that never arrives.
- Record press feedback with `xcrun simctl io <udid> recordVideo`, then sample frames.
- Symbolicate stacks with `POST /symbolicate` on the Metro port.
