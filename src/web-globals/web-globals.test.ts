import { describe, expect, it, vi } from 'vitest';
import { installWebGlobals } from './web-globals.js';

const fakeStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getAllKeys: vi.fn(async () => [...data.keys()]),
    multiGet: vi.fn(async (keys: readonly string[]) => keys.map((key): [string, string | null] => [key, data.get(key) ?? null])),
    setItem: vi.fn(async (key: string, value: string) => void data.set(key, value)),
    removeItem: vi.fn(async (key: string) => void data.delete(key)),
    clear: vi.fn(async () => data.clear()),
  };
};

const fakeDimensions = (width: number, height = 800) => {
  const listeners: Array<(event: { window: { width: number; height: number } }) => void> = [];
  return {
    get: () => ({ width, height }),
    addEventListener: (_type: 'change', listener: (event: { window: { width: number; height: number } }) => void) => {
      listeners.push(listener);
      return { remove: () => undefined };
    },
    resize: (next: number) => {
      width = next;
      for (const listener of listeners) listener({ window: { width: next, height } });
    },
  };
};

const setup = async (overrides: Record<string, unknown> = {}) => {
  const target: Record<string, unknown> = { fetch: vi.fn(async () => new Response('ok')) };
  const storage = fakeStorage({ 'session:a': 'token' });
  const dimensions = fakeDimensions(400);
  const navigate = vi.fn();
  await installWebGlobals({ target, origin: 'https://app.example.com', storage, dimensions, navigate, ...overrides });
  return { target, storage, dimensions, navigate };
};

describe('installWebGlobals', () => {
  it('provides localStorage hydrated from persistent storage', async () => {
    const { target } = await setup();
    const localStorage = target.localStorage as Storage;
    expect(localStorage.getItem('session:a')).toBe('token');
    expect(localStorage.length).toBe(1);
  });

  it('persists localStorage writes and removals', async () => {
    const { target, storage } = await setup();
    const localStorage = target.localStorage as Storage;
    localStorage.setItem('theme', 'dark');
    localStorage.removeItem('session:a');
    expect(storage.setItem).toHaveBeenCalledWith('theme', 'dark');
    expect(storage.removeItem).toHaveBeenCalledWith('session:a');
    expect(localStorage.key(0)).toBe('theme');
  });

  it('provides an in-memory sessionStorage', async () => {
    const { target, storage } = await setup();
    (target.sessionStorage as Storage).setItem('x', '1');
    expect((target.sessionStorage as Storage).getItem('x')).toBe('1');
    expect(storage.setItem).not.toHaveBeenCalledWith('x', '1');
  });

  it('reports location from the current native path on the web origin', async () => {
    const { target } = await setup();
    const location = target.location as Location;
    expect(location.origin).toBe('https://app.example.com');
    expect(location.pathname).toBe('/');
  });

  it('follows the native route through the returned controller', async () => {
    const target: Record<string, unknown> = { fetch: vi.fn() };
    const controller = await installWebGlobals({ target, origin: 'https://app.example.com', storage: fakeStorage(), dimensions: fakeDimensions(400), navigate: vi.fn() });
    controller.setPath('/s/abc?lang=ko#top');
    const location = target.location as Location;
    expect([location.pathname, location.search, location.hash]).toEqual(['/s/abc', '?lang=ko', '#top']);
    expect(location.href).toBe('https://app.example.com/s/abc?lang=ko#top');
  });

  it('routes location changes through the native navigator', async () => {
    const { target, navigate } = await setup();
    (target.location as Location).assign('/s/abc?lang=en');
    expect(navigate).toHaveBeenCalledWith('/s/abc?lang=en');
    (target.location as Location).href = 'https://app.example.com/dashboard';
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('answers window size and width media queries from the screen', async () => {
    const { target, dimensions } = await setup();
    expect(target.innerWidth).toBe(400);
    const matchMedia = target.matchMedia as (query: string) => MediaQueryList;
    expect(matchMedia('(max-width: 719px)').matches).toBe(true);
    expect(matchMedia('(min-width: 720px)').matches).toBe(false);
    dimensions.resize(800);
    expect(matchMedia('(min-width: 720px)').matches).toBe(true);
    expect(target.innerWidth).toBe(800);
  });

  it('notifies media query listeners when the screen size crosses a breakpoint', async () => {
    const { target, dimensions } = await setup();
    const query = (target.matchMedia as (query: string) => MediaQueryList)('(min-width: 720px)');
    const listener = vi.fn();
    query.addEventListener('change', listener);
    dimensions.resize(800);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ matches: true }));
  });

  it('treats hover and pointer queries as a touch screen', async () => {
    const { target } = await setup();
    const matchMedia = target.matchMedia as (query: string) => MediaQueryList;
    expect(matchMedia('(hover: hover)').matches).toBe(false);
    expect(matchMedia('(pointer: coarse)').matches).toBe(true);
  });

  it('resolves relative fetches against the web origin', async () => {
    const fetchSpy = vi.fn(async () => new Response('ok'));
    const target: Record<string, unknown> = { fetch: fetchSpy };
    await installWebGlobals({ target, origin: 'https://app.example.com', storage: fakeStorage(), dimensions: fakeDimensions(400), navigate: vi.fn() });
    await (target.fetch as typeof fetch)('/lang/en.json');
    expect(fetchSpy).toHaveBeenCalledWith('https://app.example.com/lang/en.json', undefined);
  });

  it('leaves absolute fetches alone', async () => {
    const fetchSpy = vi.fn(async () => new Response('ok'));
    const target: Record<string, unknown> = { fetch: fetchSpy };
    await installWebGlobals({ target, origin: 'https://app.example.com', storage: fakeStorage(), dimensions: fakeDimensions(400), navigate: vi.fn() });
    await (target.fetch as typeof fetch)('https://api.example.com/graphql');
    expect(fetchSpy).toHaveBeenCalledWith('https://api.example.com/graphql', undefined);
  });

  it('provides a minimal document that web code can touch safely', async () => {
    const { target } = await setup();
    const document = target.document as Document;
    document.documentElement.classList.add('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.getElementById('missing')).toBeNull();
    expect(document.querySelectorAll('div')).toHaveLength(0);
    expect(() => document.addEventListener('visibilitychange', () => undefined)).not.toThrow();
  });

  it('supports the common document query methods', async () => {
    const { target } = await setup();
    const document = target.document as Document;
    expect(Array.from(document.getElementsByClassName('x'))).toEqual([]);
    expect(Array.from(document.getElementsByName('x'))).toEqual([]);
    expect(document.activeElement).toBeNull();
    expect(document.createTextNode('a')).toBeTruthy();
  });

  it('provides event, element and observer constructors for instanceof checks and new', async () => {
    const { target } = await setup();
    for (const name of ['Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'PointerEvent']) {
      const EventClass = target[name] as new (type: string) => { type: string };
      expect(new EventClass('click').type).toBe('click');
    }
    for (const name of ['Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'SVGElement']) {
      expect(typeof target[name]).toBe('function');
      expect({} instanceof (target[name] as new () => unknown)).toBe(false);
    }
    for (const name of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) {
      const Observer = target[name] as new (callback: () => void) => { observe: () => void; disconnect: () => void };
      const observer = new Observer(() => undefined);
      expect(() => observer.observe()).not.toThrow();
      expect(() => observer.disconnect()).not.toThrow();
    }
  });

  it('fills in navigator.language', async () => {
    const { target } = await setup({ locale: 'ko-KR' });
    expect((target.navigator as Navigator).language).toBe('ko-KR');
    expect((target.navigator as Navigator).languages).toEqual(['ko-KR']);
  });

  it('does not overwrite globals that already exist', async () => {
    const existing = { getItem: () => 'kept' };
    const target: Record<string, unknown> = { localStorage: existing, fetch: vi.fn() };
    await installWebGlobals({ target, origin: 'https://app.example.com', storage: fakeStorage(), dimensions: fakeDimensions(400), navigate: vi.fn() });
    expect(target.localStorage).toBe(existing);
  });
});
