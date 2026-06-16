import { type TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/cn';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full rounded-xl border border-border bg-surface-elevated px-3 py-2 text-sm text-neutral-100',
          'placeholder:text-neutral-500',
          'transition-colors focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/30',
          'resize-none',
          className,
        )}
        {...props}
      />
    );
  },
);

Textarea.displayName = 'Textarea';
