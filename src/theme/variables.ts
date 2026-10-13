export type ThemeVariables = { light: Record<string, string>; dark: Record<string, string> };

export type ExtractOptions = {
  /** Selectors whose custom properties form the default (light) theme. */
  lightSelectors?: string[];
  /** Selectors whose custom properties form the dark theme, e.g. `[data-theme='dark']` or `.dark`. */
  darkSelectors?: string[];
};

type Rule = { selectors: string[]; body: string };

/** Top-level style rules; at-rule blocks (media queries, keyframes, …) are skipped. */
const topLevelRules = (css: string): Rule[] => {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  let index = 0;
  while (index < source.length) {
    const open = source.indexOf('{', index);
    if (open === -1) break;
    const prelude = source.slice(index, open).trim();
    let depth = 1;
    let cursor = open + 1;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === '{') depth += 1;
      else if (source[cursor] === '}') depth -= 1;
      cursor += 1;
    }
    if (!prelude.startsWith('@')) {
      rules.push({ selectors: prelude.split(',').map((selector) => selector.trim()), body: source.slice(open + 1, cursor - 1) });
    }
    index = cursor;
  }
  return rules;
};

const customProperties = (body: string) =>
  body
    .split(';')
    .map((declaration) => /^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(declaration))
    .flatMap((match): Array<[string, string]> => (match?.[1] && match[2] ? [[match[1], match[2]]] : []));

/** Reads the theme's CSS custom properties so a native app can define the same tokens. */
export const extractThemeVariables = (css: string, options: ExtractOptions = {}): ThemeVariables => {
  const light = options.lightSelectors ?? [':root'];
  const dark = options.darkSelectors ?? ['.dark', "[data-theme='dark']", '[data-theme="dark"]'];
  const theme: ThemeVariables = { light: {}, dark: {} };
  for (const rule of topLevelRules(css)) {
    const target = rule.selectors.some((selector) => dark.includes(selector))
      ? theme.dark
      : rule.selectors.some((selector) => light.includes(selector))
        ? theme.light
        : undefined;
    if (!target) continue;
    for (const [name, value] of customProperties(rule.body)) target[name] = value;
  }
  return theme;
};

const block = (variables: Record<string, string>, indent: string) =>
  Object.entries(variables)
    .map(([name, value]) => `${indent}${name}: ${value};`)
    .join('\n');

/** Renders variables in the form NativeWind reads: :root, plus dark values under prefers-color-scheme. */
export const renderNativeTheme = ({ light, dark }: ThemeVariables) => {
  const parts = [`:root {\n${block(light, '  ')}\n}`];
  if (Object.keys(dark).length > 0) parts.push(`@media (prefers-color-scheme: dark) {\n  :root {\n${block(dark, '    ')}\n  }\n}`);
  return `${parts.join('\n\n')}\n`;
};
