/** @jsxImportSource nativewind */
import { createElement, type ElementType, type ReactNode } from 'react';
import { primitiveFor } from '../primitives/primitives.js';

// Native stand-in for framer-motion: motion elements render as plain primitives and
// animations are skipped (the same as prefers-reduced-motion on the web).
const MOTION_PROPS = new Set([
  'initial',
  'animate',
  'exit',
  'transition',
  'variants',
  'whileHover',
  'whileTap',
  'whileFocus',
  'whileDrag',
  'whileInView',
  'layout',
  'layoutId',
  'layoutDependency',
  'layoutScroll',
  'onAnimationStart',
  'onAnimationComplete',
  'onUpdate',
  'onHoverStart',
  'onHoverEnd',
  'drag',
  'dragConstraints',
  'dragElastic',
  'dragMomentum',
  'dragListener',
  'onDrag',
  'onDragStart',
  'onDragEnd',
  'custom',
  'inherit',
  'viewport',
  'transformTemplate',
]);

type Props = Record<string, unknown>;

const stripMotion = (props: Props) => Object.fromEntries(Object.entries(props).filter(([key]) => !MOTION_PROPS.has(key)));

const wrap = (component: ElementType) => (props: Props) => createElement(component, stripMotion(props));

const cache = new Map<string, (props: Props) => ReactNode>();

const forTag = (tag: string) => {
  const existing = cache.get(tag);
  if (existing) return existing;
  const component = wrap(primitiveFor(tag));
  cache.set(tag, component);
  return component;
};

type Motion = ((component: ElementType) => (props: Props) => ReactNode) & Record<string, (props: Props) => ReactNode>;

export const motion: Motion = new Proxy(wrap, {
  get: (target, key) => (typeof key === 'string' && !(key in target) ? forTag(key) : Reflect.get(target, key)),
}) as Motion;
export const m = motion;

export const AnimatePresence = ({ children }: { children?: ReactNode }) => <>{children}</>;
export const LayoutGroup = AnimatePresence;
export const MotionConfig = AnimatePresence;
export const LazyMotion = AnimatePresence;
export const domAnimation = {};
export const domMax = {};

export const useReducedMotion = () => true;
export const useInView = () => true;
export const useIsPresent = () => true;
export const usePresence = () => [true, () => undefined] as const;

type MotionValue<T> = { get: () => T; set: (value: T) => void; on: () => () => void; destroy: () => void };

export const useMotionValue = <T,>(initial: T): MotionValue<T> => {
  let value = initial;
  return { get: () => value, set: (next) => void (value = next), on: () => () => undefined, destroy: () => undefined };
};
export const useSpring = useMotionValue;
export const useTransform = <T,>(_source: unknown, _input?: unknown, output?: T[]) => useMotionValue(output?.[0]);
export const useScroll = () => ({ scrollX: useMotionValue(0), scrollY: useMotionValue(0), scrollXProgress: useMotionValue(0), scrollYProgress: useMotionValue(0) });
export const useAnimation = () => ({ start: async () => undefined, stop: () => undefined, set: () => undefined });
export const useAnimationControls = useAnimation;
export const animate = () => ({ stop: () => undefined, then: (resolve: () => void) => resolve() });
