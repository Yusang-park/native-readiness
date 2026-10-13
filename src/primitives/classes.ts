import { twMerge } from 'tailwind-merge';

// Utilities that style text. In CSS they inherit from containers; React Native has no
// inheritance, so containers pass them down to the text they render.
const TEXT_UTILITY =
  /^(text-|font-|leading-|tracking-|italic$|not-italic$|uppercase$|lowercase$|capitalize$|normal-case$|underline$|overline$|line-through$|no-underline$|decoration-|truncate$|line-clamp-|whitespace-|break-|antialiased$|subpixel-antialiased$|indent-)/;

const utilityOf = (token: string) => {
  let depth = 0;
  let start = 0;
  for (let index = 0; index < token.length; index += 1) {
    const char = token[index];
    if (char === '[') depth += 1;
    else if (char === ']') depth -= 1;
    else if (char === ':' && depth === 0) start = index + 1;
  }
  return token.slice(start).replace(/^!/, '');
};

export const isTextUtility = (token: string) => TEXT_UTILITY.test(utilityOf(token));

/** Splits a class list into what a container keeps and what its text inherits. */
export const splitTextClasses = (className: string | undefined) => {
  const tokens = (className ?? '').split(/\s+/).filter(Boolean);
  return {
    box: tokens.filter((token) => !isTextUtility(token)).join(' '),
    text: tokens.filter(isTextUtility).join(' '),
  };
};

/** Combines inherited text classes with an element's own, letting its own win per group. */
export const mergeTextClasses = (inherited: string, own: string | undefined) => twMerge(inherited, own ?? '');

/** Containers whose classes make them scroll become ScrollViews. */
export const scrollDirection = (className: string | undefined): 'vertical' | 'horizontal' | null => {
  const tokens = (className ?? '').split(/\s+/).map(utilityOf);
  if (tokens.some((token) => /^overflow-x-(auto|scroll)$/.test(token))) return 'horizontal';
  if (tokens.some((token) => /^overflow(-y)?-(auto|scroll)$/.test(token))) return 'vertical';
  return null;
};

const variantsOf = (token: string) => token.slice(0, token.length - utilityOf(token).length).split(':').filter(Boolean);

// Keyboard-focus styles and pointer utilities never apply on touch screens. They are dropped
// before NativeWind sees them; animating focus rings also breaks NativeWind on Reanimated 4.
const isNativeNoOp = (token: string) =>
  variantsOf(token).some((variant) => variant === 'focus-visible' || variant === 'group-focus-visible' || variant === 'peer-focus-visible') ||
  /^(cursor-|select-)/.test(utilityOf(token));

const SAFE_AREA = /^(p|pt|pb|pl|pr|px|py|m|mt|mb|ml|mr)-\[env\(safe-area-inset-(?:top|bottom|left|right)\)\]$/;

/**
 * Rewrites a utility into what NativeWind can render: rings become borders (rings render broken),
 * dynamic viewport units become vh or full size, fixed becomes absolute (portals sit at the
 * screen root), and safe-area env() padding becomes NativeWind's *-safe utilities.
 * Returns null to drop the utility.
 */
const translateUtility = (utility: string): string | null => {
  if (utility === 'ring') return 'border-[3px]';
  if (/^ring-(0|inset)$/.test(utility) || utility.startsWith('ring-offset')) return null;
  const ringWidth = /^ring-(\d+|\[[^\]]+\])$/.exec(utility)?.[1];
  if (ringWidth !== undefined) return ringWidth === '1' ? 'border' : `border-${ringWidth}`;
  if (utility.startsWith('ring-')) return `border-${utility.slice('ring-'.length)}`;
  const screen = /^(h|min-h|max-h|w|min-w|max-w)-screen$/.exec(utility);
  if (screen) return `${screen[1]}-full`;
  const fullViewport = /^(h|min-h|max-h|w|min-w|max-w)-\[100(?:d|s|l)?v[hw]\]$/.exec(utility);
  if (fullViewport) return `${fullViewport[1]}-full`;
  if (utility === 'fixed') return 'absolute';
  const safeArea = SAFE_AREA.exec(utility);
  if (safeArea) return `${safeArea[1]}-safe`;
  return utility.replace(/\[(\d+(?:\.\d+)?)(?:d|s|l)vh\]/, '[$1vh]');
};

/** The class list rewritten for native: no-op utilities dropped, unsupported ones translated. */
export const nativeClassName = (className: string | undefined) =>
  (className ?? '')
    .split(/\s+/)
    .filter((token) => token !== '' && !isNativeNoOp(token))
    .flatMap((token) => {
      const utility = utilityOf(token);
      const prefix = token.slice(0, token.length - utility.length);
      const important = utility.startsWith('!') ? '!' : '';
      const translated = translateUtility(important ? utility.slice(1) : utility);
      return translated === null ? [] : [`${prefix}${important}${translated}`];
    })
    .join(' ');

/**
 * Touch browsers show hover styles while an element is pressed. Pressables without their own
 * pressed (active:) styles get the same feedback on native.
 */
export const pressClassName = (className: string | undefined) => {
  const tokens = (className ?? '').split(/\s+/).filter(Boolean);
  if (tokens.some((token) => variantsOf(token).includes('active'))) return tokens.join(' ');
  const pressed = tokens
    .filter((token) => variantsOf(token).includes('hover'))
    .map((token) => {
      const utility = utilityOf(token);
      const variants = variantsOf(token).map((variant) => (variant === 'hover' ? 'active' : variant));
      return `${variants.join(':')}:${utility}`;
    });
  return [...tokens, ...pressed].join(' ');
};

const GRID_ONLY = /^(grid|inline-grid|grid-cols-|grid-rows-|grid-flow-|auto-cols-|auto-rows-|col-|row-|gap-|gap$)/;

/**
 * Equal-column CSS grids (`grid grid-cols-N gap-…`), the common case, rendered as rows of
 * equal flex cells. Only the mobile-first base column count applies on phones.
 */
export const gridLayout = (className: string | undefined) => {
  const tokens = (className ?? '').split(/\s+/).filter(Boolean);
  const base = tokens.filter((token) => variantsOf(token).length === 0);
  const columns = base.map((token) => /^grid-cols-(\d+)$/.exec(token)?.[1]).find((value) => value !== undefined);
  if (!base.includes('grid') || columns === undefined) return null;
  const gap = base.map((token) => /^gap-(.+)$/.exec(token)?.[1]).find((value) => value !== undefined && !value.startsWith('x-') && !value.startsWith('y-'));
  const gapX = base.map((token) => /^gap-x-(.+)$/.exec(token)?.[1]).find((value) => value !== undefined) ?? gap;
  const gapY = base.map((token) => /^gap-y-(.+)$/.exec(token)?.[1]).find((value) => value !== undefined) ?? gap;
  return {
    columns: Number(columns),
    rowGap: gapY === undefined ? '' : `gap-y-${gapY}`,
    columnGap: gapX === undefined ? '' : `gap-x-${gapX}`,
    rest: tokens.filter((token) => !GRID_ONLY.test(utilityOf(token))).join(' '),
  };
};
