// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const scrollProps = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock('react-native-web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();
  const { createElement } = await import('react');
  const ScrollView = (props: Record<string, unknown>) => {
    scrollProps.push(props);
    return createElement(actual.ScrollView, props);
  };
  return { ...actual, ScrollView };
});

const { H } = await import('./primitives.js');

const lastScrollProps = () => scrollProps[scrollProps.length - 1];

describe('scroll containers', () => {
  afterEach(() => {
    cleanup();
    scrollProps.length = 0;
  });

  it('render overflow-y-auto as a scroll view', () => {
    render(<H.div className="overflow-y-auto">content</H.div>);
    expect(lastScrollProps()).toBeDefined();
  });

  it('pass taps through while the keyboard is open, like the web', () => {
    render(<H.div className="overflow-y-auto">content</H.div>);
    expect(lastScrollProps()?.keyboardShouldPersistTaps).toBe('handled');
  });

  it('pass taps through for overflow-auto too', () => {
    render(<H.div className="overflow-auto">content</H.div>);
    expect(lastScrollProps()?.keyboardShouldPersistTaps).toBe('handled');
  });

  it('pass taps through for horizontal scrolling', () => {
    render(<H.div className="overflow-x-auto">content</H.div>);
    expect(lastScrollProps()?.horizontal).toBe(true);
    expect(lastScrollProps()?.keyboardShouldPersistTaps).toBe('handled');
  });

  it('pass taps through for overflow-scroll', () => {
    render(<H.div className="overflow-y-scroll">content</H.div>);
    expect(lastScrollProps()?.keyboardShouldPersistTaps).toBe('handled');
  });

  it('dismiss the keyboard when the content is dragged', () => {
    render(<H.div className="overflow-y-auto">content</H.div>);
    expect(lastScrollProps()?.keyboardDismissMode).toBe('on-drag');
  });

  it('keep the content children', () => {
    render(<H.div className="overflow-y-auto">inside</H.div>);
    expect(screen.getByText('inside')).toBeTruthy();
  });

  it('still deliver presses to buttons inside', () => {
    const onClick = vi.fn();
    render(
      <H.div className="overflow-y-auto">
        <H.button onClick={onClick}>Go</H.button>
      </H.div>,
    );
    fireEvent.click(screen.getByText('Go'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('do not render plain boxes as scroll views', () => {
    render(<H.div className="flex">plain</H.div>);
    expect(scrollProps).toHaveLength(0);
  });

  it('do not render overflow-hidden boxes as scroll views', () => {
    render(<H.div className="overflow-hidden">clipped</H.div>);
    expect(scrollProps).toHaveLength(0);
  });
});
