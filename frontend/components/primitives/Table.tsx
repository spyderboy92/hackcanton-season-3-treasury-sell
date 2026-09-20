import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-xs', className)}>{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
  align = 'left',
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      {...rest}
      className={cn(
        'label border-b border-line px-3 py-1.5 font-normal whitespace-nowrap',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  align = 'left',
  num = false,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & {
  align?: 'left' | 'right' | 'center';
  num?: boolean;
}) {
  return (
    <td
      {...rest}
      className={cn(
        'border-b border-line-quiet px-3 py-2 align-middle',
        num && 'num',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}
