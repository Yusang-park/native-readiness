import type { ElementType, Key, ReactElement } from 'react';
import { jsxDEV as baseJsxDEV, type JSXSource } from 'nativewind/jsx-dev-runtime';
import { isCustomElement } from './jsx-runtime.js';
import { H, primitiveFor } from './primitives/primitives.js';

export { Fragment } from 'nativewind/jsx-dev-runtime';

type Props = Record<string, unknown>;

export const jsxDEV = (
  type: ElementType | string,
  props: Props,
  key: Key | undefined,
  isStatic: boolean,
  source?: JSXSource,
  self?: unknown,
): ReactElement => {
  if (isCustomElement(type)) return Reflect.apply(baseJsxDEV, undefined, [type, props, key, isStatic, source, self]);
  if (typeof type !== 'string') return baseJsxDEV(type, props, key, isStatic, source, self);
  const primitive = primitiveFor(type);
  return baseJsxDEV(primitive, primitive === H.unsupported ? { ...props, tag: type } : props, key, isStatic, source, self);
};
