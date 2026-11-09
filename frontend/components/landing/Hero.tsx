'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowDown } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import { cssVars, navHeight, prefersReducedMotion, usePrefersReducedMotion, useScrollVar, useTypewriter } from './motion';
import { scrollToHash } from './LandingNav';

const WORDS = ['clusters.', 'PRDs.', 'user stories.', 'Jira tickets.'];
const WORD_COLORS = ['var(--lp-coral-l)', 'var(--lp-blue-l)', 'var(--lp-green-l)', 'var(--lp-amber-l)'];

type Fragment = {
  text: string;
  kind: 'quote' | 'mono' | 'sans';
  pos: React.CSSProperties;
  depth: number;
  show?: 'md' | 'lg';
};

// The raw noise ApeAI is built to make sense of.
const FRAGMENTS: Fragment[] = [
  { text: '“can we export this to csv??”', kind: 'quote', pos: { left: '5%', top: '11%' }, depth: 0.7 },
  { text: '★★☆☆☆', kind: 'sans', pos: { right: '9%', top: '9%' }, depth: 1.2 },
  { text: 'TypeError: cannot read properties of undefined', kind: 'mono', pos: { right: '24%', top: '4%' }, depth: 0.5, show: 'lg' },
  { text: '+1, same here', kind: 'sans', pos: { left: '3%', top: '46%' }, depth: 1.4, show: 'md' },
  { text: '“love it, but…”', kind: 'quote', pos: { left: '7%', top: '29%' }, depth: 0.9, show: 'lg' },
  { text: '“onboarding was confusing”', kind: 'quote', pos: { right: '4%', top: '32%' }, depth: 0.8, show: 'lg' },
  { text: 'app freezes after login on iOS', kind: 'sans', pos: { right: '3%', top: '58%' }, depth: 1.3, show: 'lg' },
  { text: 'r/productivity · 214 upvotes', kind: 'mono', pos: { left: '6%', top: '70%' }, depth: 1, show: 'md' },
  { text: 'zoom call · 00:42:13', kind: 'mono', pos: { right: '7%', top: '76%' }, depth: 0.7, show: 'md' },
  { text: '“dark mode please, my eyes”', kind: 'quote', pos: { left: '12%', top: '87%' }, depth: 1.1 },
  { text: 'ticket #4821 · reopened', kind: 'mono', pos: { right: '16%', top: '90%' }, depth: 0.6 },
  { text: 'feature request:', kind: 'sans', pos: { left: '27%', top: '6%' }, depth: 0.9, show: 'lg' },
  { text: 'Sentry · 1,204 events', kind: 'mono', pos: { left: '24%', top: '94%' }, depth: 0.8, show: 'lg' },
];

const KIND_CLASS: Record<Fragment['kind'], string> = {
  quote: 'lp-display italic text-[19px] md:text-[22px] opacity-[0.34]',
  mono: 'lp-mono text-[11.5px] md:text-[12.5px] opacity-[0.3]',
  sans: 'text-[14px] md:text-[15px] font-medium opacity-[0.3]',
};

function CursorArrow({ color }: { color: string }) {
  return (
    <svg width="18" height="22" viewBox="0 0 18 22" fill="none" aria-hidden>
      <path d="M1.5 1.5v16.2l4.6-4.4 3.1 6.9 2.9-1.3-3.1-6.8h6.4L1.5 1.5Z" fill={color} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export default function Hero() {
  const { user } = useAuth();
  const heroRef = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();
  const { index, text, typing } = useTypewriter(WORDS, reduced);

  // How far the next section has slid over the hero (0 → 1).
  useScrollVar(
    heroRef,
    (el, vh) => {
      const next = el.nextElementSibling as HTMLElement | null;
      if (!next) return 0;
      const nav = navHeight(el);
      return (vh - next.getBoundingClientRect().top) / Math.max(1, vh - nav);
    },
    { name: '--cover', ease: 0.14, reducedValue: 0 }
  );

  // Gentle pointer parallax on the background fragments and cursors.
  useEffect(() => {
    const el = heroRef.current;
    if (!el || prefersReducedMotion()) return;
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const tick = () => {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      if (Math.abs(tx - cx) < 0.001 && Math.abs(ty - cy) < 0.001) {
        cx = tx;
        cy = ty;
      }
      el.style.setProperty('--mx', cx.toFixed(4));
      el.style.setProperty('--my', cy.toFixed(4));
      raf = cx === tx && cy === ty ? 0 : requestAnimationFrame(tick);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section
      ref={heroRef}
      aria-labelledby="lp-hero-title"
      className="lp-section lp-hero lp-stick lp-fill z-[1] flex items-center overflow-hidden py-24"
    >
      {/* Background: scattered, unprocessed feedback */}
      <div aria-hidden className="pointer-events-none absolute inset-0 select-none">
        {FRAGMENTS.map((f, i) => (
          <span
            key={f.text}
            className={`lp-frag ${f.show === 'md' ? 'hidden md:block' : f.show === 'lg' ? 'hidden lg:block' : ''} ${KIND_CLASS[f.kind]}`}
            style={{ ...f.pos, ...cssVars({ '--depth': f.depth, '--d': `${300 + i * 90}ms` }) }}
          >
            <span>{f.text}</span>
          </span>
        ))}
      </div>

      <div className="lp-hero-content relative mx-auto w-full max-w-[64rem] px-5 text-center">
        <h1 id="lp-hero-title" className="lp-display text-[clamp(3rem,8.4vw,7.25rem)] leading-[1.02] tracking-[-0.025em]">
          <span className="sr-only">Turn feedback into clusters, PRDs, user stories and Jira tickets.</span>
          <span aria-hidden className="lp-enter block" style={cssVars({ '--d': '80ms' })}>
            Turn feedback into
          </span>
          <span aria-hidden className="lp-enter block min-h-[1.05em] italic" style={cssVars({ '--d': '200ms' })}>
            <span style={{ color: WORD_COLORS[index] }}>{text}</span>
            <span className="lp-caret text-lp-moon" data-blink={!typing} />
          </span>
        </h1>

        <p
          className="lp-enter mx-auto mt-7 max-w-[35rem] text-[17px] leading-[1.6] text-lp-moon2 md:mt-9 md:text-[19px]"
          style={cssVars({ '--d': '380ms' })}
        >
          ApeAI reads your reviews, support tickets and call notes, groups what belongs together, and drafts the
          work. You approve it before anything reaches Jira.
        </p>

        <div
          className="lp-enter mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center md:mt-11"
          style={cssVars({ '--d': '520ms' })}
        >
          <Link href={user ? '/dashboard' : '/signup'} className="lp-btn lp-btn-moon">
            {user ? 'Open your dashboard' : 'Start for free'}
            <ArrowRight className="lp-arrow h-4 w-4" aria-hidden />
          </Link>
          <a href="#how" onClick={(e) => scrollToHash(e, '#how')} className="lp-btn lp-btn-ghost">
            See how it works
          </a>
        </div>

        {/* Two collaborators: you, and the machine doing the paperwork */}
        <span
          aria-hidden
          className="lp-cursor left-[2%] top-[66%] hidden md:block"
          style={cssVars({ '--depth': 1.6, '--d': '1300ms', '--fx': '-40px' })}
        >
          <span>
            <CursorArrow color="var(--lp-coral)" />
            <span className="lp-cursor-tag" style={{ background: 'var(--lp-coral)' }}>You</span>
          </span>
        </span>
        <span
          aria-hidden
          className="lp-cursor right-[3%] top-[30%] hidden md:block"
          style={cssVars({ '--depth': 1.2, '--d': '1500ms', '--fx': '40px' })}
        >
          <span>
            <CursorArrow color="var(--lp-blue)" />
            <span className="lp-cursor-tag" style={{ background: 'var(--lp-blue)' }}>ApeAI</span>
          </span>
        </span>
      </div>

      <div className="absolute bottom-6 left-0 right-0 flex justify-center" aria-hidden>
        <span className="lp-enter lp-mono flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-lp-moon2" style={cssVars({ '--d': '900ms' })}>
          Scroll <ArrowDown className="h-3.5 w-3.5" />
        </span>
      </div>
    </section>
  );
}
