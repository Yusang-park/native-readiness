export type Impact = 'blocks-native' | 'needs-port' | 'island-risk';

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
  | 'island-default-export';

export type Finding = {
  rule: RuleId;
  impact: Impact;
  file: string;
  line: number;
  column: number;
  message: string;
  inIsland: boolean;
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
};

export type Report = {
  version: 1;
  entries: string[];
  summary: Summary;
  files: Record<string, FileInfo>;
  blocked: BlockedBoundary[];
  islands: IslandCandidate[];
  portable: PortableCandidate[];
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
  sharedStatePackages?: string[];
  ignore?: string[];
  changedFiles?: string[];
};
