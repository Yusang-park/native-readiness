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
    title: 'Uses Tailwind classes NativeWind cannot express',
    fix: 'Rewrite with flexbox utilities (flex-row, flex-wrap, basis-1/2) and pressed:/active: states instead of grid, hover:, pseudo-elements, cursor, and sticky/fixed positioning.',
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
};
