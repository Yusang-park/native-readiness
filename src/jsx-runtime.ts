// A JSX runtime for native builds: intrinsic tags (`<div>`, `<span>`, `<svg>`, …) render as
// React Native primitives, so web components run on native without a fork. Everything is then
// handed to NativeWind's runtime, which turns `className` into styles.
import type { ElementType, Key, ReactElement } from 'react';
import { Fragment, jsx as baseJsx, jsxs as baseJsxs } from 'nativewind/jsx-runtime';
import { H, primitiveFor } from './primitives/primitives.js';

export { Fragment };

type Props = Record<string, unknown>;
type JsxType = ElementType | string;

// Hyphenated names are custom elements, never HTML tags; libraries use them as probes
// (NativeWind checks its JSX setup with one), so they pass through untouched.
export const isCustomElement = (type: JsxType): type is string => typeof type === 'string' && type.includes('-');

const map = (type: ElementType | string, props: Props): [ElementType, Props] => {
  if (typeof type !== 'string') return [type, props];
  const primitive = primitiveFor(type);
  return [primitive, primitive === H.unsupported ? { ...props, tag: type } : props];
};

const passThrough = (runtime: typeof baseJsx, type: string, props: Props, key?: Key): ReactElement =>
  Reflect.apply(runtime, undefined, [type, props, key]);

export const jsx = (type: JsxType, props: Props, key?: Key) =>
  isCustomElement(type) ? passThrough(baseJsx, type, props, key) : baseJsx(...map(type, props), key);

export const jsxs = (type: JsxType, props: Props, key?: Key) =>
  isCustomElement(type) ? passThrough(baseJsxs, type, props, key) : baseJsxs(...map(type, props), key);
