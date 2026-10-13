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
