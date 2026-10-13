// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Linking } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsx } from '../jsx-runtime.js';
import { NativeNavigationProvider } from './navigation.js';
import { H, primitiveFor } from './primitives.js';
import { useInheritedTextClasses } from './text-context.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const InheritedProbe = () => <span data-testid="probe">{useInheritedTextClasses()}</span>;

describe('primitiveFor', () => {
  it('maps HTML tags to primitive kinds', () => {
    expect(primitiveFor('div')).toBe(H.div);
    expect(primitiveFor('section')).toBe(H.div);
    expect(primitiveFor('span')).toBe(H.span);
    expect(primitiveFor('h1')).toBe(H.span);
    expect(primitiveFor('path')).toBe(H.path);
    expect(primitiveFor('iframe')).toBe(H.unsupported);
  });
});

describe('primitives', () => {
  it('wraps bare strings in containers in text', () => {
    render(<H.div>hello</H.div>);
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('turns onClick on a container into a press handler', () => {
    const onClick = vi.fn();
    render(<H.div onClick={onClick}>tap me</H.div>);
    fireEvent.click(screen.getByText('tap me'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not press disabled buttons', () => {
    const onClick = vi.fn();
    render(
      <H.button disabled onClick={onClick}>
        Save
      </H.button>,
    );
    fireEvent.click(screen.getByText('Save'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('reports input changes as web change events', () => {
    const onChange = vi.fn();
    render(<H.input placeholder="Email" onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.c' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ target: expect.objectContaining({ value: 'a@b.c' }) }));
  });

  it('gives change events the input\'s name, id and type like a DOM input', () => {
    const onChange = vi.fn();
    render(<H.input name="username" id="user" type="email" placeholder="User" onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('User'), { target: { value: 'me' } });
    expect(onChange.mock.calls[0]?.[0].target).toMatchObject({ value: 'me', name: 'username', id: 'user', type: 'email' });
  });

  it('submits the enclosing form from a submit button', () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <H.form onSubmit={onSubmit}>
        <H.button type="submit">Log In</H.button>
      </H.form>,
    );
    fireEvent.click(screen.getByText('Log In'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('routes internal links through the host navigator', () => {
    const navigate = vi.fn();
    render(
      <NativeNavigationProvider navigate={navigate}>
        <H.a href="/s/abc">Open sheet</H.a>
      </NativeNavigationProvider>,
    );
    fireEvent.click(screen.getByText('Open sheet'));
    expect(navigate).toHaveBeenCalledWith('/s/abc');
  });

  it('opens external links with the system handler', () => {
    const openURL = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<H.a href="https://example.com">Docs</H.a>);
    fireEvent.click(screen.getByText('Docs'));
    expect(openURL).toHaveBeenCalledWith('https://example.com');
  });

  it('passes text classes from containers down to nested text', () => {
    render(
      <H.div className="p-4 text-sm font-bold">
        <H.div className="text-gray-500">
          <InheritedProbe />
        </H.div>
      </H.div>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('text-sm font-bold text-gray-500');
  });

  it('lays out equal-column grids as rows of equal cells', () => {
    render(
      <H.div className="grid grid-cols-2 gap-2">
        <H.span>a</H.span>
        <H.span>b</H.span>
        <H.span>c</H.span>
      </H.div>,
    );
    const a = screen.getByText('a');
    const c = screen.getByText('c');
    expect(a.parentElement?.parentElement).not.toBe(c.parentElement?.parentElement);
    expect(screen.getByText('b').parentElement?.parentElement).toBe(a.parentElement?.parentElement);
  });

  it('does not turn labelled containers into a single accessibility element', () => {
    render(
      <H.div aria-label="Sign in dialog">
        <H.button>Log In</H.button>
      </H.div>,
    );
    expect(screen.queryByLabelText('Sign in dialog')).toBeNull();
    expect(screen.getByText('Log In')).toBeTruthy();
  });

  it('does not make clickable containers buttons unless their role says so', () => {
    render(
      <H.div onClick={() => undefined}>
        <H.button>Inner action</H.button>
      </H.div>,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('keeps labels on pressable containers', () => {
    render(
      <H.div aria-label="Open sheet" role="button" onClick={() => undefined}>
        card
      </H.div>,
    );
    expect(screen.getByLabelText('Open sheet')).toBeTruthy();
  });

  it('labels images with their alt text', () => {
    render(<H.img src="https://example.com/a.png" alt="Artist photo" />);
    expect(screen.getByLabelText('Artist photo')).toBeTruthy();
  });

  it('renders unsupported elements as a visible placeholder instead of crashing', () => {
    render(<H.unsupported tag="iframe" />);
    expect(screen.getByText('<iframe> is not supported on native')).toBeTruthy();
  });
});

describe('jsx runtime', () => {
  it('maps intrinsic tags to primitives', () => {
    expect(jsx('div', {}).type).toBe(H.div);
    expect(jsx('svg', {}).type).toBe(H.svg);
  });

  it('passes custom element names through, so library checks such as NativeWind\'s pragma probe still work', () => {
    expect(jsx('react-native-css-interop-jsx-pragma-check', {}).type).toBe('react-native-css-interop-jsx-pragma-check');
    expect(jsx('my-widget', {}).type).toBe('my-widget');
  });

  it('leaves components untouched', () => {
    const Component = () => null;
    expect(jsx(Component, {}).type).toBe(Component);
  });
});

describe('createElement', () => {
  it('maps intrinsic tags and keeps children', async () => {
    const { createElement } = await import('../jsx-runtime.js');
    const element = createElement('div', { className: 'p-2' }, 'a', 'b');
    expect(element.type).toBe(H.div);
    expect(element.props).toMatchObject({ className: 'p-2', children: ['a', 'b'] });
  });
});
