'use client';

import React, { useRef } from 'react';
import SplitWords from './SplitWords';
import { useScrollVar } from './motion';

const ROW_A = [
  { name: 'App Store', accent: 'var(--lp-blue-l)' },
  { name: 'Google Play', accent: 'var(--lp-green-l)' },
  { name: 'Reddit', accent: 'var(--lp-coral-l)' },
  { name: 'Intercom', accent: 'var(--lp-blue-l)' },
  { name: 'Zendesk', accent: 'var(--lp-green-l)' },
  { name: 'Fireflies', accent: 'var(--lp-amber-l)' },
];
const ROW_B = [
  { name: 'Zoom', accent: 'var(--lp-blue-l)' },
  { name: 'Sentry', accent: 'var(--lp-coral-l)' },
  { name: 'PostHog', accent: 'var(--lp-amber-l)' },
  { name: 'CSV upload', accent: 'var(--lp-green-l)' },
  { name: 'Manual paste', accent: 'var(--lp-coral-l)' },
  { name: 'Webhooks', accent: 'var(--lp-blue-l)' },
];

function Row({ items, className }: { items: typeof ROW_A; className: string }) {
  const repeated = [...items, ...items, ...items];
  return (
    <div className={`lp-marquee ${className}`}>
      {repeated.map((item, i) => (
        <span
          key={i}
          className={`lp-display flex items-center gap-[0.4em] whitespace-nowrap px-[0.4em] text-[clamp(2.75rem,7vw,6rem)] leading-[1.1] ${
            i % 2 ? 'italic text-lp-moon2' : 'text-lp-moon'
          }`}
        >
          {item.name}
          <span className="inline-block h-[0.13em] w-[0.13em] rounded-full" style={{ background: item.accent }} />
        </span>
      ))}
    </div>
  );
}

export default function Sources() {
  const ref = useRef<HTMLElement>(null);

  // Rows slide sideways as the section passes through the viewport.
  useScrollVar(
    ref,
    (el, vh) => {
      const r = el.getBoundingClientRect();
      return (vh - r.top) / (vh + r.height);
    },
    { name: '--m', ease: 0.08, reducedValue: 0.5 }
  );

  return (
    <section
      id="sources"
      ref={ref}
      aria-labelledby="lp-sources-title"
      className="lp-section z-[6] overflow-hidden bg-lp-night py-24 text-lp-moon md:py-36"
    >
      <div className="lp-container">
        <div className="mx-auto max-w-[52rem] text-center">
          <h2 id="lp-sources-title" className="lp-display text-[clamp(2.5rem,5.6vw,4.75rem)] leading-[1.02] tracking-[-0.02em]">
            <SplitWords parts={['Wherever people complain,', { text: 'ApeAI is listening.', className: 'italic text-lp-blueL' }]} />
          </h2>
          <p data-reveal className="mx-auto mt-6 max-w-[36rem] text-[17px] leading-relaxed text-lp-moon2 md:text-[18px]">
            Paste it, upload it, or connect a source. Everything lands in the same shape, so the rest of the pipeline never has
            to care where a comment came from.
          </p>
        </div>
      </div>

      <ul className="sr-only">
        {[...ROW_A, ...ROW_B].map((s) => (
          <li key={s.name}>{s.name}</li>
        ))}
      </ul>
      <div aria-hidden className="mt-16 space-y-2 md:mt-24">
        <Row items={ROW_A} className="lp-marquee-a" />
        <Row items={ROW_B} className="lp-marquee-b" />
      </div>

      <div className="lp-container">
        <p data-reveal className="lp-mono mt-16 text-center text-[12px] text-lp-moon2 md:mt-24">
          Publishing: Jira Cloud today · GitHub and Linear next
        </p>
      </div>
    </section>
  );
}
