// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as Dialog from './radix-dialog.js';
import * as Popover from './radix-popover.js';
import * as Tooltip from './radix-tooltip.js';
import { AnimatePresence, motion, useReducedMotion } from './framer-motion.js';
import { createPortal, flushSync } from './react-dom.js';

describe('framer-motion shim', () => {
  it('renders motion elements as primitives without animation props', () => {
    render(
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1 }} data-testid="m">
        content
      </motion.div>,
    );
    expect(screen.getByText('content')).toBeTruthy();
  });

  it('keeps click handlers', () => {
    const onClick = vi.fn();
    render(<motion.button onClick={onClick}>go</motion.button>);
    fireEvent.click(screen.getByText('go'));
    expect(onClick).toHaveBeenCalled();
  });

  it('renders AnimatePresence children immediately', () => {
    render(
      <AnimatePresence>
        <span>shown</span>
      </AnimatePresence>,
    );
    expect(screen.getByText('shown')).toBeTruthy();
  });

  it('reports reduced motion', () => {
    expect(useReducedMotion()).toBe(true);
  });
});

describe('react-dom shim', () => {
  it('renders portal content in a top-level layer', () => {
    render(<div>{createPortal(<span>in portal</span>, null)}</div>);
    expect(screen.getByText('in portal')).toBeTruthy();
  });

  it('runs flushSync callbacks', () => {
    expect(flushSync(() => 3)).toBe(3);
  });
});

describe('radix popover shim', () => {
  const Example = ({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) => (
    <Popover.Root onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button>open menu</button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content>
          <span>menu body</span>
          <Popover.Close>close</Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );

  it('opens from the trigger and closes from Close', () => {
    const onOpenChange = vi.fn();
    render(<Example onOpenChange={onOpenChange} />);
    expect(screen.queryByText('menu body')).toBeNull();
    fireEvent.click(screen.getByText('open menu'));
    expect(screen.getByText('menu body')).toBeTruthy();
    fireEvent.click(screen.getByText('close'));
    expect(screen.queryByText('menu body')).toBeNull();
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });

  it('respects the controlled open prop', () => {
    render(
      <Popover.Root open>
        <Popover.Content>
          <span>always open</span>
        </Popover.Content>
      </Popover.Root>,
    );
    expect(screen.getByText('always open')).toBeTruthy();
  });
});

describe('radix dialog shim', () => {
  it('shows content, title and description while open', async () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog.Root open onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content>
            <Dialog.Title>Delete sheet</Dialog.Title>
            <Dialog.Description>This cannot be undone.</Dialog.Description>
            <Dialog.Close>Cancel</Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>,
    );
    expect(screen.getByText('Delete sheet')).toBeTruthy();
    expect(screen.getByText('This cannot be undone.')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByText('Cancel')));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('radix tooltip shim', () => {
  it('renders the trigger and never the tooltip content on touch screens', () => {
    render(
      <Tooltip.Provider>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <span>hover target</span>
          </Tooltip.Trigger>
          <Tooltip.Content>tip</Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>,
    );
    expect(screen.getByText('hover target')).toBeTruthy();
    expect(screen.queryByText('tip')).toBeNull();
  });
});
