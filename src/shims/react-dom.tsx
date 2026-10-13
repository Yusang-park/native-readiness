/** @jsxImportSource nativewind */
import type { ReactNode } from 'react';
import { Modal, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

// Native stand-in for react-dom. Portals render in a top-level native layer that, like a browser
// viewport, starts below the status bar; bottom insets come from the content's safe-area classes.
// The DOM-only APIs are no-ops.
export const createPortal = (children: ReactNode, _container?: unknown) => (
  <Modal transparent visible animationType="none" statusBarTranslucent>
    {/* A modal is its own native window, so it needs its own safe-area provider. */}
    <SafeAreaProvider>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Absolute overlays position against this box, which starts below the status bar. */}
        <View style={{ flex: 1 }}>{children}</View>
      </SafeAreaView>
    </SafeAreaProvider>
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
