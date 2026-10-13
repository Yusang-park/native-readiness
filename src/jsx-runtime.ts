// A JSX runtime for native builds: intrinsic tags (`<div>`, `<span>`, `<svg>`, …) render as
// React Native primitives, so web components run on native without a fork. Everything is then
// handed to NativeWind's runtime, which turns `className` into styles.
import { Fragment, jsx as baseJsx, jsxs as baseJsxs } from 'nativewind/jsx-runtime';
import { H, primitiveFor } from './primitives/primitives.js';

export { Fragment };

import type { ElementType, Key } from 'react';

type Props = Record<string, unknown>;

const map = (type: ElementType, props: Props): [ElementType, Props] => {
  if (typeof type !== 'string') return [type, props];
  const primitive = primitiveFor(type);
  return [primitive, primitive === H.unsupported ? { ...props, tag: type } : props];
};

export const jsx = (type: ElementType, props: Props, key?: Key) => baseJsx(...map(type, props), key);

export const jsxs = (type: ElementType, props: Props, key?: Key) => baseJsxs(...map(type, props), key);
