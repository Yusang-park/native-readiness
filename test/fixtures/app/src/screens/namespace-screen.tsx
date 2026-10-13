import * as Atoms from '@/atoms';
import { local } from '@/atoms/mixed';

export function NamespaceScreen() {
  return <Atoms.Button label={String(local)} />;
}
