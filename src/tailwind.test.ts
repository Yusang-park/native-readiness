import { describe, expect, it } from 'vitest';
import { unsupportedTailwindTokens } from './tailwind.js';

describe('unsupportedTailwindTokens', () => {
  it('keeps flexbox, spacing, color, and responsive classes', () => {
    expect(unsupportedTailwindTokens('flex flex-row gap-4 px-2 text-sm md:flex-col dark:bg-black')).toEqual([]);
  });

  it('flags grid layout utilities', () => {
    expect(unsupportedTailwindTokens('grid grid-cols-3 col-span-2 gap-2')).toEqual(['grid', 'grid-cols-3', 'col-span-2']);
  });

  it('ignores hover and other interaction variants that are harmless no-ops on native', () => {
    expect(unsupportedTailwindTokens('hover:bg-red group-hover:underline focus-visible:ring md:hover:underline')).toEqual([]);
  });

  it('ignores cursor and text-selection utilities that are harmless no-ops on native', () => {
    expect(unsupportedTailwindTokens('cursor-pointer select-none print:hidden visited:text-red')).toEqual([]);
  });

  it('flags pseudo-element and peer variants, which change content or layout', () => {
    expect(unsupportedTailwindTokens('before:content-[""] after:block peer-checked:block')).toHaveLength(3);
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

  it('flags fixed positioning but not absolute', () => {
    expect(unsupportedTailwindTokens('fixed absolute')).toEqual(['fixed']);
  });
});
