import { Button } from '@/atoms/button';
import { Header } from '@/components/header';
import { Chart } from '@/components/chart';
import Editor from '@/components/editor';
import DomMap from '@/components/dom-map';
import { apiUrl } from '@/lib/env';
import { Hint } from '@/atoms/tooltip';

export function SheetScreen() {
  return (
    <Screen>
      <Header />
      <Chart />
      <Editor value="x" onChange={() => apiUrl} />
      <DomMap />
      <Button />
    </Screen>
  );
}

function Screen({ children }: { children: unknown }) {
  return children;
}
