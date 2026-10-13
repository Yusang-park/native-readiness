import { createContext, createElement, useContext, type ReactNode } from 'react';

type Navigate = (path: string) => void;

const NavigationContext = createContext<Navigate | null>(null);

/** Lets `<a href="/…">` navigate with the host app's router (for example expo-router). */
export const NativeNavigationProvider = ({ navigate, children }: { navigate: Navigate; children?: ReactNode }) =>
  createElement(NavigationContext.Provider, { value: navigate }, children);

export const useNativeNavigate = () => useContext(NavigationContext);

const AssetBaseContext = createContext<string | null>(null);

/** Base URL for root-relative asset paths such as `/static/icons/x.svg`. */
export const AssetBaseProvider = ({ baseUrl, children }: { baseUrl: string; children?: ReactNode }) =>
  createElement(AssetBaseContext.Provider, { value: baseUrl }, children);

export const useAssetUrl = () => {
  const base = useContext(AssetBaseContext);
  return (src: string) => (src.startsWith('/') && !src.startsWith('//') && base ? `${base.replace(/\/$/, '')}${src}` : src);
};
