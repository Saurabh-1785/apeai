'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, X, ArrowRight } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import { cssVars, prefersReducedMotion } from './motion';

const LINKS = [
  { href: '#how', label: 'How it works', accent: 'var(--lp-coral)' },
  { href: '#sources', label: 'Sources', accent: 'var(--lp-blue)' },
  { href: '#principles', label: 'Principles', accent: 'var(--lp-green)' },
];

export function scrollToHash(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
  if (!href.startsWith('#')) return;
  const target = document.querySelector(href);
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  history.replaceState(null, '', href);
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`lp-display text-[28px] leading-none tracking-[-0.02em] ${className}`}>
      Ape<span className="italic">AI</span>
      <span className="text-lp-coral">.</span>
    </span>
  );
}

export default function LandingNav() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    firstLinkRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="lp-nav sticky top-0 z-[60]">
      <div className="lp-container flex h-full items-center justify-between gap-6">
        <Link href="/" aria-label="ApeAI home" className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
          <Wordmark />
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-9">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={(e) => scrollToHash(e, l.href)}
                  className="lp-nav-link"
                  style={cssVars({ '--accent': l.accent })}
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2.5">
          {user ? (
            <Link href="/dashboard" className="lp-btn lp-btn-sm lp-btn-ink">
              Open dashboard <ArrowRight className="lp-arrow h-4 w-4" aria-hidden />
            </Link>
          ) : (
            <>
              <Link href="/login" className="lp-btn lp-btn-sm lp-btn-line !hidden sm:!inline-flex">
                Log in
              </Link>
              <Link href="/signup" className="lp-btn lp-btn-sm lp-btn-ink">
                Start free
              </Link>
            </>
          )}
          <button
            ref={toggleRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="lp-mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="lp-btn lp-btn-sm lp-btn-line !w-10 !px-0 md:!hidden"
          >
            {open ? <X className="h-[18px] w-[18px]" aria-hidden /> : <Menu className="h-[18px] w-[18px]" aria-hidden />}
          </button>
        </div>
      </div>

      <div
        id="lp-mobile-menu"
        data-open={open}
        className="lp-sheet absolute inset-x-0 top-full border-b border-lp-line bg-lp-paper md:hidden"
      >
        <div className="lp-container pb-8 pt-4">
          <ul className="divide-y divide-lp-line border-y border-lp-line">
            {LINKS.map((l, i) => (
              <li key={l.href}>
                <a
                  ref={i === 0 ? firstLinkRef : undefined}
                  href={l.href}
                  tabIndex={open ? 0 : -1}
                  onClick={(e) => {
                    setOpen(false);
                    scrollToHash(e, l.href);
                  }}
                  className="lp-display flex items-center justify-between py-4 text-[34px] leading-tight"
                >
                  {l.label}
                  <span className="h-2 w-2 rounded-full" style={{ background: l.accent }} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
          {!user && (
            <Link
              href="/login"
              tabIndex={open ? 0 : -1}
              className="lp-btn lp-btn-line mt-6 w-full"
              onClick={() => setOpen(false)}
            >
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
