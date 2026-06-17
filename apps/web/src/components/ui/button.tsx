import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // v2 reskin: meet-in-middle radii (standard = rounded-xl, big CTA = pill via size, dense = rounded-lg), font-medium.
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        // Primary Blue — главные действия
        default:
          'bg-mp-blue-500 text-white shadow-mp hover:bg-mp-blue-600 hover:shadow-mp-md active:bg-mp-blue-700',
        // Success Green — успешные действия, подтверждения
        success:
          'bg-mp-green-500 text-mp-green-900 shadow-mp hover:bg-mp-green-600 hover:shadow-mp-md active:bg-mp-green-700',
        // Featured Pink — промо, акценты, CTA
        featured:
          'bg-mp-pink-500 text-white shadow-mp hover:bg-mp-pink-600 hover:shadow-mp-md active:bg-mp-pink-700',
        // Destructive — удаление, опасные действия
        destructive:
          'bg-destructive text-destructive-foreground shadow-mp hover:bg-destructive/90 hover:shadow-mp-md',
        // Outline — вторичные действия с рамкой
        outline:
          'border-2 border-mp-blue-500 bg-transparent text-mp-blue-500 hover:bg-mp-blue-50 hover:border-mp-blue-600 active:bg-mp-blue-100',
        // Outline Success
        'outline-success':
          'border-2 border-mp-green-500 bg-transparent text-mp-green-700 hover:bg-mp-green-50 hover:border-mp-green-600 active:bg-mp-green-100',
        // Secondary — мягкие действия на сером фоне
        secondary:
          'bg-mp-gray-100 text-mp-gray-700 hover:bg-mp-gray-200 active:bg-mp-gray-300',
        // Ghost — минимальный стиль
        ghost:
          'text-mp-gray-700 hover:bg-mp-gray-100 hover:text-mp-gray-900 active:bg-mp-gray-200',
        // Link — текстовая ссылка
        link: 'text-mp-blue-500 underline-offset-4 hover:underline hover:text-mp-blue-600',
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-9 px-4 text-xs rounded-lg',
        lg: 'h-12 px-8 text-base rounded-full',
        xl: 'h-14 px-10 text-lg rounded-full',
        icon: 'h-10 w-10',
        'icon-sm': 'h-8 w-8 rounded-lg',
        'icon-lg': 'h-12 w-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
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
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
