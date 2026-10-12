import type { StaticRequest, StaticResponse } from '../static.js';

type Next = (error?: unknown) => void;
type ConnectHandler = (request: StaticRequest, response: StaticResponse, next: Next) => unknown;

/** The subset of Vite's dev server that `configureServer` hooks commonly use. */
export type ViteDevServerShim = {
  config: { root: string; command: 'serve'; mode: string };
  middlewares: { use(handlerOrRoute: ConnectHandler | string, handler?: ConnectHandler): void };
  transformIndexHtml: (url: string, html: string) => Promise<string>;
};

export type VitePluginLike = {
  name?: string;
  // Method syntax keeps the parameter bivariant, so real Vite plugins typed against the full
  // ViteDevServer are accepted; they receive the shim, which covers what middleware hooks use.
  configureServer?(server: ViteDevServerShim): unknown;
};

const isFunction = (value: unknown): value is () => unknown => typeof value === 'function';

/**
 * Runs the `configureServer` hooks of Vite plugins against a minimal server and returns one
 * connect middleware, so files a Vite dev server generates on the fly are served from Metro too.
 */
export const viteDevMiddleware = (plugins: VitePluginLike[], root: string, mode = 'development') => {
  const handlers: ConnectHandler[] = [];
  const server: ViteDevServerShim = {
    config: { root, command: 'serve', mode },
    middlewares: {
      use(handlerOrRoute, handler) {
        if (typeof handlerOrRoute !== 'string') {
          handlers.push(handlerOrRoute);
          return;
        }
        if (!handler) return;
        const route = handlerOrRoute.replace(/\/+$/, '');
        // Connect mounting: match the route or a sub-path, and pass the remainder as req.url.
        handlers.push((request, response, next) => {
          const url = request.url ?? '/';
          const pathname = url.split('?')[0] ?? url;
          if (pathname !== route && !pathname.startsWith(`${route}/`)) return next();
          const rest = url.slice(route.length);
          // Like connect, rewrite req.url in place (keeping the real request object) and restore it.
          request.url = rest.startsWith('/') ? rest : `/${rest}`;
          return handler(request, response, (error?: unknown) => {
            request.url = url;
            next(error);
          });
        });
      },
    },
    transformIndexHtml: async (_url, html) => html,
  };
  const ready = (async () => {
    const postHooks: Array<() => unknown> = [];
    for (const plugin of plugins) {
      const result = await plugin.configureServer?.(server);
      if (isFunction(result)) postHooks.push(result);
    }
    for (const hook of postHooks) await hook();
  })();

  return (request: StaticRequest, response: StaticResponse, next: Next) => {
    void ready.then(() => {
      const dispatch = (index: number, error?: unknown) => {
        const handler = handlers[index];
        if (error !== undefined || handler === undefined) return next(error);
        void Promise.resolve(handler(request, response, (nextError?: unknown) => dispatch(index + 1, nextError))).catch(next);
        return undefined;
      };
      dispatch(0);
    }, next);
  };
};
