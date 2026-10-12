import { cn } from '@/lib/cn';
import { Slot } from '@radix-ui/react-slot';
import { cx } from '@udecode/cn';
import { Hint } from '@/atoms/tooltip';

export function Header() {
  return (
    <div className={cn('grid grid-cols-2', 'md:flex')}>
      <span className="group-hover:underline text-sm">Title</span>
      <span className="opacity-0 group-hover:opacity-100">Menu</span>
      <span onMouseEnter={() => undefined}>Preview</span>
      <span onMouseEnter={() => undefined} onClick={() => undefined}>Open</span>
      <span className="hover:opacity-80">Dim</span>
      <span className="opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">Safe</span>
      <span className="invisible group-hover:visible focus-within:visible">Focusable</span>
    </div>
  );
}
