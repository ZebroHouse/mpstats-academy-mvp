import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva(
  // v2 reskin: softer corners (rounded-2xl) closer to marketing cards.
  'rounded-2xl border text-card-foreground transition-all duration-200',
  {
    variants: {
      variant: {
        // Default white card
        default: 'bg-white border-mp-gray-200 shadow-mp-card',
        // Soft colored backgrounds
        'soft-blue': 'bg-mp-blue-50 border-mp-blue-100',
        'soft-green': 'bg-mp-green-50 border-mp-green-100',
        'soft-pink': 'bg-mp-pink-50 border-mp-pink-100',
        // Gradient background
        gradient: 'bg-mp-hero-gradient border-transparent',
        // Outline only
        outline: 'bg-transparent border-mp-gray-200',
        // Glass effect (subtle transparency)
        glass: 'bg-white/80 backdrop-blur-sm border-mp-gray-100 shadow-mp-card',
        // Elevated with stronger shadow
        elevated: 'bg-white border-mp-gray-100 shadow-mp-lg',
      },
      interactive: {
        true: 'cursor-pointer hover:shadow-mp-card-hover hover:-translate-y-0.5',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      interactive: false,
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, interactive, className }))}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-heading-lg text-mp-gray-900 tracking-tight', className)}
      {...props}
    />
  )
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-body-sm text-mp-gray-500', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants };
