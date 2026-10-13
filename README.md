# native-readiness

A report-only checker that tells you how ready a React web codebase is to run on React Native (Expo), and what to do next.

It is built to work alongside AI coding agents such as Claude Code and Codex. It never edits code. It finds what breaks on native, suggests where to put a `'use dom'` boundary first, and ranks existing `'use dom'` islands as candidates for a real native migration. The agent does the fixing; the report does the triage.

## The maintainability model

Every `.native.tsx` file is a fork, and forks are where web and mobile drift apart. native-readiness is built around one rule: **fork only at the bottom, share everything above.**

| Layer | Example | Forks |
|---|---|---|
| Platform modules | env, storage, navigation, viewport | `.native.ts` allowed |
| Primitives | design-system atoms (Button, Text, Stack, Icon) | `.native.tsx` allowed, same props on both platforms |
| Everything above | molecules, blocks, pages | never forked, so a web change reaches mobile for free |
| Islands | editors, embeds, complex charts | `'use dom'`, which runs the web code itself and cannot drift |

The mobile app is the web's mobile-first base layout. With NativeWind, `sm:` / `md:` / `lg:` classes apply on native from the screen width, so one set of responsive classes serves both. That only works if responsive behavior lives in classes, not JavaScript width checks, and nothing is reachable by hover alone. The `js-breakpoint` and `hover-only` rules enforce this, and they improve the mobile web too.

## How it works

1. Starting from your entry screens, it walks the import graph using your `tsconfig.json` (path aliases included).
2. It resolves platform files the way Metro does: `button.ios.tsx` → `button.native.tsx` → `button.tsx`. Once a file has a `.native` sibling, the web version is never visited.
3. Every reachable file gets one of four statuses:

| Status | Meaning |
|---|---|
| **native** | Runs on React Native as is. |
| **portable** | Only needs mechanical porting: intrinsic DOM tags, Tailwind classes NativeWind cannot express. |
| **island** | Runs inside a `'use dom'` component (Expo DOM components). |
| **blocked** | Breaks the native build: browser-only packages, `window`/`document`, `import.meta`, stylesheets, iframes, `contentEditable`, … |

4. The report is ordered by what to do next:
   - **Fork drift**: forks outside the allowed layers, forks whose API differs from the web version, and forks left behind by a web change.
   - **Blocked**: one suggested boundary per contiguous blocked region. Components get `'use dom'`. Plain modules, and components imported by many files (where an island would mean one WebView per use), get a `.native` sibling instead. Island constraints are checked up front: app state read below the boundary (Zustand, React Query, Apollo, context) and props that do not serialize.
   - **Island migration candidates**: existing `'use dom'` islands ranked by reach, native importers, and the effort left inside them.
   - **Portable**: files that only need mechanical porting, ranked by how many entry screens reach them.

## Usage

```bash
npx native-readiness check --entry src/pages/home.tsx --entry src/pages/settings.tsx
npx native-readiness check --format json --out readiness.json
npx native-readiness check --changed            # only findings in files changed since HEAD
npx native-readiness explain                    # list rules
npx native-readiness explain island-shared-state
```

Progress tracking (optional ratchet):

```bash
npx native-readiness check --write-baseline .native-readiness.baseline.json
npx native-readiness check --baseline .native-readiness.baseline.json --fail-on-regression
```

The command exits 0 unless `--fail-on-regression` is set and new findings appeared.

### Config

`native-readiness.config.json` in the project root:

```json
{
  "entries": ["src/pages/home.tsx"],
  "tsconfig": "tsconfig.json",
  "platformSuffixes": [".ios", ".native", ""],
  "webOnlyPackages": ["my-web-widget"],
  "nativeSafePackages": ["@radix-ui/react-slot"],
  "sharedStatePackages": ["my-store"],
  "islandMaxImporters": 3,
  "layers": {
    "platform": ["src/platform/**"],
    "primitives": ["design-system/**"]
  },
  "breakpointHooks": ["useMediaQuery", "useIsMobile"],
  "ignore": ["src/legacy/"],
  "webGlobals": true,
  "viteCompat": true
}
```

## Running a Vite app inside `'use dom'` islands

The fastest way to the first native release is to render existing web screens in Expo DOM components and migrate them one by one. Metro is not Vite, so the package ships a compatibility layer.

`metro.config.js` in the native app (inside the web repo, e.g. `native/`):

```js
const { getDefaultConfig } = require('expo/metro-config');
const { withViteCompat } = require('native-readiness/metro');

module.exports = withViteCompat(getDefaultConfig(__dirname), {
  root: '..',                                   // the Vite project root
  ignore: ['build', 'e2e'],                     // root folders Metro should never crawl
  staticDirs: { '/': 'public' },                // files the app fetches from its own origin
  vitePlugins: [],                              // Vite plugins whose dev middleware generates files
  aliases: {},                                  // module replacements for the island bundle
  svgrOptions: { icon: true },                  // match vite-plugin-svgr
  pregenerateInclude: ['src'],                  // folders holding ?react SVGs and ?raw imports
});
```

`babel.config.js`:

```js
const path = require('node:path');
const viteCompat = require('native-readiness/babel').default;

module.exports = (api) => {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    plugins: [[viteCompat, { root: path.resolve(__dirname, '..') }]],
  };
};
```

What it covers:

| Vite feature | How it works on Metro |
|---|---|
| `import.meta.env` | Inlined from `.env`, `.env.local`, `.env.[mode]`, `.env.[mode].local` (`VITE_` only), plus `MODE`, `DEV`, `PROD` |
| `import.meta.glob` | Expanded at build time (eager, lazy, `import`, `query`) |
| tsconfig `paths` | Resolved from the web root's tsconfig; type-only (`.d.ts`) mappings are skipped like Vite does |
| `/src/...` root-absolute imports | Resolved against the web root |
| `?react` SVG imports | Compiled with SVGR when Metro starts; editor-only namespaces (Inkscape, Sodipodi) are stripped |
| `?raw` / `?url` | String modules / plain asset paths |
| `import()` chunks | Bundled eagerly on every platform: islands never fetch chunks outside the app, and native dev bundles never request lazy chunks Metro resolves against the wrong root |
| `public/` and dev-generated files | `staticDirs` and `vitePlugins` serve them from Metro, same origin as the island |
| One React | `react`, `react-dom`, `react-native`, `react-native-web`, `scheduler` always resolve from the native app |
| `tslib` | Redirected to its ES build, whose default entry Metro cannot interop |

Island tips learned the hard way:

- Expo's DOM root is a row flexbox. Wrap the web app in an element with `flex: 1 1 0%; min-width: 0`, or container-query layouts collapse to zero width.
- Each island is its own WebView with its own JavaScript state; `localStorage` is shared, so sessions carry across islands.
- If the web app hardcodes `BrowserRouter`, alias `react-router-dom` to a module whose router blocks paths owned by other native screens (`history.block` returning `false`) and hands them to the native stack.

## Rendering web screens natively

To render the web's components as real native views (HTML tags mapped to React Native primitives, styled by NativeWind with the web's theme), follow [docs/native-screens.md](docs/native-screens.md). It covers setup and a troubleshooting table of failures seen in real apps.

## Rules

| Rule | Impact | What it catches |
|---|---|---|
| `web-package` | blocks-native | Browser-only packages (react-dom, Radix, recharts, nivo, dnd-kit, Plate/Slate, …) |
| `dom-global` | blocks-native | `window`, `document`, `localStorage`, `sessionStorage`, `navigator`, `location` |
| `import-meta` | blocks-native | `import.meta` (not available under Metro) |
| `css-import` | blocks-native | Stylesheet imports |
| `dangerous-html` | blocks-native | `dangerouslySetInnerHTML` |
| `web-only-element` | blocks-native | `<iframe>`, `<canvas>`, `<video>`, `<audio>`, `<object>`, `<embed>` |
| `content-editable` | blocks-native | `contentEditable` |
| `dom-element` | needs-port | Intrinsic DOM tags |
| `tw-unsupported` | needs-port | Classes that change layout or content: `grid`, `before:`, `sticky`, `fixed`, arbitrary variants, … (`hover:` and `cursor-*` are harmless no-ops on native and are not reported) |
| `island-shared-state` | island-risk | An island reads app state that the native side will not share |
| `island-props` | island-risk | Function props (become async) or React node/ref props (cannot cross) |
| `island-default-export` | island-risk | A `'use dom'` file without a default export |
| `fork-outside-layer` | drift-risk | A `.native` fork outside the configured platform/primitive layers |
| `fork-api-drift` | drift-risk | Web and native versions export different names or props |
| `fork-stale` | drift-risk | The web file changed (in the diff, or in a later commit) but its `.native` sibling did not |
| `js-breakpoint` | responsive | Layout decided by `window.innerWidth`, `matchMedia`, or breakpoint hooks instead of classes |
| `hover-only` | responsive | Hidden content revealed only by `hover:` classes, or mouse handlers with no press/focus handler |

`native-readiness explain <rule>` prints the fix guide for each rule.

## Using it with AI coding agents

Add something like this to `AGENTS.md` / `CLAUDE.md`:

```markdown
## Native readiness
- Run `npx native-readiness check --changed` after editing files reachable from native entry screens.
- Fix every "Fork drift" item in the diff before finishing: a web change must reach its `.native` sibling.
- Only create `.native` files inside the configured platform and primitive layers. Never fork a page or block.
- Keep responsive behavior in Tailwind breakpoint classes, and never hide anything behind hover alone.
- Fix "Blocked" items first, usually by adding a `'use dom'` boundary at the suggested file.
- Never fix a warning by editing the web implementation's behavior; add a `.native.tsx` sibling instead.
- Run `npx native-readiness explain <rule>` before fixing an unfamiliar rule.
```

Agents that support skills can load [skills/native-readiness/SKILL.md](skills/native-readiness/SKILL.md), which carries the setup and debugging workflow.

## Limits

- Analysis is syntactic. Props are only checked when the component's props type is declared in the same file.
- Tailwind checks cover class strings in `className`, `cn`, `clsx`, `cva`, `tv`, and `twMerge`.
- Package lists are defaults; extend them per project in the config.

## License

MIT
