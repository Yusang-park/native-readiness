import fs from 'node:fs';
import path from 'node:path';

export type FontStyle = 'normal' | 'italic';
export type FontVariant = { weight: number; style: FontStyle };
export type FontSpec = { family: string; variants: FontVariant[] };
export type FontFile = { family: string; weight: number; style: FontStyle; file: string };

const GOOGLE_FONTS_URL = /https:\/\/fonts\.googleapis\.com\/css2?\?[^'"`\s<>)]+/g;
const SOURCE_FILE = /\.(html|tsx?|jsx?|css|scss)$/;

const sortVariants = (variants: FontVariant[]) =>
  [...variants].sort((a, b) => a.weight - b.weight || (a.style === b.style ? 0 : a.style === 'normal' ? -1 : 1));

const decodeFamily = (value: string) => value.replace(/\+/g, ' ').trim();

/** Reads the families and variants a Google Fonts stylesheet URL requests (css and css2 APIs). */
export const parseGoogleFontsUrl = (rawUrl: string): FontSpec[] => {
  const url = new URL(rawUrl.replace(/&amp;/g, '&'));
  const families = url.searchParams.getAll('family');
  if (url.pathname === '/css2') {
    return families.map((entry) => {
      const [name = '', axes] = entry.split(':');
      if (!axes) return { family: decodeFamily(name), variants: [{ weight: 400, style: 'normal' }] };
      const [axisNames = '', tuples = ''] = axes.split('@');
      const names = axisNames.split(',');
      const variants = tuples.split(';').map((tuple): FontVariant => {
        const values = tuple.split(',');
        const read = (axis: string) => values[names.indexOf(axis)];
        const weight = Number.parseInt(read('wght') ?? '400', 10);
        return { weight: Number.isNaN(weight) ? 400 : weight, style: read('ital') === '1' ? 'italic' : 'normal' };
      });
      return { family: decodeFamily(name), variants: sortVariants(variants) };
    });
  }
  return families.flatMap((entry) =>
    entry.split('|').map((part) => {
      const [name = '', list] = part.split(':');
      const variants = (list ?? '400').split(',').map((token): FontVariant => {
        const weight = Number.parseInt(token, 10);
        return { weight: Number.isNaN(weight) ? 400 : weight, style: /i(talic)?$/.test(token) ? 'italic' : 'normal' };
      });
      return { family: decodeFamily(name), variants: sortVariants(variants) };
    }),
  );
};

/** Merges specs so each family appears once with the union of its variants. */
export const mergeFontSpecs = (specs: FontSpec[]): FontSpec[] => {
  const byFamily = new Map<string, Map<string, FontVariant>>();
  for (const spec of specs) {
    const variants = byFamily.get(spec.family) ?? new Map<string, FontVariant>();
    for (const variant of spec.variants) variants.set(`${variant.weight}-${variant.style}`, variant);
    byFamily.set(spec.family, variants);
  }
  return [...byFamily.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([family, variants]) => ({ family, variants: sortVariants([...variants.values()]) }));
};

const collectFiles = (target: string, out: string[]) => {
  if (!fs.existsSync(target)) return out;
  if (fs.statSync(target).isFile()) {
    if (SOURCE_FILE.test(target)) out.push(target);
    return out;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    collectFiles(path.join(target, entry.name), out);
  }
  return out;
};

/** Finds every Google Fonts stylesheet the web app loads, in index.html and in source. */
export const findGoogleFontSpecs = (root: string, include: string[] = ['index.html', 'src']): FontSpec[] => {
  const files = include.flatMap((entry) => collectFiles(path.join(root, entry), []));
  const specs = files.flatMap((file) => [...fs.readFileSync(file, 'utf8').matchAll(GOOGLE_FONTS_URL)].flatMap((match) => parseGoogleFontsUrl(match[0])));
  return mergeFontSpecs(specs);
};

/** Reads `@font-face` blocks from a stylesheet. */
export const parseFontFaceCss = (css: string) =>
  [...css.matchAll(/@font-face\s*{([^}]*)}/g)].flatMap((match) => {
    const block = match[1] ?? '';
    const read = (property: string) => new RegExp(`${property}\\s*:\\s*([^;]+);`).exec(block)?.[1]?.trim();
    const family = read('font-family')?.replace(/^['"]|['"]$/g, '');
    const url = /url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(read('src') ?? '')?.[1];
    if (!family || !url) return [];
    const weight = Number.parseInt(read('font-weight') ?? '400', 10);
    const style: FontStyle = read('font-style') === 'italic' ? 'italic' : 'normal';
    return [{ family, weight: Number.isNaN(weight) ? 400 : weight, style, url }];
  });

export const fontFileName = (family: string, variant: FontVariant) =>
  `${family.replace(/[^A-Za-z0-9]/g, '')}-${variant.weight}${variant.style === 'italic' ? 'Italic' : ''}.ttf`;

const googleCssUrl = (spec: FontSpec) => {
  const italic = spec.variants.some((variant) => variant.style === 'italic');
  const tuples = spec.variants.map((variant) => (italic ? `${variant.style === 'italic' ? 1 : 0},${variant.weight}` : `${variant.weight}`));
  const axes = italic ? `ital,wght@${tuples.join(';')}` : `wght@${tuples.join(';')}`;
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(spec.family).replace(/%20/g, '+')}:${axes}`;
};

export type SyncFontsOptions = {
  specs: FontSpec[];
  /** Folder for the .ttf files and fonts.json. */
  outDir: string;
  /** Optional CSS file with embedded @font-face rules for DOM islands. */
  cssFile?: string;
  fetchText?: (url: string) => Promise<string>;
  fetchBinary?: (url: string) => Promise<Buffer>;
};

const defaultFetchText = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Font stylesheet request failed (${response.status}): ${url}`);
  return response.text();
};

const defaultFetchBinary = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Font download failed (${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
};

/**
 * Downloads every font variant as TrueType so native builds can embed it, and writes a
 * manifest plus (optionally) a stylesheet that gives DOM islands the same fonts offline.
 */
export const syncFonts = async ({ specs, outDir, cssFile, fetchText = defaultFetchText, fetchBinary = defaultFetchBinary }: SyncFontsOptions) => {
  fs.mkdirSync(outDir, { recursive: true });
  const manifest: FontFile[] = [];
  for (const spec of specs) {
    const missing = spec.variants.filter((variant) => !fs.existsSync(path.join(outDir, fontFileName(spec.family, variant))));
    const faces = missing.length > 0 ? parseFontFaceCss(await fetchText(googleCssUrl({ ...spec, variants: missing }))) : [];
    for (const variant of spec.variants) {
      const file = fontFileName(spec.family, variant);
      const target = path.join(outDir, file);
      if (!fs.existsSync(target)) {
        const face = faces.find((candidate) => candidate.weight === variant.weight && candidate.style === variant.style);
        if (!face) throw new Error(`Google Fonts has no ${spec.family} ${variant.weight} ${variant.style}`);
        fs.writeFileSync(target, await fetchBinary(face.url));
      }
      manifest.push({ family: spec.family, weight: variant.weight, style: variant.style, file });
    }
  }
  fs.writeFileSync(path.join(outDir, 'fonts.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  if (cssFile) {
    const rules = manifest.map(
      (font) =>
        `@font-face {\n  font-family: '${font.family}';\n  font-style: ${font.style};\n  font-weight: ${font.weight};\n  font-display: swap;\n  src: url(data:font/ttf;base64,${fs.readFileSync(path.join(outDir, font.file)).toString('base64')}) format('truetype');\n}\n`,
    );
    fs.mkdirSync(path.dirname(cssFile), { recursive: true });
    fs.writeFileSync(cssFile, `/* Generated by native-readiness fonts. Do not edit. */\n${rules.join('\n')}`);
  }
  return manifest;
};

/** The `expo-font` config plugin entry that embeds the fonts in native builds. */
export const expoFontPluginEntry = (manifest: FontFile[], dir: string) => {
  const filePath = (file: string) => `${dir.replace(/\/$/, '')}/${file}`;
  const families = [...new Set(manifest.map((font) => font.family))];
  return [
    'expo-font',
    {
      fonts: manifest.map((font) => filePath(font.file)),
      android: {
        fonts: families.map((fontFamily) => ({
          fontFamily,
          fontDefinitions: manifest
            .filter((font) => font.family === fontFamily)
            .map((font) => ({ path: filePath(font.file), weight: font.weight, ...(font.style === 'italic' ? { style: 'italic' } : {}) })),
        })),
      },
    },
  ] as const;
};
