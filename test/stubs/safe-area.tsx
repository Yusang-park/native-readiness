import type { ReactNode } from 'react';

export const SafeAreaView = ({ children, edges }: { children?: ReactNode; edges?: string[] }) => (
  <div data-safe-area={(edges ?? []).join(',')}>{children}</div>
);
