/** @jsxImportSource nativewind */
import { isValidElement, type ReactNode } from 'react';
import { H } from '../primitives/primitives.js';
import { Nothing, Passthrough } from './overlay.js';

// Native stand-in for @radix-ui/react-tooltip. Touch screens have no hover, so only the
// trigger renders.
export const Provider = Passthrough;
export const Root = Passthrough;
export const Portal = Nothing;
export const Content = Nothing;
export const Arrow = Nothing;
export const Trigger = ({ asChild, children }: { asChild?: boolean; children?: ReactNode }) =>
  asChild && isValidElement(children) ? children : <H.span>{children}</H.span>;
