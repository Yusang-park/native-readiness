// Native stand-in for react-dom/client. The app root is React Native's, so these are inert.
const inertRoot = () => ({ render: (_children: unknown) => undefined, unmount: () => undefined });

export const createRoot = (_container: unknown, _options?: unknown) => inertRoot();
export const hydrateRoot = (_container: unknown, _children: unknown, _options?: unknown) => inertRoot();
export default { createRoot, hydrateRoot };
