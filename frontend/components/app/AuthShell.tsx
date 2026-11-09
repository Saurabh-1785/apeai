import React from 'react';
import Link from 'next/link';
import { Wordmark } from './primitives';
import { SetupNotice } from './FormError';

const FRAGMENTS: { text: string; className: string; style: React.CSSProperties }[] = [
  { text: '“can we export this to csv??”', className: 'font-display italic text-[22px]', style: { left: '9%', top: '22%' } },
  { text: '★★☆☆☆', className: 'text-[15px] tracking-[0.15em]', style: { right: '12%', top: '17%' } },
  { text: 'app freezes after login on iOS', className: 'text-[15px] font-medium', style: { right: '8%', top: '33%' } },
  { text: 'zoom call · 00:42:13', className: 'font-mono text-[12.5px]', style: { left: '13%', top: '40%' } },
  { text: '“dark mode please, my eyes”', className: 'font-display italic text-[20px]', style: { right: '16%', top: '48%' } },
  { text: 'ticket #4821 · reopened', className: 'font-mono text-[12.5px]', style: { left: '22%', top: '55%' } },
];

/**
 * Split layout for sign-in flows: a dark editorial panel on the left
 * (hidden on small screens) and the form on the right.
 */
export default function AuthShell({
  eyebrow,
  title,
  description,
  topRight,
  children,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  topRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-paper lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-night text-moon lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-14">
        <Link href="/" aria-label="ApeAI home" className="relative z-10 w-fit rounded-sm">
          <Wordmark className="text-moon" />
        </Link>

        <div aria-hidden className="pointer-events-none absolute inset-0 select-none">
          {FRAGMENTS.map((f, i) => (
            <span
              key={f.text}
              className={`absolute whitespace-nowrap text-moon/30 ${f.className}`}
              style={{ ...f.style, animation: `app-fade 1200ms linear ${200 + i * 120}ms both` }}
            >
              {f.text}
            </span>
          ))}
        </div>

        <figure className="relative z-10 max-w-[30rem]">
          <blockquote className="font-display text-[clamp(2rem,3.2vw,2.75rem)] leading-[1.1] tracking-[-0.02em]">
            Every complaint is a feature request that <span className="italic text-[#ff8670]">nobody has written up yet.</span>
          </blockquote>
          <figcaption className="mt-5 font-mono text-[12px] text-moon/60">
            Nothing reaches Jira until someone approves it.
          </figcaption>
        </figure>
      </aside>

      <main className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-14">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="ApeAI home" className="rounded-sm lg:invisible">
            <Wordmark />
          </Link>
          {topRight && <div className="text-[14px] text-ink-2">{topRight}</div>}
        </div>

        <div className="app-enter mx-auto my-auto w-full max-w-[400px] py-12">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="mt-3 font-display text-[44px] leading-[1.02] tracking-[-0.025em] text-ink">{title}</h1>
          {description && <p className="mt-3 text-[15.5px] leading-relaxed text-ink-2">{description}</p>}
          <div className="mt-9">
            <SetupNotice />
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
