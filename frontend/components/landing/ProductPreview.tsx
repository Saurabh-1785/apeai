'use client';

import React, { useRef } from 'react';
import { Check } from 'lucide-react';
import { cssVars, navHeight, useScrollVar } from './motion';

const CLUSTERS = [
  { name: 'Export analytics to CSV', score: 86, color: 'var(--lp-coral)', active: true },
  { name: 'Login loop on iOS', score: 74, color: 'var(--lp-blue)' },
  { name: 'Dark mode for reports', score: 61, color: 'var(--lp-green)' },
  { name: 'Invoices hard to find', score: 48, color: 'var(--lp-amber)' },
  { name: 'Slow sync on Android', score: 39, color: 'var(--lp-violet)' },
];

const QUOTES = [
  { source: 'App Store', text: 'Great app, but I can’t get my numbers out. Need a CSV.' },
  { source: 'Intercom', text: 'Is there a way to export the dashboard for a date range?' },
  { source: 'Reddit', text: 'I screenshot charts into Excel every Monday. Please fix.' },
];

const METRICS = [
  { label: 'Volume', value: 0.78 },
  { label: 'Cohesion', value: 0.92 },
  { label: 'Depth', value: 0.84 },
];

const DOCS = [
  { name: 'BRD', status: 'Approved', state: 'done' },
  { name: 'PRD', status: 'Approved', state: 'done' },
  { name: 'User stories', status: '4 · in review', state: 'review' },
  { name: 'Tasks', status: '11 · draft', state: 'draft' },
] as const;

const NOTES = [
  { n: '01', title: 'One cluster per real problem', body: 'Matched by meaning, so “CSV export” and “get my numbers out” end up together.' },
  { n: '02', title: 'A score you can argue with', body: 'Confidence comes from how many people said it, how alike they sound, and how much detail they gave.' },
  { n: '03', title: 'Drafts that wait for a yes', body: 'Every document is a draft until a person on your team approves it.' },
];

function StateMark({ state }: { state: 'done' | 'review' | 'draft' }) {
  if (state === 'done')
    return (
      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-lp-green text-white">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    );
  if (state === 'review') return <span className="mx-[5px] h-2 w-2 rounded-full bg-lp-amber" />;
  return <span className="mx-[4px] h-2.5 w-2.5 rounded-full border-[1.5px] border-lp-linestrong" />;
}

export default function ProductPreview() {
  const wrapRef = useRef<HTMLDivElement>(null);

  useScrollVar(
    wrapRef,
    (el, vh) => {
      const top = el.getBoundingClientRect().top;
      return (vh - top) / Math.max(1, vh - navHeight(el) - 48);
    },
    { name: '--in', ease: 0.1, reducedValue: 1 }
  );

  return (
    <section aria-label="Product preview" className="lp-section lp-preview z-[2] pb-24 pt-4 md:pb-32 md:pt-8">
      <div className="lp-container">
        <div ref={wrapRef} className="lp-window-wrap">
          <div
            role="img"
            aria-label="Preview of the ApeAI cluster screen: a cluster called Export analytics to CSV with a confidence of 86, the feedback behind it, and its generated documents waiting for approval."
            className="lp-window overflow-hidden rounded-[18px] bg-lp-card text-lp-ink"
          >
            <div aria-hidden className="flex h-11 items-center gap-4 border-b border-lp-line bg-lp-paper px-4">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-lp-linestrong" />
                <span className="h-2.5 w-2.5 rounded-full bg-lp-linestrong" />
                <span className="h-2.5 w-2.5 rounded-full bg-lp-linestrong" />
              </div>
              <p className="lp-mono flex-1 truncate text-center text-[12px] text-lp-ink3">apeai / clusters / export-analytics-to-csv</p>
              <span className="w-[42px]" />
            </div>

            <div aria-hidden className="grid text-left md:grid-cols-[minmax(0,1fr)_280px] lg:grid-cols-[230px_minmax(0,1fr)_300px]">
              <aside className="hidden border-r border-lp-line bg-lp-paper p-4 lg:block">
                <p className="px-2 text-[12px] font-semibold text-lp-ink3">Clusters</p>
                <ul className="mt-2 space-y-0.5">
                  {CLUSTERS.map((c) => (
                    <li
                      key={c.name}
                      className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[13.5px] ${
                        c.active ? 'bg-lp-card font-semibold shadow-[0_0_0_1px_var(--lp-line)]' : 'text-lp-ink2'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.color }} />
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className="lp-mono lp-tnum text-[12px] font-normal text-lp-ink3">{c.score}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 px-2 text-[12px] text-lp-ink3">5 clusters from 212 items</p>
              </aside>

              <div className="p-6 md:p-8">
                <p className="text-[13px] text-lp-ink3">Cluster · 14 items · 4 sources</p>
                <h3 className="lp-display mt-2 text-[32px] leading-[1.05] md:text-[40px]">Export analytics to CSV</h3>
                <p className="mt-3 max-w-[34rem] text-[15px] leading-relaxed text-lp-ink2">
                  Managers want raw dashboard data in a spreadsheet for weekly reviews, with a date range so they can check a
                  specific period.
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4 border-y border-lp-line py-4">
                  <div className="flex items-baseline gap-1.5">
                    <span className="lp-display lp-tnum text-[44px] leading-none">86</span>
                    <span className="text-[13px] text-lp-ink3">/ 100 confidence</span>
                  </div>
                  <div className="grid flex-1 basis-full grid-cols-3 gap-4 sm:basis-0">
                    {METRICS.map((m) => (
                      <div key={m.label} className="min-w-[64px]">
                        <p className="text-[12px] text-lp-ink3">{m.label}</p>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-lp-stone">
                          <div className="h-full origin-left rounded-full bg-lp-ink" style={{ transform: `scaleX(${m.value})` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="mt-6 text-[12px] font-semibold text-lp-ink3">What people said</p>
                <ul className="mt-1 divide-y divide-lp-line">
                  {QUOTES.map((q) => (
                    <li key={q.source} className="flex gap-4 py-3">
                      <span className="lp-mono w-[78px] shrink-0 pt-[3px] text-[10.5px] uppercase tracking-[0.08em] text-lp-ink3">{q.source}</span>
                      <span className="text-[14.5px] leading-snug">“{q.text}”</span>
                    </li>
                  ))}
                </ul>
              </div>

              <aside className="border-t border-lp-line bg-lp-paper p-6 md:border-l md:border-t-0">
                <p className="text-[12px] font-semibold text-lp-ink3">Generated from this cluster</p>
                <ol className="mt-3 divide-y divide-lp-line border-y border-lp-line">
                  {DOCS.map((d) => (
                    <li key={d.name} className="flex items-center gap-3 py-3 text-[14px]">
                      <StateMark state={d.state} />
                      <span className="flex-1 font-medium">{d.name}</span>
                      <span className="text-[12.5px] text-lp-ink3">{d.status}</span>
                    </li>
                  ))}
                </ol>
                <div className="relative mt-6">
                  <span className="lp-btn lp-btn-ink w-full">Approve &amp; publish</span>
                  <span className="absolute -bottom-6 right-6 flex flex-col items-start">
                    <svg width="16" height="20" viewBox="0 0 18 22" fill="none">
                      <path d="M1.5 1.5v16.2l4.6-4.4 3.1 6.9 2.9-1.3-3.1-6.8h6.4L1.5 1.5Z" fill="var(--lp-coral)" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
                    </svg>
                    <span className="lp-cursor-tag" style={{ background: 'var(--lp-coral)' }}>You</span>
                  </span>
                </div>
                <p className="mt-10 text-[12.5px] leading-relaxed text-lp-ink3">
                  Publishes to Jira Cloud. Nothing is sent until someone approves it.
                </p>
              </aside>
            </div>
          </div>
        </div>

        <div className="mt-16 grid gap-10 text-lp-moon md:mt-24 md:grid-cols-3 md:gap-12">
          {NOTES.map((n, i) => (
            <div key={n.n} data-reveal style={cssVars({ '--d': `${i * 120}ms` })} className="border-t border-lp-nightline pt-5">
              <p className="lp-mono text-[12px] text-lp-moon2">{n.n}</p>
              <h3 className="lp-display mt-3 text-[28px] leading-[1.1] md:text-[30px]">{n.title}</h3>
              <p className="mt-3 text-[15.5px] leading-relaxed text-lp-moon2">{n.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
