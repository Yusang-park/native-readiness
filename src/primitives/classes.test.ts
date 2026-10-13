import { describe, expect, it } from 'vitest';
import { mergeTextClasses, nativeClassName, scrollDirection, splitTextClasses } from './classes.js';

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
