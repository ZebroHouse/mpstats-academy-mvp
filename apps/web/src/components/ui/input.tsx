import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const inputVariants = cva(
  // v2 reskin: rounded-xl inputs to match softer card/button corners.
  'flex w-full rounded-xl border bg-white px-4 py-2.5 text-body text-mp-gray-900 transition-all duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-mp-gray-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-mp-gray-50 disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'border-mp-gray-200 focus:border-mp-blue-500 focus:ring-2 focus:ring-mp-blue-500/20',
        error:
          'border-red-500 text-red-900 placeholder:text-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/20',
        success:
          'border-mp-green-500 focus:border-mp-green-500 focus:ring-2 focus:ring-mp-green-500/20',
      },
      inputSize: {
        default: 'h-11 text-body',
        sm: 'h-9 px-3 text-body-sm',
        lg: 'h-14 px-5 text-body-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      inputSize: 'default',
    },
  }
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  error?: boolean;
  success?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant, inputSize, error, success, ...props }, ref) => {
    // Auto-detect variant from error/success props
    const computedVariant = error ? 'error' : success ? 'success' : variant;

    return (
      <input
        type={type}
        className={cn(inputVariants({ variant: computedVariant, inputSize, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input, inputVariants };
