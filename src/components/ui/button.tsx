import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 ease-expo cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-accent text-accent-foreground font-semibold shadow-glow hover:bg-accent/90 hover:shadow-glow-lg',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-border/80 bg-transparent hover:bg-secondary/60 hover:border-border text-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-secondary/60 text-foreground',
        link: 'text-accent underline-offset-4 hover:underline',
        /** System window control: square, cyan hairline, glows on hover. */
        system:
          'rounded-sm border border-system/40 bg-system/[0.07] text-system backdrop-blur-md hover:bg-system/[0.14] hover:border-system/70 hover:shadow-glow-system',
        glass:
          'border border-white/10 bg-white/[0.06] text-foreground backdrop-blur-md hover:bg-white/[0.12] hover:border-accent/40',
      },
      size: {
        default: 'h-11 px-5 py-2',
        sm: 'h-9 rounded-md px-3 text-xs',
        // 44px floor keeps every control at the accessible touch-target minimum.
        lg: 'h-12 rounded-lg px-7 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
