// Browser globals for React Native, so shared web code runs without forks: localStorage backed
// by persistent storage, a location tied to the native router, matchMedia and window size from
// the screen, relative fetches resolved against the web origin, and a minimal document.

type PersistentStorage = {
  getAllKeys: () => Promise<readonly string[]>;
  multiGet: (keys: readonly string[]) => Promise<ReadonlyArray<readonly [string, string | null]>>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  clear: () => Promise<void>;
};

type ScreenSize = { width: number; height: number };

type Dimensions = {
  get: (dimension: 'window') => ScreenSize;
  addEventListener: (type: 'change', listener: (event: { window: ScreenSize }) => void) => { remove: () => void };
};

export type WebGlobalsOptions = {
  /** The global object to fill in (globalThis in an app). */
  target: object;
  /** The web app's origin, e.g. https://onesheet.club. Relative URLs resolve against it. */
  origin: string;
  /** Persistent key-value storage (AsyncStorage). */
  storage: PersistentStorage;
  /** React Native's Dimensions module. */
  dimensions: Dimensions;
  /** Moves the native router to a web path. */
  navigate: (path: string) => void;
  /** Device locale, e.g. from expo-localization. */
  locale?: string;
};

class MemoryStorage {
  protected readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

class PersistedStorage extends MemoryStorage {
  constructor(private readonly persistent: PersistentStorage) {
    super();
  }

  async hydrate() {
    const keys = await this.persistent.getAllKeys();
    for (const [key, value] of await this.persistent.multiGet(keys)) {
      if (value !== null) this.values.set(key, value);
    }
  }

  override setItem(key: string, value: string) {
    super.setItem(key, value);
    void this.persistent.setItem(key, String(value));
  }

  override removeItem(key: string) {
    super.removeItem(key);
    void this.persistent.removeItem(key);
  }

  override clear() {
    super.clear();
    void this.persistent.clear();
  }
}

class ClassList {
  private readonly names = new Set<string>();

  add(...names: string[]) {
    for (const name of names) this.names.add(name);
  }

  remove(...names: string[]) {
    for (const name of names) this.names.delete(name);
  }

  toggle(name: string, force?: boolean) {
    const next = force ?? !this.names.has(name);
    if (next) this.names.add(name);
    else this.names.delete(name);
    return next;
  }

  contains(name: string) {
    return this.names.has(name);
  }
}

const noop = () => undefined;

class ElementShim {
  readonly classList = new ClassList();
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  private readonly attributes = new Map<string, string>();

  setAttribute(name: string, value: string) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  hasAttribute(name: string) {
    return this.attributes.has(name);
  }

  appendChild<T>(child: T) {
    return child;
  }

  removeChild<T>(child: T) {
    return child;
  }

  addEventListener = noop;
  removeEventListener = noop;
  dispatchEvent = () => true;
  querySelector = () => null;
  querySelectorAll = () => [];
  getElementsByTagName = () => [];
  getElementsByClassName = () => [];
  focus = noop;
  blur = noop;
  click = noop;
  scrollIntoView = noop;
  scrollTo = noop;
  append = noop;
  prepend = noop;
  remove = noop;
  insertBefore = <T,>(child: T) => child;
  replaceChildren = noop;
  contains = () => false;
  closest = () => null;
  matches = () => false;
  cloneNode = () => new ElementShim();
  getBoundingClientRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 });
  readonly children: ElementShim[] = [];
  readonly childNodes: ElementShim[] = [];
  readonly parentNode = null;
  readonly parentElement = null;
  readonly offsetWidth = 0;
  readonly offsetHeight = 0;
  readonly clientWidth = 0;
  readonly clientHeight = 0;
  readonly scrollHeight = 0;
  scrollTop = 0;
  scrollLeft = 0;
  textContent = '';
  innerHTML = '';
}

class EventShim {
  defaultPrevented = false;
  constructor(
    readonly type: string,
    readonly init: Record<string, unknown> = {},
  ) {}

  get detail() {
    return this.init.detail;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {}

  stopImmediatePropagation() {}
}

class ObserverShim {
  constructor(_callback: unknown) {}

  observe() {}

  unobserve() {}

  disconnect() {}

  takeRecords() {
    return [];
  }
}

// Classes web code checks with instanceof or constructs; nothing on native is an instance of them.
class NodeShim {}

const GLOBAL_CLASSES: Record<string, unknown> = {
  Event: EventShim,
  CustomEvent: EventShim,
  MouseEvent: EventShim,
  KeyboardEvent: EventShim,
  FocusEvent: EventShim,
  PointerEvent: EventShim,
  TouchEvent: EventShim,
  InputEvent: EventShim,
  Node: NodeShim,
  Element: class extends NodeShim {},
  HTMLElement: class extends NodeShim {},
  HTMLInputElement: class extends NodeShim {},
  HTMLTextAreaElement: class extends NodeShim {},
  HTMLAnchorElement: class extends NodeShim {},
  HTMLImageElement: class extends NodeShim {},
  SVGElement: class extends NodeShim {},
  MutationObserver: ObserverShim,
  ResizeObserver: ObserverShim,
  IntersectionObserver: ObserverShim,
};

const createDocument = () => ({
  title: '',
  cookie: '',
  visibilityState: 'visible',
  hidden: false,
  documentElement: new ElementShim(),
  body: new ElementShim(),
  head: new ElementShim(),
  activeElement: null,
  getElementById: () => null,
  getElementsByTagName: () => [],
  getElementsByClassName: () => [],
  getElementsByName: () => [],
  createTextNode: (text: string) => ({ textContent: text }),
  createEvent: (type: string) => new EventShim(type),
  elementFromPoint: () => null,
  contains: () => false,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => new ElementShim(),
  addEventListener: noop,
  removeEventListener: noop,
  dispatchEvent: () => true,
});

const WIDTH_QUERY = /\((min|max)-width:\s*([\d.]+)px\)/g;

const evaluateMediaQuery = (query: string, width: number) => {
  if (/\(hover:\s*hover\)/.test(query) || /\(pointer:\s*fine\)/.test(query)) return false;
  if (/\(hover:\s*none\)/.test(query) || /\(pointer:\s*coarse\)/.test(query)) return true;
  const conditions = [...query.matchAll(WIDTH_QUERY)];
  if (conditions.length === 0) return false;
  return conditions.every(([, kind, value]) => (kind === 'min' ? width >= Number(value) : width <= Number(value)));
};

const isRelative = (url: string) => url.startsWith('/') && !url.startsWith('//');

const define = (target: object, key: string, value: unknown) => {
  if (Reflect.get(target, key) === undefined) Reflect.set(target, key, value);
};

/**
 * Installs the browser globals. Resolves once localStorage is hydrated, so call it before the
 * first render. Returns a controller to keep `location` in step with the native router.
 */
export const installWebGlobals = async (options: WebGlobalsOptions) => {
  const { target, origin, dimensions, navigate } = options;
  const base = origin.replace(/\/$/, '');
  let current = new URL('/', `${base}/`);

  const localStorage = new PersistedStorage(options.storage);
  await localStorage.hydrate();
  define(target, 'localStorage', localStorage);
  define(target, 'sessionStorage', new MemoryStorage());

  const toPath = (url: string) => {
    const resolved = new URL(url, current);
    return resolved.origin === new URL(base).origin ? `${resolved.pathname}${resolved.search}${resolved.hash}` : resolved.href;
  };
  const location = {
    get origin() {
      return current.origin;
    },
    get protocol() {
      return current.protocol;
    },
    get host() {
      return current.host;
    },
    get hostname() {
      return current.hostname;
    },
    get pathname() {
      return current.pathname;
    },
    get search() {
      return current.search;
    },
    get hash() {
      return current.hash;
    },
    get href() {
      return current.href;
    },
    set href(url: string) {
      navigate(toPath(url));
    },
    assign: (url: string) => navigate(toPath(url)),
    replace: (url: string) => navigate(toPath(url)),
    reload: noop,
    toString: () => current.href,
  };
  define(target, 'location', location);

  let size = dimensions.get('window');
  const mediaListeners = new Set<() => void>();
  dimensions.addEventListener('change', ({ window }) => {
    size = window;
    for (const listener of mediaListeners) listener();
  });
  Object.defineProperty(target, 'innerWidth', { configurable: true, get: () => size.width });
  Object.defineProperty(target, 'innerHeight', { configurable: true, get: () => size.height });

  define(target, 'matchMedia', (query: string) => {
    const listeners = new Set<(event: { matches: boolean; media: string }) => void>();
    let matches = evaluateMediaQuery(query, size.width);
    const list = {
      media: query,
      get matches() {
        return evaluateMediaQuery(query, size.width);
      },
      onchange: null,
      addEventListener: (_type: 'change', listener: (event: { matches: boolean; media: string }) => void) => listeners.add(listener),
      removeEventListener: (_type: 'change', listener: (event: { matches: boolean; media: string }) => void) => listeners.delete(listener),
      addListener: (listener: (event: { matches: boolean; media: string }) => void) => listeners.add(listener),
      removeListener: (listener: (event: { matches: boolean; media: string }) => void) => listeners.delete(listener),
      dispatchEvent: () => true,
    };
    mediaListeners.add(() => {
      const next = evaluateMediaQuery(query, size.width);
      if (next === matches) return;
      matches = next;
      for (const listener of listeners) listener({ matches: next, media: query });
    });
    return list;
  });

  define(target, 'document', createDocument());
  for (const [name, value] of Object.entries(GLOBAL_CLASSES)) define(target, name, value);
  define(target, 'addEventListener', noop);
  define(target, 'removeEventListener', noop);
  define(target, 'scrollTo', noop);
  define(target, 'history', { pushState: (_state: unknown, _title: string, url: string) => navigate(toPath(url)), replaceState: noop, back: noop, length: 1 });

  const locale = options.locale ?? Intl.DateTimeFormat().resolvedOptions().locale;
  const existingNavigator: unknown = Reflect.get(target, 'navigator');
  const navigatorValue = typeof existingNavigator === 'object' && existingNavigator !== null ? existingNavigator : {};
  if (Reflect.get(navigatorValue, 'language') === undefined) {
    Object.assign(navigatorValue, { language: locale, languages: [locale], userAgent: Reflect.get(navigatorValue, 'userAgent') ?? 'ReactNative' });
  }
  Reflect.set(target, 'navigator', navigatorValue);

  const originalFetch: unknown = Reflect.get(target, 'fetch');
  if (typeof originalFetch === 'function') {
    Reflect.set(target, 'fetch', (input: unknown, init?: unknown) =>
      Reflect.apply(originalFetch, target, [typeof input === 'string' && isRelative(input) ? `${base}${input}` : input, init]),
    );
  }

  return {
    /** Call when the native route changes so `location` reflects it. */
    setPath: (path: string) => {
      current = new URL(path, `${base}/`);
    },
  };
};
