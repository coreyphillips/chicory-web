'use client';
import type { ComponentProps } from 'react';
import { Dialog as Primitive } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/libs/utils/utils';

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;

export function DialogContent({ hiddenTitle, className, children, ...props }:
  ComponentProps<typeof Primitive.Content> & { hiddenTitle: string }) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-40 bg-black/65" />
      <Primitive.Content
        aria-describedby={undefined}
        data-slot="dialog-content"
        className={cn('fixed top-1/2 left-1/2 z-50 grid max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 overflow-auto rounded-3xl border border-border bg-card p-6 shadow-xl', className)}
        {...props}
      >
        <Primitive.Title className="sr-only">{hiddenTitle}</Primitive.Title>
        {children}
        <Primitive.Close aria-label="Close" className="absolute top-3 right-3 rounded-full bg-secondary p-2">
          <X size={18} />
        </Primitive.Close>
      </Primitive.Content>
    </Primitive.Portal>
  );
}
