// NativeWind's JSX runtime processes `className` on React Native components. The library only
// needs its module shape at build time; the consuming app provides NativeWind itself.
declare module 'nativewind/jsx-runtime' {
  export * from 'react/jsx-runtime';
}

declare module 'nativewind/jsx-dev-runtime' {
  export * from 'react/jsx-dev-runtime';
}

declare module 'nativewind' {
  export function cssInterop(component: unknown, mapping: Record<string, unknown>): void;
}
