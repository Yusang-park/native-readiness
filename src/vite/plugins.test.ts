import { describe, expect, it } from 'vitest';
import { viteDevMiddleware, type ViteDevServerShim } from './plugins.js';

type Sent = { body?: string; type?: string; nextCalled: boolean };

const run = async (middleware: ReturnType<typeof viteDevMiddleware>, url: string) => {
  const sent: Sent = { nextCalled: false };
  await new Promise<void>((resolve) => {
    middleware(
      { url, method: 'GET' },
      {
        statusCode: 200,
        setHeader: (_name: string, value: string) => {
          sent.type = value;
        },
        end: (body?: string | Buffer) => {
          sent.body = body?.toString();
          resolve();
        },
      },
      () => {
        sent.nextCalled = true;
        resolve();
      },
    );
  });
  return sent;
};

const htmlPlugin = {
  name: 'html',
  configureServer(server: ViteDevServerShim) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url === '/generated.html') {
        res.setHeader('Content-Type', 'text/html');
        res.end(await server.transformIndexHtml('/', '<p>generated</p>'));
        return;
      }
      next();
    });
  },
};

describe('viteDevMiddleware', () => {
  it("serves responses from a Vite plugin's configureServer middleware", async () => {
    const sent = await run(viteDevMiddleware([htmlPlugin], '/repo'), '/generated.html');
    expect(sent.body).toBe('<p>generated</p>');
    expect(sent.type).toBe('text/html');
  });

  it('falls through when no plugin handles the request', async () => {
    expect((await run(viteDevMiddleware([htmlPlugin], '/repo'), '/other')).nextCalled).toBe(true);
  });

  it('runs post hooks returned from configureServer', async () => {
    const postPlugin = {
      name: 'post',
      configureServer(server: ViteDevServerShim) {
        return () => {
          server.middlewares.use((_req, res) => res.end('post'));
        };
      },
    };
    expect((await run(viteDevMiddleware([postPlugin], '/repo'), '/x')).body).toBe('post');
  });

  it('supports async configureServer hooks', async () => {
    const asyncPlugin = {
      name: 'async',
      async configureServer(server: ViteDevServerShim) {
        await Promise.resolve();
        server.middlewares.use((_req, res) => res.end('async'));
      },
    };
    expect((await run(viteDevMiddleware([asyncPlugin], '/repo'), '/x')).body).toBe('async');
  });

  it('ignores plugins without configureServer', async () => {
    expect((await run(viteDevMiddleware([{ name: 'none' }], '/repo'), '/x')).nextCalled).toBe(true);
  });

  it('supports connect route mounting with use(path, handler)', async () => {
    const mounted = {
      name: 'mounted',
      configureServer(server: ViteDevServerShim) {
        server.middlewares.use('/generated/file.js', (_req, res) => res.end('mounted'));
      },
    };
    const middleware = viteDevMiddleware([mounted], '/repo');
    expect((await run(middleware, '/generated/file.js?v=1')).body).toBe('mounted');
    expect((await run(middleware, '/generated/file.jsx')).nextCalled).toBe(true);
  });
});
