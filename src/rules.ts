import type { Impact, RuleId } from './types.js';

export type RuleDoc = {
  impact: Impact;
  title: string;
  fix: string;
};

export const RULES: Record<RuleId, RuleDoc> = {
  'web-package': {
    impact: 'blocks-native',
    title: 'Imports a package that only runs in a browser',
    fix: "Keep the component behind a 'use dom' boundary for now. To migrate, add a .native.tsx sibling that uses a React Native equivalent (for example victory-native or react-native-svg for charts, @react-navigation or expo-router for routing).",
  },
  'dom-global': {
    impact: 'blocks-native',
    title: 'Reads a browser global (window, document, localStorage, ...)',
    fix: 'Move the access behind a small platform module (for example storage.ts + storage.native.ts using AsyncStorage, or a viewport hook using useWindowDimensions) and import that instead.',
  },
  'import-meta': {
    impact: 'blocks-native',
    title: 'Uses import.meta, which Metro does not provide',
    fix: 'Read configuration through one env module with an env.native.ts sibling (EXPO_PUBLIC_* variables) instead of import.meta.env in shared code.',
  },
  'css-import': {
    impact: 'blocks-native',
    title: 'Imports a stylesheet',
    fix: "Express the styles as Tailwind classes NativeWind supports, or keep the component behind a 'use dom' boundary.",
  },
  'dangerous-html': {
    impact: 'blocks-native',
    title: 'Renders raw HTML with dangerouslySetInnerHTML',
    fix: "Keep it in a 'use dom' island, or render the content with a native HTML/markdown renderer in a .native.tsx sibling.",
  },
  'web-only-element': {
    impact: 'blocks-native',
    title: 'Renders an element with no native counterpart (iframe, canvas, video, ...)',
    fix: "Keep it in a 'use dom' island, or use react-native-webview, expo-video, or @shopify/react-native-skia in a .native.tsx sibling.",
  },
  'content-editable': {
    impact: 'blocks-native',
    title: 'Uses contentEditable',
    fix: "Rich-text editing has no native equivalent. Keep the editor in a 'use dom' island.",
  },
  'dom-element': {
    impact: 'needs-port',
    title: 'Renders intrinsic DOM elements',
    fix: 'Replace intrinsic tags with design-system atoms that have .native.tsx versions (View, Text, Pressable underneath). Text must live inside a Text component on native.',
  },
  'tw-unsupported': {
    impact: 'needs-port',
    title: 'Uses Tailwind classes that change layout or content and that NativeWind cannot express',
    fix: 'Rewrite with flexbox utilities (flex-row, flex-wrap, basis-1/2) instead of grid, pseudo-elements, and sticky/fixed positioning. Interaction-only classes such as hover: and cursor-* are harmless no-ops on native and are not reported.',
  },
  'island-shared-state': {
    impact: 'island-risk',
    title: "A 'use dom' island reads app state that is not shared with the native side",
    fix: "Each island runs in its own WebView with its own module instances. Read the state in the native parent and pass plain values as props, or push the boundary down below the state read.",
  },
  'island-props': {
    impact: 'island-risk',
    title: "A 'use dom' island takes props that do not serialize cleanly",
    fix: 'Function props become async bridge calls (return values arrive as promises). React nodes, children, and refs cannot cross the boundary; pass data instead and render it inside the island.',
  },
  'island-default-export': {
    impact: 'island-risk',
    title: "A 'use dom' file has no default export",
    fix: "Expo mounts the default export of a 'use dom' file. Export the component as default.",
  },
  'fork-outside-layer': {
    impact: 'drift-risk',
    title: 'A .native fork lives outside the platform and primitive layers',
    fix: 'Forks above the primitive layer drift from the web page. Delete the fork and make the shared file native-ready by using design-system primitives, or move the platform-specific part into a primitive or platform module and keep this file shared.',
  },
  'fork-api-drift': {
    impact: 'drift-risk',
    title: 'The web and native versions expose different exports or props',
    fix: 'Make both files export the same names with the same props. Prefer one props type in a shared types file imported by both versions.',
  },
  'fork-stale': {
    impact: 'drift-risk',
    title: 'The web version changed after its .native sibling',
    fix: 'Apply the same change to the .native sibling, or confirm it does not need one, so both platforms behave the same.',
  },
  'js-breakpoint': {
    impact: 'responsive',
    title: 'Layout depends on a JavaScript width check',
    fix: 'Use responsive Tailwind classes (sm:, md:, lg:), which NativeWind applies from the screen width on native too. If logic truly needs the width, read it from one viewport module in the platform layer.',
  },
  'hover-only': {
    impact: 'responsive',
    title: 'Something is only reachable by hovering',
    fix: 'Touch screens have no hover. Show the content by default on small screens, or add an equivalent focus:/active: variant or onClick handler.',
  },
};
