import type { ElementType, Key } from 'react';
import { jsxDEV as baseJsxDEV, type JSXSource } from 'nativewind/jsx-dev-runtime';
import { H, primitiveFor } from './primitives/primitives.js';

export { Fragment } from 'nativewind/jsx-dev-runtime';

type Props = Record<string, unknown>;

export const jsxDEV = (type: ElementType, props: Props, key: Key | undefined, isStatic: boolean, source?: JSXSource, self?: unknown) => {
  if (typeof type !== 'string') return baseJsxDEV(type, props, key, isStatic, source, self);
  const primitive = primitiveFor(type);
  return baseJsxDEV(primitive, primitive === H.unsupported ? { ...props, tag: type } : props, key, isStatic, source, self);
};
