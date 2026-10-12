import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { serveStaticDirs } from './static.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../test/fixtures/vite-app');
const dirs = { '/': 'public', '/lang': 'lang' };

type Captured = { status?: number; headers: Record<string, string>; body?: string; nextCalled: boolean };

const request = (url: string) => {
  const captured: Captured = { headers: {}, nextCalled: false };
  const middleware = serveStaticDirs(root, dirs, () => {
    captured.nextCalled = true;
  });
  middleware(
    { url, method: 'GET' },
    {
      statusCode: 200,
      setHeader: (name: string, value: string) => {
        captured.headers[name.toLowerCase()] = value;
      },
      end: (body?: string | Buffer) => {
        captured.body = body?.toString();
      },
    },
  );
  return captured;
};

describe('serveStaticDirs', () => {
  it('serves files from the public folder at the root path', () => {
    const result = request('/landing/home.html');
    expect(result.body).toBe('<p>landing</p>\n');
    expect(result.headers['content-type']).toContain('text/html');
  });

  it('serves files from mounted folders', () => {
    const result = request('/lang/en.json?v=3');
    expect(result.body).toBe('{"hello":"Hello"}\n');
    expect(result.headers['content-type']).toContain('application/json');
  });

  it('passes unknown paths to Metro', () => {
    expect(request('/missing.json').nextCalled).toBe(true);
  });

  it('never shadows bundle requests', () => {
    expect(request('/index.bundle?platform=ios').nextCalled).toBe(true);
  });

  it('blocks path traversal out of the folder', () => {
    expect(request('/../.env.secret-test').nextCalled).toBe(true);
    expect(request('/lang/..%2F.env.secret-test').nextCalled).toBe(true);
  });

  it('does not serve directories', () => {
    expect(request('/landing').nextCalled).toBe(true);
  });
});
