import { createContext, createElement, useContext, type ReactNode } from 'react';

const TextClassContext = createContext('');

/** Text classes inherited from enclosing containers, like CSS inheritance on the web. */
export const useInheritedTextClasses = () => useContext(TextClassContext);

export const TextClassProvider = ({ value, children }: { value: string; children?: ReactNode }) =>
  createElement(TextClassContext.Provider, { value }, children);
