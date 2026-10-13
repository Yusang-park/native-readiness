// The package root as seen by app bundlers (React Native and browsers). Babel's automatic JSX
// runtime imports createElement from the import source's root when a key follows spread props.
// Node resolves the root to the tooling in index.ts instead.
export { Fragment, createElement } from './jsx-runtime.js';
