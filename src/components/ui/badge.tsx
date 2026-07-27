import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-accent text-accent-foreground shadow-glow',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-border/70 text-muted-foreground',
        glass: 'border-white/10 bg-white/[0.06] text-foreground backdrop-blur-sm',
        /** System notification chrome — square, cyan, monospace. */
        system:
          'rounded-sm border-system/40 bg-system/10 font-mono uppercase tracking-wider text-system backdrop-blur-sm',
        violet:
          'rounded-sm border-accent/40 bg-accent/10 font-mono uppercase tracking-wider text-accent backdrop-blur-sm',
        /** For `status: wip` / `archived` — colour is paired with text, never alone. */
        wip: 'border-rank/40 bg-rank/10 text-rank',
        archived: 'border-border/60 bg-muted/50 text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
