---
name: native-readiness
description: Port a React web app (Vite + Tailwind) to an Expo app that renders the same components natively with native-readiness, and debug native rendering, press, input and bundling problems. Use when adding a native screen, when a shared web component misbehaves on iOS/Android, or when setting up native-readiness in a new project.
---

# native-readiness

The native app reuses the web's components. Fix problems in the shared layer (native-readiness, or the design-system atom) so every screen and every project gets the fix. Never fork a page or block to make it work natively.

## Setting up a new project

Follow `docs/native-screens.md` in the native-readiness repo: entry with `installWebGlobals`, Babel (native-readiness JSX for web code, NativeWind JSX for `node_modules`, `domRenderingPackages` for compiled DOM libraries), Metro (`withViteCompat` + `withNativeWind`), the web's Tailwind theme, `theme` and `fonts` commands.

Before the first run, make sure the app sees the same `.env*` files and generated config as the web dev server. Missing ones fail silently: requests go to an empty URL.

## Debugging workflow

1. Reproduce on a simulator with a Maestro flow, not by reasoning. Keep credentials in `-e` variables.
2. Find which layer fails before changing anything:
   - `maestro hierarchy`: is the element there, where, and is it `enabled`?
   - Hermes inspector console (`/json/list` on the Metro port, `Runtime.consoleAPICalled`): did the handler run? Temporary logs go in the handler you suspect, one layer at a time (primitive press → component handler → app logic → network).
   - Screenshots or a screen recording for visual state.
3. Match the symptom against the Troubleshooting tables in `docs/native-screens.md`.
4. Fix it in native-readiness with a failing test first (primitives render through react-native-web in jsdom; capture native-only props with `vi.mock('react-native-web')`), then rebuild (`pnpm build`) and restart Metro with `--clear`: Metro does not watch a linked package's `dist`.
5. Verify the full flow again on the simulator and remove every temporary log.

## Rules learned the hard way

- A fix must keep web semantics. Example: `pointer-events-none` means "touches pass through", so it maps to `pointerEvents="none"`, not `disabled` (a disabled Pressable still swallows touches and blocks the input under an overlay).
- Tree shape must not change when content toggles. Anything that turns a child into a different element type (text vs. view, an extra wrapper) remounts siblings and loses input focus and text.
- NativeWind keeps a style whose class was removed when the element has a transition. Set such props (pointerEvents, and anything similar) explicitly on both branches.
- A control that looks enabled may still be disabled in state: check `enabled` in the hierarchy before chasing touch handling.
- Compiled libraries do not go through the JSX runtime. `React.createElement('div')` in `node_modules` needs the createElement Babel plugin.
- SDKs that pick their own storage on React Native (Amplify Auth) must be pointed at `globalThis.localStorage`, or sessions written by web code are invisible to them.
- Do not leave lazy `import()` to Metro on native; it resolves dev chunks against the wrong root.
