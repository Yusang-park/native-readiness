export type Impact = 'blocks-native' | 'needs-port' | 'island-risk' | 'drift-risk' | 'responsive';

export type RuleId =
  | 'web-package'
  | 'dom-global'
  | 'import-meta'
  | 'css-import'
  | 'dangerous-html'
  | 'web-only-element'
  | 'content-editable'
  | 'dom-element'
  | 'tw-unsupported'
  | 'island-shared-state'
  | 'island-props'
  | 'island-default-export'
  | 'fork-outside-layer'
  | 'fork-api-drift'
  | 'fork-stale'
  | 'js-breakpoint'
  | 'hover-only';

export type Finding = {
  rule: RuleId;
  impact: Impact;
  file: string;
  line: number;
  column: number;
  message: string;
  inIsland: boolean;
  related?: string;
};

export type FileStatus = 'native' | 'portable' | 'island' | 'blocked';

export type FileInfo = {
  status: FileStatus;
  imports: string[];
  importers: string[];
  packages: string[];
  reach: number;
};

export type BlockedBoundary = {
  boundary: string;
  strategy: 'use-dom' | 'native-file';
  covers: string[];
  rules: RuleId[];
  notes: string[];
  reach: number;
};

export type IslandCandidate = {
  file: string;
  covers: string[];
  reach: number;
  importers: number;
  effort: number;
  score: number;
  rules: RuleId[];
};

export type PortableCandidate = {
  file: string;
  reach: number;
  importers: number;
  findings: number;
};

export type Summary = {
  files: number;
  native: number;
  portable: number;
  island: number;
  blocked: number;
  islandRatio: number;
  forks: number;
  forksOutsideLayers: number;
  sharedRatio: number;
};

export type Layers = {
  platform?: string[];
  primitives?: string[];
};

export type ForkPair = {
  native: string;
  web: string | null;
  layer: keyof Layers | null;
  rules: RuleId[];
};

export type Report = {
  version: 1;
  entries: string[];
  summary: Summary;
  files: Record<string, FileInfo>;
  blocked: BlockedBoundary[];
  islands: IslandCandidate[];
  portable: PortableCandidate[];
  forks: ForkPair[];
  findings: Finding[];
};

export type AnalyzeOptions = {
  root: string;
  entries: string[];
  tsconfig?: string;
  platformSuffixes?: string[];
  webOnlyPackages?: string[];
  nativeSafePackages?: string[];
  islandMaxImporters?: number;
  layers?: Layers;
  breakpointHooks?: string[];
  lastChanged?: (file: string) => number | undefined;
  /** The app installs native-readiness web globals, so browser globals work at runtime. */
  webGlobals?: boolean;
  /** The app uses the Vite compatibility layer (import.meta.env, stylesheet imports). */
  viteCompat?: boolean;
  sharedStatePackages?: string[];
  ignore?: string[];
  changedFiles?: string[];
};
