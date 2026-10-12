# native-readiness

A report-only checker that tells you how ready a React web codebase is to run on React Native (Expo), and what to do next.

It is built to work alongside AI coding agents such as Claude Code and Codex. It never edits code. It finds what breaks on native, suggests where to put a `'use dom'` boundary first, and ranks existing `'use dom'` islands as candidates for a real native migration. The agent does the fixing; the report does the triage.

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
  "ignore": ["src/legacy/"]
}
```

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
| `tw-unsupported` | needs-port | `grid`, `hover:`, `before:`, `cursor-*`, `sticky`, `fixed`, arbitrary variants, … |
| `island-shared-state` | island-risk | An island reads app state that the native side will not share |
| `island-props` | island-risk | Function props (become async) or React node/ref props (cannot cross) |
| `island-default-export` | island-risk | A `'use dom'` file without a default export |

`native-readiness explain <rule>` prints the fix guide for each rule.

## Using it with AI coding agents

Add something like this to `AGENTS.md` / `CLAUDE.md`:

```markdown
## Native readiness
- Run `npx native-readiness check --changed` after editing files reachable from native entry screens.
- Fix "Blocked" items first, usually by adding a `'use dom'` boundary at the suggested file.
- Never fix a warning by editing the web implementation's behavior; add a `.native.tsx` sibling instead.
- Run `npx native-readiness explain <rule>` before fixing an unfamiliar rule.
```

## Limits

- Analysis is syntactic. Props are only checked when the component's props type is declared in the same file.
- Tailwind checks cover class strings in `className`, `cn`, `clsx`, `cva`, `tv`, and `twMerge`.
- Package lists are defaults; extend them per project in the config.

## License

MIT
