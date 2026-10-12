import fs from 'node:fs';
import path from 'node:path';

export type StaticRequest = { url?: string; method?: string };
export type StaticResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string | Buffer) => void;
};
type Next = () => void;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

const isMetroRoute = (pathname: string) =>
  pathname.endsWith('.bundle') || pathname.endsWith('.map') || /^\/(_expo|\.expo|assets|symbolicate|status|message|logs|hot|inspector|json)(\/|$)/.test(pathname);

/**
 * Connect-style middleware that serves web-root folders the way Vite serves `public/`,
 * so a DOM island can fetch the same same-origin files the web app does.
 * `dirs` maps URL prefixes to folders relative to `root`, e.g. `{ '/': 'public', '/lang': 'lang' }`.
 */
export const serveStaticDirs = (root: string, dirs: Record<string, string>, fallback?: Next) => {
  const mounts = Object.entries(dirs)
    .map(([prefix, folder]) => ({ prefix: prefix.replace(/\/+$/, ''), folder: path.resolve(root, folder) }))
    .sort((a, b) => b.prefix.length - a.prefix.length);

  return (request: StaticRequest, response: StaticResponse, next?: Next) => {
    const pass = next ?? fallback ?? (() => undefined);
    if (request.method !== 'GET' && request.method !== 'HEAD') return pass();
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    } catch {
      return pass();
    }
    if (isMetroRoute(pathname)) return pass();
    for (const { prefix, folder } of mounts) {
      if (prefix !== '' && pathname !== prefix && !pathname.startsWith(`${prefix}/`)) continue;
      const file = path.resolve(folder, `.${pathname.slice(prefix.length)}`);
      if (!file.startsWith(`${folder}${path.sep}`)) continue;
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
      response.statusCode = 200;
      response.setHeader('Content-Type', CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
      response.end(request.method === 'HEAD' ? undefined : fs.readFileSync(file));
      return undefined;
    }
    return pass();
  };
};
