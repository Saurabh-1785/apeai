'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Right-hand panel built on the native <dialog> element: showModal() makes the
 * page behind it inert, traps focus, closes on Escape and returns focus to the
 * button that opened it.
 */
export function SlideOver({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Start on the first field rather than the close button.
      dialog.querySelector<HTMLElement>('input:not([type=hidden]), textarea, select')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="slide-over-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
      className="slide-over !m-0 !ml-auto h-dvh max-h-none w-full max-w-[520px] border-0 border-l border-line bg-paper p-0 text-ink backdrop:bg-ink/30"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <h2 id="slide-over-title" className="section-title">
              {title}
            </h2>
            {description && <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="btn btn-ghost btn-icon btn-sm -mr-2 shrink-0">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-6">{open && children}</div>
      </div>
    </dialog>
  );
}
