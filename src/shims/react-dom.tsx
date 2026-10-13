/** @jsxImportSource nativewind */
import type { ReactNode } from 'react';
import { Modal } from 'react-native';

// Native stand-in for react-dom. Portals render in a top-level native layer; the DOM-only
// APIs are no-ops.
export const createPortal = (children: ReactNode, _container?: unknown) => (
  <Modal transparent visible animationType="none">
    {children}
  </Modal>
);
export const flushSync = <T,>(callback: () => T) => callback();
export const unstable_batchedUpdates = <T,>(callback: () => T) => callback();
export const findDOMNode = () => null;
export const render = () => undefined;
export const hydrate = () => undefined;
export const unmountComponentAtNode = () => false;
export const preload = () => undefined;
export const preconnect = () => undefined;
export const prefetchDNS = () => undefined;
export const preinit = () => undefined;
export default { createPortal, flushSync, unstable_batchedUpdates, findDOMNode, render, hydrate, unmountComponentAtNode };
