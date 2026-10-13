import { describe, expect, it } from 'vitest';
import { extractThemeVariables, renderNativeTheme } from './variables.js';

const css = `
:root::selection { background: red; }
[data-theme='light'],
:root {
  --color-panel: 242 245 249;
  --color-foreground: 15 23 42;
  color-scheme: light;
}
.button { --local: 1px; }
[data-theme='dark'] {
  --color-panel: 30 41 59;
  --color-foreground: 241 245 249;
}
:root { --color-panel: 240 240 240; }
@media (min-width: 720px) { :root { --gutter: 24px; } }
`;

describe('extractThemeVariables', () => {
  const theme = extractThemeVariables(css, { darkSelectors: ["[data-theme='dark']"] });

  it('collects light variables from :root, including selector lists', () => {
    expect(theme.light['--color-foreground']).toBe('15 23 42');
  });

  it('lets later blocks override earlier ones', () => {
    expect(theme.light['--color-panel']).toBe('240 240 240');
  });

  it('collects dark variables from the dark selector', () => {
    expect(theme.dark).toEqual({ '--color-panel': '30 41 59', '--color-foreground': '241 245 249' });
  });

  it('ignores non-variable declarations and unrelated selectors', () => {
    expect(theme.light).not.toHaveProperty('color-scheme');
    expect(theme.light).not.toHaveProperty('--local');
  });

  it('ignores variables scoped to media queries', () => {
    expect(theme.light).not.toHaveProperty('--gutter');
  });

  it('ignores pseudo-element selectors on :root', () => {
    expect(Object.keys(theme.light)).toEqual(['--color-panel', '--color-foreground']);
  });
});

describe('renderNativeTheme', () => {
  it('renders light variables on :root and dark ones under prefers-color-scheme', () => {
    const output = renderNativeTheme({ light: { '--a': '1 2 3' }, dark: { '--a': '4 5 6' } });
    expect(output).toContain(':root {\n  --a: 1 2 3;\n}');
    expect(output).toContain('@media (prefers-color-scheme: dark) {\n  :root {\n    --a: 4 5 6;\n  }\n}');
  });

  it('omits the dark block when there are no dark variables', () => {
    expect(renderNativeTheme({ light: { '--a': '1' }, dark: {} })).not.toContain('@media');
  });
});
