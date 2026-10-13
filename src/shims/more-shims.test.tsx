// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, hydrateRoot } from './react-dom-client.js';
import { renderToString } from './react-dom-server.js';
import { Toaster, toast } from './sonner.js';

describe('sonner shim', () => {
  afterEach(() => {
    cleanup();
    act(() => {
      toast.dismiss();
    });
  });

  it('shows toasts in the Toaster', () => {
    render(<Toaster />);
    act(() => {
      toast('Saved');
      toast.success('Published');
      toast.error('Could not save');
    });
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.getByText('Published')).toBeTruthy();
    expect(screen.getByText('Could not save')).toBeTruthy();
  });

  it('dismisses toasts', () => {
    render(<Toaster />);
    let id: string | number = '';
    act(() => {
      id = toast('Going away');
    });
    act(() => {
      toast.dismiss(id);
    });
    expect(screen.queryByText('Going away')).toBeNull();
  });

  it('resolves promise toasts with the success message', async () => {
    render(<Toaster />);
    await act(async () => {
      toast.promise(Promise.resolve(1), { loading: 'Saving', success: 'Done', error: 'Failed' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByText('Done')).toBeTruthy();
  });
});

describe('react-dom client and server shims', () => {
  it('provides inert roots', () => {
    const root = createRoot(null);
    expect(() => root.render(null)).not.toThrow();
    expect(() => root.unmount()).not.toThrow();
    expect(() => hydrateRoot(null, null)).not.toThrow();
  });

  it('renders nothing on the server', () => {
    expect(renderToString(null)).toBe('');
  });
});
