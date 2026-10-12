import { Header } from '@/components/header';
import { Button } from '@/atoms/button';
import { Hint } from '@/atoms/tooltip';
import { Footer } from '@/components/footer';

export function DashboardScreen() {
  const wide = useMediaQuery('(min-width: 768px)');
  return (
    <>
      <Header />
      <Button />
      <Footer />
    </>
  );
}
