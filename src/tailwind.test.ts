import { describe, expect, it } from 'vitest';
import { unsupportedTailwindTokens } from './tailwind.js';

describe('unsupportedTailwindTokens', () => {
  it('keeps flexbox, spacing, color, and responsive classes', () => {
    expect(unsupportedTailwindTokens('flex flex-row gap-4 px-2 text-sm md:flex-col dark:bg-black')).toEqual([]);
  });

  it('flags grid layout utilities', () => {
    expect(unsupportedTailwindTokens('grid grid-cols-3 col-span-2 gap-2')).toEqual(['grid', 'grid-cols-3', 'col-span-2']);
  });

  it('flags hover, pseudo-element, and peer variants', () => {
    expect(unsupportedTailwindTokens('hover:bg-red before:content-[""] peer-checked:block')).toHaveLength(3);
  });

  it('flags unsupported variants nested behind responsive ones', () => {
    expect(unsupportedTailwindTokens('md:hover:underline')).toEqual(['md:hover:underline']);
  });

  it('flags arbitrary variants', () => {
    expect(unsupportedTailwindTokens('[&>svg]:size-4')).toEqual(['[&>svg]:size-4']);
  });

  it('does not split on colons inside arbitrary values', () => {
    expect(unsupportedTailwindTokens('bg-[url(https://x.y/a.png)]')).toEqual([]);
  });

  it('handles important and negative modifiers', () => {
    expect(unsupportedTailwindTokens('!sticky -mt-2')).toEqual(['!sticky']);
  });

  it('flags cursor and positioning utilities', () => {
    expect(unsupportedTailwindTokens('cursor-pointer fixed absolute')).toEqual(['cursor-pointer', 'fixed']);
  });
});
