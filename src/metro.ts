import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { viteDevMiddleware, type VitePluginLike } from './vite/plugins.js';
import { NATIVE_SHIMS } from './packages.js';
import { serveStaticDirs, type StaticRequest, type StaticResponse } from './static.js';
import { pregenerateViteModules, resolveViteSpecifier, type ViteResolveOptions } from './vite/resolve.js';

type ResolutionContext = { originModulePath: string; resolveRequest: Resolver } & Record<string, unknown>;
type Middleware = (request: StaticRequest, response: StaticResponse, next: () => void) => unknown;
type EnhanceMiddleware = (metroMiddleware: Middleware, server: unknown) => Middleware;
type Resolver = (context: ResolutionContext, moduleName: string, platform: string | null) => unknown;

type MetroConfig = {
  projectRoot?: string;
  watchFolders?: string[];
  server?: { enhanceMiddleware?: EnhanceMiddleware } & Record<string, unknown>;
  resolver?: { resolveRequest?: Resolver | null; blockList?: RegExp | RegExp[] } & Record<string, unknown>;
} & Record<string, unknown>;

export type ViteCompatMetroOptions = {
  /** The web project root, relative to the native app or absolute. */
  root: string;
  /** Root-relative folders Metro should never crawl (build output, backend code, ...). */
  ignore?: string[];
  singletons?: string[];
  /** Specifier → file (relative to the native app) that replaces it, except inside that file. */
  aliases?: Record<string, string>;
  svgrOptions?: ViteResolveOptions['svgrOptions'];
  /**
   * URL prefix → web-root folder served the way Vite serves `public/`,
   * e.g. `{ '/': 'public', '/lang': 'lang' }`.
   */
  staticDirs?: Record<string, string>;
  /** Vite plugins whose `configureServer` middleware should also run on Metro (generated pages, assets). */
  vitePlugins?: VitePluginLike[];
  /** Generate SVG components and ?raw modules when the config loads. Defaults to true. */
  pregenerate?: boolean;
  /** Root-relative folders to scan for SVGs and ?raw imports. Defaults to the whole web root. */
  pregenerateInclude?: string[];
};

// One copy of React, and the native primitives' peers resolved from the app even when the
// library itself lives outside it (linked or installed from git).
const STYLESHEET = /\.(css|scss|sass|less)$/;

// The package root (dist/ or src/ sit one level below it).
const LIBRARY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_SINGLETONS = [
  'react',
  'react-dom',
  'react-native',
  'react-native-web',
  'scheduler',
  // Web-root files compiled with the native JSX runtime import it, but only the app depends on it.
  'native-readiness',
  'nativewind',
  'react-native-css-interop',
  'expo-image',
  'react-native-svg',
  'expo-router',
  'react-native-reanimated',
  'react-native-safe-area-context',
];

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Lets Metro bundle a Vite web codebase from a native app inside it:
 * watches the web root, resolves tsconfig aliases, `?react`/`?raw` imports and `/`-prefixed
 * imports, and keeps a single copy of React.
 */
export const withViteCompat = <T extends MetroConfig>(config: T, options: ViteCompatMetroOptions): T & MetroConfig => {
  const appRoot = path.resolve(config.projectRoot ?? process.cwd());
  const root = path.resolve(appRoot, options.root);
  const resolveOptions: ViteResolveOptions = {
    root,
    appRoot,
    cacheDir: path.join(appRoot, '.native-readiness'),
    singletons: options.singletons ?? DEFAULT_SINGLETONS,
    svgrOptions: options.svgrOptions,
    ignore: options.ignore,
    include: options.pregenerateInclude,
    aliases: Object.fromEntries(
      Object.entries(options.aliases ?? {}).map(([specifier, file]) => [specifier, path.resolve(appRoot, file)]),
    ),
  };
  if (options.pregenerate !== false) pregenerateViteModules(resolveOptions);
  const upstream = config.resolver?.resolveRequest ?? undefined;
  const existingBlock = config.resolver?.blockList;
  const blockList = [
    ...(Array.isArray(existingBlock) ? existingBlock : existingBlock ? [existingBlock] : []),
    ...(options.ignore ?? []).map((folder) => new RegExp(`^${escape(path.join(root, folder))}(/.*)?$`)),
  ];

  const staticDirs = options.staticDirs ?? {};
  const vitePlugins = options.vitePlugins ?? [];
  const upstreamEnhance = config.server?.enhanceMiddleware;
  const hasMiddleware = Object.keys(staticDirs).length > 0 || vitePlugins.length > 0;
  const server = hasMiddleware
    ? {
        ...config.server,
        enhanceMiddleware: (metroMiddleware: Middleware, metroServer: unknown): Middleware => {
          const inner = upstreamEnhance ? upstreamEnhance(metroMiddleware, metroServer) : metroMiddleware;
          const serve = serveStaticDirs(root, staticDirs);
          const plugins = viteDevMiddleware(vitePlugins, root);
          return (request, response, next) =>
            plugins(request, response, () =>
              serve(request, response, () => {
                inner(request, response, next);
              }),
            );
        },
      }
    : config.server;

  return {
    ...config,
    ...(server ? { server } : {}),
    watchFolders: [...new Set([...(config.watchFolders ?? []), root, LIBRARY_ROOT])],
    resolver: {
      ...config.resolver,
      blockList,
      resolveRequest: (context: ResolutionContext, moduleName: string, platform: string | null) => {
        const next = upstream ?? context.resolveRequest;
        // Metro never targets Node; server-only branches that import built-ins get empty modules.
        if (moduleName.startsWith('node:')) return { type: 'empty' };
        const shim = NATIVE_SHIMS[moduleName];
        if (platform !== 'web' && shim !== undefined) {
          return { type: 'sourceFile', filePath: path.join(LIBRARY_ROOT, 'dist', 'shims', `${shim}.js`) };
        }
        // On native, web components are styled by their classes; their stylesheets are web-only.
        const fromWebCode = !path.resolve(context.originModulePath).startsWith(`${appRoot}${path.sep}`);
        if (platform !== 'web' && STYLESHEET.test(moduleName.split('?')[0] ?? moduleName) && fromWebCode) return { type: 'empty' };
        const resolution = resolveViteSpecifier(moduleName, context.originModulePath, resolveOptions);
        if (resolution === null) return next(context, moduleName, platform);
        if ('filePath' in resolution) return { type: 'sourceFile', filePath: resolution.filePath };
        const nextContext = resolution.originModulePath ? { ...context, originModulePath: resolution.originModulePath } : context;
        return next(nextContext, resolution.moduleName, platform);
      },
    },
  };
};
