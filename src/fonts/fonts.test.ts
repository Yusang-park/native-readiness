import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { expoFontPluginEntry, findGoogleFontSpecs, parseFontFaceCss, parseGoogleFontsUrl, syncFonts } from './fonts.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../test/fixtures/fonts-app');

describe('parseGoogleFontsUrl', () => {
  it('reads css2 weight lists', () => {
    expect(parseGoogleFontsUrl('https://fonts.googleapis.com/css2?family=Mulish:wght@300;400&display=swap')).toEqual([
      { family: 'Mulish', variants: [{ weight: 300, style: 'normal' }, { weight: 400, style: 'normal' }] },
    ]);
  });

  it('reads css2 italic axes', () => {
    expect(parseGoogleFontsUrl('https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;1,700')).toEqual([
      { family: 'Libre Baskerville', variants: [{ weight: 400, style: 'normal' }, { weight: 700, style: 'italic' }] },
    ]);
  });

  it('reads several css2 families', () => {
    expect(parseGoogleFontsUrl('https://fonts.googleapis.com/css2?family=Inter:wght@400&family=Mulish').map((spec) => spec.family)).toEqual([
      'Inter',
      'Mulish',
    ]);
  });

  it('defaults a family without axes to regular', () => {
    expect(parseGoogleFontsUrl('https://fonts.googleapis.com/css2?family=Mulish')[0]?.variants).toEqual([{ weight: 400, style: 'normal' }]);
  });

  it('reads the legacy css format with pipes and italic suffixes', () => {
    expect(parseGoogleFontsUrl('https://fonts.googleapis.com/css?family=Mulish:300,400italic|Inter:700')).toEqual([
      { family: 'Mulish', variants: [{ weight: 300, style: 'normal' }, { weight: 400, style: 'italic' }] },
      { family: 'Inter', variants: [{ weight: 700, style: 'normal' }] },
    ]);
  });
});

describe('findGoogleFontSpecs', () => {
  it('collects fonts from index.html and source files, merged per family', () => {
    expect(findGoogleFontSpecs(root)).toEqual([
      { family: 'Inter', variants: [{ weight: 400, style: 'normal' }, { weight: 600, style: 'normal' }] },
      { family: 'Libre Baskerville', variants: [{ weight: 400, style: 'normal' }, { weight: 400, style: 'italic' }] },
      { family: 'Mulish', variants: [{ weight: 300, style: 'normal' }, { weight: 400, style: 'normal' }, { weight: 700, style: 'normal' }] },
    ]);
  });
});

describe('parseFontFaceCss', () => {
  it('reads font-face blocks', () => {
    const css = `@font-face { font-family: 'Mulish'; font-style: normal; font-weight: 700; src: url(https://x/m700.ttf) format('truetype'); }`;
    expect(parseFontFaceCss(css)).toEqual([{ family: 'Mulish', weight: 700, style: 'normal', url: 'https://x/m700.ttf' }]);
  });
});

describe('syncFonts', () => {
  const fakeNetwork = () => {
    const fetchText = vi.fn(async (url: string) => {
      const query = decodeURIComponent(new URL(url).searchParams.get('family') ?? '');
      const [family = '', axes = ''] = query.split(':');
      const tuples = (axes.split('@')[1] ?? '400').split(';');
      return tuples
        .map((tuple) => {
          const [first = '0', second] = tuple.split(',');
          const italic = second !== undefined && first === '1';
          const weight = second ?? first;
          return `@font-face { font-family: '${family}'; font-style: ${italic ? 'italic' : 'normal'}; font-weight: ${weight}; src: url(https://cdn/${family.replace(/ /g, '')}-${weight}${italic ? 'i' : ''}.ttf) format('truetype'); }`;
        })
        .join('\n');
    });
    const fetchBinary = vi.fn(async (url: string) => Buffer.from(`font:${url}`));
    return { fetchText, fetchBinary };
  };

  it('downloads every variant and writes a manifest and island CSS', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-fonts-'));
    const network = fakeNetwork();
    const manifest = await syncFonts({
      specs: [{ family: 'Libre Baskerville', variants: [{ weight: 400, style: 'normal' }, { weight: 700, style: 'italic' }] }],
      outDir,
      cssFile: path.join(outDir, 'fonts.css'),
      ...network,
    });
    expect(manifest.map((font) => font.file)).toEqual(['LibreBaskerville-400.ttf', 'LibreBaskerville-700Italic.ttf']);
    expect(fs.readFileSync(path.join(outDir, 'LibreBaskerville-700Italic.ttf'), 'utf8')).toBe('font:https://cdn/LibreBaskerville-700i.ttf');
    const css = fs.readFileSync(path.join(outDir, 'fonts.css'), 'utf8');
    expect(css).toContain("font-family: 'Libre Baskerville'");
    expect(css).toContain('font-style: italic');
    expect(css).toContain('src: url(data:font/ttf;base64,');
    expect(JSON.parse(fs.readFileSync(path.join(outDir, 'fonts.json'), 'utf8'))).toHaveLength(2);
  });

  it('skips files that are already downloaded', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-fonts-'));
    const spec = { family: 'Mulish', variants: [{ weight: 400, style: 'normal' as const }] };
    await syncFonts({ specs: [spec], outDir, ...fakeNetwork() });
    const second = fakeNetwork();
    await syncFonts({ specs: [spec], outDir, ...second });
    expect(second.fetchBinary).not.toHaveBeenCalled();
  });
});

describe('expoFontPluginEntry', () => {
  it('registers every file, grouped into Android font families with weights', () => {
    const manifest = [
      { family: 'Mulish', weight: 400, style: 'normal' as const, file: 'Mulish-400.ttf' },
      { family: 'Mulish', weight: 700, style: 'italic' as const, file: 'Mulish-700Italic.ttf' },
    ];
    expect(expoFontPluginEntry(manifest, './assets/fonts')).toEqual([
      'expo-font',
      {
        fonts: ['./assets/fonts/Mulish-400.ttf', './assets/fonts/Mulish-700Italic.ttf'],
        android: {
          fonts: [
            {
              fontFamily: 'Mulish',
              fontDefinitions: [
                { path: './assets/fonts/Mulish-400.ttf', weight: 400 },
                { path: './assets/fonts/Mulish-700Italic.ttf', weight: 700, style: 'italic' },
              ],
            },
          ],
        },
      },
    ]);
  });
});
