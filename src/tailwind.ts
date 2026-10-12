const UNSUPPORTED_UTILITIES = new Set([
  'grid',
  'inline-grid',
  'sticky',
  'fixed',
  'inline',
  'inline-block',
  'inline-flex',
  'table',
  'contents',
  'bg-fixed',
  'bg-local',
  'scroll-smooth',
  'appearance-none',
]);

const UNSUPPORTED_UTILITY_PREFIXES = [
  'grid-cols-',
  'grid-rows-',
  'grid-flow-',
  'col-span-',
  'col-start-',
  'col-end-',
  'row-span-',
  'row-start-',
  'row-end-',
  'auto-cols-',
  'auto-rows-',
  'float-',
  'clear-',
  'columns-',
  'cursor-',
  'backdrop-',
  'snap-',
  'select-',
  'resize',
  'table-',
];

const UNSUPPORTED_VARIANTS = new Set([
  'hover',
  'group-hover',
  'focus-visible',
  'focus-within',
  'before',
  'after',
  'selection',
  'marker',
  'first-letter',
  'first-line',
  'file',
  'print',
  'visited',
  'target',
  'open',
]);

const UNSUPPORTED_VARIANT_PREFIXES = ['peer-', 'has-', 'group-has-', '['];

const splitVariants = (token: string) => {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of token) {
    if (char === '[') depth += 1;
    if (char === ']') depth -= 1;
    if (char === ':' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
};

const isUnsupportedVariant = (variant: string) =>
  UNSUPPORTED_VARIANTS.has(variant) || UNSUPPORTED_VARIANT_PREFIXES.some((prefix) => variant.startsWith(prefix));

const isUnsupportedUtility = (utility: string) => {
  const bare = utility.replace(/^!/, '').replace(/^-/, '');
  return UNSUPPORTED_UTILITIES.has(bare) || UNSUPPORTED_UTILITY_PREFIXES.some((prefix) => bare.startsWith(prefix));
};

export const unsupportedTailwindTokens = (classList: string) =>
  classList
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => {
      const parts = splitVariants(token);
      const utility = parts[parts.length - 1] ?? '';
      return parts.slice(0, -1).some(isUnsupportedVariant) || isUnsupportedUtility(utility);
    });
