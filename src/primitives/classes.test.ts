import { describe, expect, it } from 'vitest';
import { gridLayout, mergeTextClasses, nativeClassName, scrollDirection, splitTextClasses, textStateClasses, resolveDisabled, pressStates } from './classes.js';

describe('splitTextClasses', () => {
  it('separates text utilities from box utilities', () => {
    expect(splitTextClasses('p-4 text-sm font-bold bg-red-500 flex text-gray-700')).toEqual({
      box: 'p-4 bg-red-500 flex',
      text: 'text-sm font-bold text-gray-700',
    });
  });

  it('keeps variants with their utility', () => {
    expect(splitTextClasses('md:text-lg md:p-2 dark:text-white hover:bg-gray-100')).toEqual({
      box: 'md:p-2 hover:bg-gray-100',
      text: 'md:text-lg dark:text-white',
    });
  });

  it('recognises typography utilities beyond text-*', () => {
    expect(splitTextClasses('truncate line-clamp-2 leading-5 tracking-wide italic uppercase underline whitespace-nowrap').text).toBe(
      'truncate line-clamp-2 leading-5 tracking-wide italic uppercase underline whitespace-nowrap',
    );
  });

  it('handles empty and missing class names', () => {
    expect(splitTextClasses(undefined)).toEqual({ box: '', text: '' });
    expect(splitTextClasses('   ')).toEqual({ box: '', text: '' });
  });
});

describe('mergeTextClasses', () => {
  it('lets own classes override inherited ones from the same group', () => {
    expect(mergeTextClasses('text-sm text-gray-500', 'text-lg')).toBe('text-gray-500 text-lg');
  });

  it('keeps inherited classes from other groups', () => {
    expect(mergeTextClasses('font-bold', 'text-red-500')).toBe('font-bold text-red-500');
  });
});

describe('scrollDirection', () => {
  it('detects vertical and horizontal scrolling containers', () => {
    expect(scrollDirection('overflow-y-auto h-full')).toBe('vertical');
    expect(scrollDirection('overflow-auto')).toBe('vertical');
    expect(scrollDirection('flex overflow-x-auto')).toBe('horizontal');
    expect(scrollDirection('overflow-hidden')).toBeNull();
    expect(scrollDirection(undefined)).toBeNull();
  });
});

describe('nativeClassName', () => {
  it('drops keyboard-focus variants, which never apply on touch screens', () => {
    expect(nativeClassName('p-2 transition focus-visible:ring-2 focus-visible:outline-none')).toBe('p-2 transition');
  });

  it('drops cursor and text-selection utilities', () => {
    expect(nativeClassName('cursor-pointer select-none flex md:cursor-default')).toBe('flex');
  });

  it('keeps hover and active variants, which tablets and presses use', () => {
    expect(nativeClassName('hover:bg-gray-100 active:bg-gray-200')).toBe('hover:bg-gray-100 active:bg-gray-200');
  });

  it('handles missing class names', () => {
    expect(nativeClassName(undefined)).toBe('');
  });
});

describe('gridLayout', () => {
  it('reads the column count and gaps of an equal-column grid', () => {
    expect(gridLayout('grid grid-cols-2 gap-2 rounded-lg p-1')).toEqual({ columns: 2, rowGap: 'gap-y-2', columnGap: 'gap-x-2', rest: 'rounded-lg p-1' });
  });

  it('reads separate row and column gaps', () => {
    expect(gridLayout('grid grid-cols-3 gap-x-4 gap-y-1')).toMatchObject({ columns: 3, rowGap: 'gap-y-1', columnGap: 'gap-x-4' });
  });

  it('uses the mobile-first base columns and ignores larger breakpoints', () => {
    expect(gridLayout('grid grid-cols-1 md:grid-cols-3')).toMatchObject({ columns: 1, rest: '' });
  });

  it('returns null for non-grid containers', () => {
    expect(gridLayout('flex gap-2')).toBeNull();
    expect(gridLayout('grid')).toBeNull();
  });
});

describe('nativeClassName translations', () => {
  it('draws focus rings as borders, keeping variants and colors', () => {
    expect(nativeClassName('border border-gray-200 focus:ring-2 focus:ring-brand')).toBe('border border-gray-200 focus:border-2 focus:border-brand');
    expect(nativeClassName('ring-2 ring-danger/15 ring-offset-2')).toBe('border-2 border-danger/15');
    expect(nativeClassName('ring')).toBe('border-[3px]');
  });

  it('lets a ring replace the border it is drawn as, so a focused input shows its ring color', () => {
    expect(nativeClassName('border border-background-200 border-transparent ring-2 ring-brand')).toBe('border-2 border-brand');
    expect(nativeClassName('border border-gray-200 focus:border-transparent focus:ring-2 focus:ring-brand')).toBe(
      'border border-gray-200 focus:border-2 focus:border-brand',
    );
  });

  it('maps dynamic viewport units to what React Native supports', () => {
    expect(nativeClassName('h-[100dvh] w-screen max-h-[92dvh] min-h-[50svh]')).toBe('h-full w-full max-h-[92vh] min-h-[50vh]');
    expect(nativeClassName('h-screen min-h-screen')).toBe('h-full min-h-full');
  });

  it('positions fixed elements against the screen root', () => {
    expect(nativeClassName('fixed inset-0 md:fixed')).toBe('absolute inset-0 md:absolute');
  });

  it('turns safe-area env() padding into NativeWind safe-area utilities', () => {
    expect(nativeClassName('pb-[env(safe-area-inset-bottom)] max-md:pt-[env(safe-area-inset-top)]')).toBe('pb-safe max-md:pt-safe');
  });
});


describe('textStateClasses', () => {
  it('drops interaction states from inherited text so plain text never captures touches', () => {
    expect(textStateClasses('text-sm hover:text-foreground focus:underline')).toBe('text-sm');
  });
});

describe('resolveDisabled', () => {
  it('applies disabled: utilities when the element is disabled', () => {
    expect(resolveDisabled('bg-white disabled:opacity-40 md:disabled:bg-gray-100', true)).toBe('bg-white opacity-40 md:bg-gray-100');
  });

  it('drops disabled: utilities otherwise', () => {
    expect(resolveDisabled('bg-white disabled:opacity-40 transition-colors', false)).toBe('bg-white transition-colors');
  });
});

describe('pressStates', () => {
  it('splits a pressable class list into resting and pressed lists', () => {
    expect(pressStates('bg-transparent text-subtle hover:bg-background-50 hover:text-foreground px-3')).toEqual({
      rest: 'bg-transparent text-subtle px-3',
      pressed: 'px-3 bg-background-50 text-foreground',
    });
  });

  it('prefers explicit active styles over hover styles', () => {
    expect(pressStates('bg-white hover:bg-gray-50 active:bg-gray-100')).toEqual({ rest: 'bg-white', pressed: 'bg-gray-100' });
  });

  it('keeps responsive and dark variants on pressed utilities', () => {
    expect(pressStates('bg-white dark:bg-black hover:bg-gray-50 dark:hover:bg-gray-900').pressed).toBe('bg-gray-50 dark:bg-gray-900');
  });

  it('leaves class lists without interaction states alone', () => {
    expect(pressStates('bg-white px-2')).toEqual({ rest: 'bg-white px-2', pressed: 'bg-white px-2' });
  });
});
