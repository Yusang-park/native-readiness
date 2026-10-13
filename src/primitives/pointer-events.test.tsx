// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const pressableProps = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock('react-native-web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();
  const { createElement } = await import('react');
  const Pressable = (props: Record<string, unknown>) => {
    pressableProps.push(props);
    return createElement(actual.Pressable, props);
  };
  return { ...actual, Pressable };
});

const { H } = await import('./primitives.js');

const lastPressable = () => pressableProps[pressableProps.length - 1];

describe('pointer-events-none on pressables', () => {
  afterEach(() => {
    cleanup();
    pressableProps.length = 0;
  });

  it('is not handed to NativeWind on a button', () => {
    render(<H.button className="pointer-events-none opacity-30">Go</H.button>);
    expect(String(lastPressable()?.className)).not.toContain('pointer-events-none');
  });

  it('keeps the other classes on a button', () => {
    render(<H.button className="pointer-events-none opacity-30">Go</H.button>);
    expect(String(lastPressable()?.className)).toContain('opacity-30');
  });

  it('sets pointerEvents none on the button instead', () => {
    render(<H.button className="pointer-events-none">Go</H.button>);
    expect(lastPressable()?.pointerEvents).toBe('none');
  });

  it('leaves the button pressable when pointer-events-none is not set', () => {
    render(<H.button className="pointer-events-auto">Go</H.button>);
    expect(lastPressable()?.pointerEvents).toBe('auto');
    expect(lastPressable()?.disabled).toBe(false);
  });

  it('accepts presses once the class is removed', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <H.button className="pointer-events-none" onClick={onClick}>
        Go
      </H.button>,
    );
    rerender(
      <H.button className="" onClick={onClick}>
        Go
      </H.button>,
    );
    fireEvent.click(screen.getByText('Go'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('submits the form once the class is removed', () => {
    const onSubmit = vi.fn();
    const Field = ({ ready }: { ready: boolean }) => (
      <H.form onSubmit={onSubmit}>
        <H.button type="submit" className={ready ? 'transition' : 'pointer-events-none transition'}>
          Log In
        </H.button>
      </H.form>
    );
    const { rerender } = render(<Field ready={false} />);
    rerender(<Field ready />);
    fireEvent.click(screen.getByText('Log In'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('sets pointerEvents back to auto explicitly once the class is removed', () => {
    const { rerender } = render(<H.button className="pointer-events-none transition">Go</H.button>);
    rerender(<H.button className="transition">Go</H.button>);
    expect(lastPressable()?.pointerEvents).toBe('auto');
  });

  it('does not disable the button, so touches pass through as on the web', () => {
    render(<H.button className="pointer-events-none">Go</H.button>);
    expect(lastPressable()?.disabled).toBe(false);
  });

  it('is not handed to NativeWind on a clickable box', () => {
    render(
      <H.div className="pointer-events-none p-2" onClick={() => undefined}>
        Box
      </H.div>,
    );
    expect(String(lastPressable()?.className)).not.toContain('pointer-events-none');
    expect(lastPressable()?.pointerEvents).toBe('none');
    expect(lastPressable()?.disabled).toBeUndefined();
  });

  it('ignores responsive pointer-events-none variants it cannot evaluate', () => {
    render(<H.button className="md:pointer-events-none">Go</H.button>);
    expect(lastPressable()?.pointerEvents).toBe('auto');
  });
});
