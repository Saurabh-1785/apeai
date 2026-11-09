import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display text-[26px] leading-none tracking-[-0.02em] ${className}`}>
      Ape<span className="italic">AI</span>
      <span className="text-brand">.</span>
    </span>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 transition-colors hover:text-ink"
    >
      <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden />
      {children}
    </Link>
  );
}

/** Page heading used by every signed-in page. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  back,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  back?: React.ReactNode;
}) {
  return (
    <header className="space-y-5 border-b border-line pb-8">
      {back}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-3">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="page-title min-w-0 break-words">{title}</h1>
            {meta}
          </div>
          {description && <p className="max-w-[40rem] text-[15.5px] leading-relaxed text-ink-2">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
    </header>
  );
}

export function LoadingState({ label = 'Loading…', className = 'min-h-[55vh]' }: { label?: string; className?: string }) {
  return (
    <div role="status" className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <Loader2 className="h-5 w-5 animate-spin text-ink-3" aria-hidden />
      <p className="text-[13px] font-medium text-ink-3">{label}</p>
    </div>
  );
}

/** Small section heading with an optional count and trailing controls. */
export function SectionHeader({
  title,
  count,
  description,
  actions,
}: {
  title: React.ReactNode;
  count?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h2 className="section-title">
          {title}
          {count !== undefined && <span className="ml-2 font-sans text-[15px] font-medium tracking-normal text-ink-3">{count}</span>}
        </h2>
        {description && <p className="text-[14px] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
