import { cn } from '@/lib/cn';
import { Slot } from '@radix-ui/react-slot';
import { cx } from '@udecode/cn';
import { Hint } from '@/atoms/tooltip';

export function Header() {
  return (
    <div className={cn('grid grid-cols-2', 'md:flex')}>
      <span className="group-hover:underline text-sm">Title</span>
    </div>
  );
}
