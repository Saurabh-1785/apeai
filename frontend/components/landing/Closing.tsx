'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import SplitWords from './SplitWords';
import { cssVars, prefersReducedMotion } from './motion';

function CountUp({ to, className = '' }: { to: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      setValue(to);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const duration = 1600;
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
          setValue(Math.round(eased * to));
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to]);

  // The invisible final value reserves the width, so the sentence never reflows while counting.
  return (
    <>
      <span className="sr-only">{to.toLocaleString('en-US')}</span>
      <span aria-hidden className={`relative inline-block ${className}`}>
        <span className="invisible">{to.toLocaleString('en-US')}</span>
        <span ref={ref} className="absolute inset-y-0 right-0">
          {value.toLocaleString('en-US')}
        </span>
      </span>
    </>
  );
}

export function ClosingSections() {
  const { user } = useAuth();
  return (
    <>
      <section aria-label="What you get" className="lp-section lp-stick lp-fill z-[8] flex items-center bg-lp-stone py-24">
        <div className="lp-container text-center">
          <p data-reveal className="lp-display mx-auto max-w-[25ch] text-[clamp(2.2rem,4.8vw,4.5rem)] leading-[1.06] tracking-[-0.02em]">
            Drop in <CountUp to={1000} className="italic text-lp-coral" /> comments. Get back the few problems that matter,{' '}
            <span className="italic">written up and waiting for review.</span>
          </p>
          <div data-reveal style={cssVars({ '--d': '200ms' })} className="mt-10 flex flex-col justify-center gap-3 sm:flex-row md:mt-12">
            <Link href={user ? '/dashboard' : '/signup'} className="lp-btn lp-btn-ink">
              {user ? 'Open your dashboard' : 'Start for free'}
              <ArrowRight className="lp-arrow h-4 w-4" aria-hidden />
            </Link>
            <Link href="/upload" className="lp-btn lp-btn-line">
              Upload a CSV
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="lp-cta-title" className="lp-section z-[9] bg-lp-void text-lp-moon">
        <div className="lp-container">
          <div className="flex flex-col gap-10 border-b border-lp-nightline py-20 md:flex-row md:items-end md:justify-between md:py-28">
            <h2 id="lp-cta-title" className="lp-display max-w-[13ch] text-[clamp(2.75rem,6vw,5.25rem)] leading-[0.98] tracking-[-0.025em]">
              <SplitWords parts={['Stop reading feedback.', { text: 'Start shipping it.', className: 'italic text-lp-coralL' }]} />
            </h2>
            <div data-reveal style={cssVars({ '--d': '300ms' })}>
              <Link href={user ? '/dashboard' : '/signup'} className="lp-btn lp-btn-moon">
                {user ? 'Open your dashboard' : 'Create your workspace'}
                <ArrowRight className="lp-arrow h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

const FOOTER_LINKS = [
  {
    heading: 'Product',
    links: [
      { href: '#how', label: 'How it works' },
      { href: '#sources', label: 'Sources' },
      { href: '#principles', label: 'Principles' },
    ],
  },
  {
    heading: 'App',
    links: [
      { href: '/login', label: 'Log in' },
      { href: '/signup', label: 'Sign up' },
      { href: '/dashboard', label: 'Dashboard' },
    ],
  },
];

export function SiteFooter({ wordmark }: { wordmark: React.ReactNode }) {
  return (
    <footer className="relative z-[9] bg-lp-void text-lp-moon">
      <div className="lp-container">
        <div className="grid gap-14 py-16 md:grid-cols-12 md:py-20">
          <div className="md:col-span-5">
            {wordmark}
            <div className="mt-10 grid max-w-[22rem] grid-cols-2 gap-8 text-[15px]">
              {FOOTER_LINKS.map((col) => (
                <div key={col.heading}>
                  <p className="text-[12px] font-semibold text-lp-moon2">{col.heading}</p>
                  <ul className="mt-3 space-y-2.5">
                    {col.links.map((l) => (
                      <li key={l.label}>
                        <Link href={l.href} className="text-lp-moon underline decoration-transparent underline-offset-4 transition-colors duration-200 hover:decoration-current">
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <figure data-reveal className="md:col-span-7">
            <blockquote className="lp-display text-[clamp(1.9rem,3.4vw,2.9rem)] leading-[1.14] tracking-[-0.01em]">
              Every complaint is a feature request that nobody has written up yet.
              <span aria-hidden className="lp-quote-caret ml-1.5 inline-block h-[0.8em] w-[2px] translate-y-[0.08em] bg-lp-moon" />
            </blockquote>
            <figcaption className="mt-4 text-[14px] text-lp-moon2">Why we built ApeAI</figcaption>
          </figure>
        </div>
        <div className="flex flex-col gap-2 border-t border-lp-nightline py-6 text-[13px] text-lp-moon2 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} ApeAI</p>
          <p>Built on Gemini, Supabase and pgvector.</p>
        </div>
      </div>
    </footer>
  );
}
