'use client';

import React, { useEffect, useRef, useState } from 'react';
import SplitWords from './SplitWords';
import { STEP_VISUALS } from './StepVisuals';
import { navHeight, useScrollVar } from './motion';

const STEPS = [
  {
    kicker: 'Listen',
    title: 'Pull in everything people say',
    body: 'App Store and Google Play reviews, Reddit threads, Intercom and Zendesk tickets, Fireflies and Zoom transcripts, Sentry and PostHog alerts, a CSV, or a quick paste. Each one becomes the same tidy row.',
    detail: 'source · author · content · timestamp · repeats skipped by external id',
  },
  {
    kicker: 'Group',
    title: 'Find what belongs together',
    body: 'Items are compared by meaning, not keywords, so people who describe one problem in different words land in the same cluster. Each cluster gets a summary and a confidence score.',
    detail: 'gemini-embedding-001 · 768 dimensions · pgvector cosine similarity · 0–100 confidence',
  },
  {
    kicker: 'Draft',
    title: 'Write the documents nobody has time for',
    body: 'A BRD, then a PRD, then user stories, then tasks for every story. Each response is checked before it is saved, and running a step twice returns what is already there.',
    detail: 'BRD → PRD → stories → tasks · gemini-2.5-flash-lite in JSON mode',
  },
  {
    kicker: 'Review',
    title: 'Nothing moves without you',
    body: 'Every document starts as a draft. Edit it, approve it, or reject it. If someone edits an approved document later, it goes back to draft.',
    detail: 'draft → review → approved · the reviewer is always the signed-in user',
  },
  {
    kicker: 'Ship',
    title: 'Publish once, and only once',
    body: 'Approved work goes to Jira Cloud. If a similar ticket is already published, ApeAI suggests adding the new feedback to it instead of filing another. GitHub and Linear are next.',
    detail: 'one ticket per document and integration · duplicates appended, not re-filed',
  },
];

function Panel({ index, active }: { index: number; active: boolean }) {
  const Visual = STEP_VISUALS[index];
  return (
    <div className={`relative h-full w-full ${active ? 'is-active' : ''}`}>
      <Visual />
    </div>
  );
}

export default function HowItWorks() {
  const [active, setActive] = useState(0);
  const [seen, setSeen] = useState(0);
  const stepsRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<(HTMLElement | null)[]>([]);

  // The step crossing the middle of the viewport is the active one.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const i = Number((entry.target as HTMLElement).dataset.index);
          setActive(i);
          setSeen((s) => Math.max(s, i));
        });
      },
      { rootMargin: '-45% 0px -45% 0px' }
    );
    stepRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  // Progress rail beside the steps.
  useScrollVar(
    stepsRef,
    (el, vh) => {
      const r = el.getBoundingClientRect();
      const nav = navHeight(el);
      return (nav + (vh - nav) / 2 - r.top) / Math.max(1, r.height);
    },
    { name: '--rail', ease: 0.15, reducedValue: 1 }
  );

  return (
    <section id="how" aria-labelledby="lp-how-title" className="lp-section z-[5] border-t border-lp-line bg-lp-paper py-20 md:py-28">
      <div className="lp-container">
        <div className="max-w-[50rem]">
          <h2 id="lp-how-title" className="lp-display text-[clamp(2.6rem,6vw,5.25rem)] leading-[1] tracking-[-0.025em]">
            <SplitWords parts={['From noise to a ticket', { text: 'in five steps.', className: 'italic text-lp-coral' }]} />
          </h2>
          <p data-reveal className="mt-6 max-w-[34rem] text-[18px] leading-relaxed text-lp-ink2">
            Run each step on its own or all of them at once. None of them publish anything until you say so.
          </p>
        </div>

        <div className="mt-14 md:mt-20 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 xl:gap-24">
          <div ref={stepsRef} className="relative">
            <div aria-hidden className="absolute bottom-0 left-0 top-0 hidden w-px bg-lp-line lg:block">
              <div className="lp-rail-fill h-full w-full bg-lp-ink" />
            </div>
            <ol>
              {STEPS.map((s, i) => (
                <li
                  key={s.kicker}
                  ref={(el) => {
                    stepRefs.current[i] = el;
                  }}
                  data-index={i}
                  data-active={active === i}
                  className="lp-step flex flex-col justify-center border-t border-lp-line py-12 first:border-t-0 lg:min-h-[78vh] lg:border-t-0 lg:py-0 lg:pl-12"
                >
                  <p className="lp-mono text-[12px] text-lp-ink3">
                    0{i + 1} · {s.kicker}
                  </p>
                  <h3 className="lp-display mt-3 text-[34px] leading-[1.05] md:text-[44px]">{s.title}</h3>
                  <p className="mt-4 max-w-[31rem] text-[17px] leading-relaxed text-lp-ink2">{s.body}</p>
                  <p className="lp-mono mt-6 max-w-[31rem] border-t border-lp-line pt-4 text-[12px] leading-relaxed text-lp-ink3">{s.detail}</p>
                  <div aria-hidden className="mt-8 h-[500px] overflow-hidden rounded-[22px] border border-lp-line bg-lp-card lg:hidden">
                    <Panel index={i} active={seen >= i} />
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div aria-hidden className="hidden lg:block">
            <div className="sticky top-[calc(var(--nav-h)_+_48px)] h-[min(600px,calc(100vh_-_var(--nav-h)_-_96px))]">
              <div className="relative h-full overflow-hidden rounded-[24px] border border-lp-line bg-lp-card">
                <p className="lp-mono absolute left-6 top-5 z-10 text-[11.5px] text-lp-ink3">
                  0{active + 1} · {STEPS[active].kicker.toLowerCase()}
                </p>
                <div className="absolute inset-0 pt-8">
                  {STEPS.map((s, i) => (
                    <div key={s.kicker} className="lp-stage" data-active={active === i}>
                      <Panel index={i} active={active === i} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
