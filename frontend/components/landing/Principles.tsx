import React from 'react';
import SplitWords from './SplitWords';
import { cssVars } from './motion';

const PRINCIPLES: { before: string; em: string; after: string; accent: string }[] = [
  { before: 'Every document starts life as a ', em: 'draft', after: '.', accent: 'var(--lp-amber)' },
  { before: 'Nothing reaches Jira until ', em: 'someone approves it', after: '.', accent: 'var(--lp-green)' },
  { before: 'Edit an approved doc and it goes ', em: 'back to draft', after: '.', accent: 'var(--lp-blue)' },
  { before: 'Duplicates get ', em: 'appended', after: ', never filed twice.', accent: 'var(--lp-coral)' },
  { before: 'Every query is ', em: 'scoped to your account', after: '.', accent: 'var(--lp-violet)' },
];

export default function Principles() {
  return (
    <section id="principles" aria-labelledby="lp-principles-title" className="lp-section z-[7] bg-lp-paper py-24 md:py-36">
      <div className="lp-container grid gap-14 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-[calc(var(--nav-h)_+_64px)]">
            <h2 id="lp-principles-title" className="lp-display text-[clamp(2.75rem,6vw,5.5rem)] leading-[0.98] tracking-[-0.025em]">
              <SplitWords parts={['AI drafts.', { text: 'People decide.', className: 'italic text-lp-green' }]} />
            </h2>
            <p data-reveal className="mt-6 max-w-[26rem] text-[17px] leading-relaxed text-lp-ink2">
              ApeAI does the reading and the first draft. Your team keeps the judgement, and the final say.
            </p>
            <div
              data-reveal
              className="lp-stamp mt-12 inline-flex flex-col items-center rounded-[10px] border-2 border-lp-coral px-5 py-2.5 text-lp-coral"
              aria-hidden
            >
              <span className="lp-mono text-[12px] font-semibold uppercase tracking-[0.24em]">Approved</span>
              <span className="lp-display text-[22px] italic leading-tight">by a human</span>
            </div>
          </div>
        </div>

        <ol className="border-t border-lp-ink lg:col-span-7">
          {PRINCIPLES.map((p, i) => (
            <li
              key={p.em}
              data-reveal
              style={cssVars({ '--d': `${i * 60}ms` })}
              className="flex gap-5 border-b border-lp-line py-7 md:gap-8 md:py-9"
            >
              <span className="lp-mono pt-[0.6em] text-[12px] text-lp-ink3">0{i + 1}</span>
              <p className="lp-display text-[clamp(1.75rem,3vw,2.6rem)] leading-[1.14] tracking-[-0.01em]">
                {p.before}
                <span className="lp-em" style={cssVars({ '--accent': p.accent })}>
                  {p.em}
                </span>
                {p.after}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
