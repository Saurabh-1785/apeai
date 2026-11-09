import React from 'react';
import SplitWords from './SplitWords';
import { cssVars } from './motion';

const ink = { stroke: 'var(--lp-ink)', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', pathLength: 1 } as const;

/** Three overlapping speech bubbles, drawn in on scroll. */
function Bubbles() {
  return (
    <svg data-reveal="fade" className="lp-draw w-full" viewBox="0 0 380 300" fill="none" aria-hidden>
      <path {...ink} fill="var(--lp-stone)" style={cssVars({ '--d': '200ms' })} d="M44,24 H216 Q240,24 240,48 V120 Q240,144 216,144 H72 L46,170 L54,144 H44 Q20,144 20,120 V48 Q20,24 44,24 Z" />
      <path {...ink} style={cssVars({ '--d': '500ms' })} d="M48,62 H190 M48,84 H212 M48,106 H150" />
      <path {...ink} fill="var(--lp-stone)" style={cssVars({ '--d': '600ms' })} d="M192,118 H338 Q360,118 360,140 V200 Q360,222 338,222 H326 L334,248 L304,222 H192 Q170,222 170,200 V140 Q170,118 192,118 Z" />
      <path {...ink} style={cssVars({ '--d': '900ms' })} d="M196,152 H332 M196,174 H312 M196,196 H262" />
      <path {...ink} fill="var(--lp-stone)" style={cssVars({ '--d': '1000ms' })} d="M60,196 H150 Q170,196 170,216 V246 Q170,266 150,266 H84 L64,288 L70,266 H60 Q40,266 40,246 V216 Q40,196 60,196 Z" />
      <path {...ink} stroke="var(--lp-coral)" strokeWidth={2} style={cssVars({ '--d': '1300ms' })} d="M70,231 H90 M80,221 V241 M104,225 L112,220 V243" />
    </svg>
  );
}

/** Loose marks on the left become a neat stack of tickets on the right. */
function ScatterToStack() {
  const marks = [
    [30, 60, 58, 48], [80, 120, 104, 134], [44, 150, 70, 160], [130, 40, 150, 62], [160, 140, 190, 128],
    [200, 80, 226, 92], [110, 90, 128, 84], [60, 100, 72, 118], [180, 30, 206, 38], [220, 150, 236, 170], [140, 170, 166, 176],
  ];
  const dots = [[100, 50], [190, 104], [40, 122], [150, 110], [212, 58], [86, 166]];
  return (
    <svg data-reveal="fade" className="lp-draw mx-auto w-full max-w-[760px]" viewBox="0 0 760 200" fill="none" aria-hidden>
      {marks.map(([x1, y1, x2, y2], i) => (
        <line key={i} {...ink} stroke="var(--lp-ink-3)" x1={x1} y1={y1} x2={x2} y2={y2} style={cssVars({ '--d': `${i * 40}ms` })} />
      ))}
      {dots.map(([cx, cy], i) => (
        <circle key={i} {...ink} stroke="var(--lp-ink-3)" cx={cx} cy={cy} r={3} style={cssVars({ '--d': `${200 + i * 40}ms` })} />
      ))}
      <path {...ink} style={cssVars({ '--d': '500ms' })} d="M266,104 C330,40 410,168 478,104" />
      <path {...ink} style={cssVars({ '--d': '1100ms' })} d="M464,96 L480,103 L468,115" />
      {[40, 84, 128].map((y, i) => (
        <g key={y}>
          <rect {...ink} fill="var(--lp-card)" x={540} y={y} width={190} height={36} rx={8} style={cssVars({ '--d': `${900 + i * 160}ms` })} />
          <rect {...ink} x={554} y={y + 13} width={10} height={10} rx={2} stroke={['var(--lp-coral)', 'var(--lp-blue)', 'var(--lp-green)'][i]} style={cssVars({ '--d': `${1100 + i * 160}ms` })} />
          <path {...ink} stroke="var(--lp-ink-3)" d={`M578,${y + 18} H${700 - i * 22}`} style={cssVars({ '--d': `${1150 + i * 160}ms` })} />
        </g>
      ))}
    </svg>
  );
}

export default function Introduction() {
  return (
    <>
      <section aria-labelledby="lp-intro-title" className="lp-section lp-stick lp-fill z-[3] flex items-center overflow-hidden bg-lp-stone py-24">
        <div className="lp-container relative">
          <h2
            id="lp-intro-title"
            className="lp-display max-w-[11ch] text-[clamp(3.25rem,9vw,8.25rem)] leading-[0.98] tracking-[-0.03em]"
          >
            <SplitWords parts={['Made for teams who', { text: 'actually listen.', className: 'italic text-lp-blue' }]} step={80} />
          </h2>
          <div className="pointer-events-none absolute right-[3%] top-1/2 hidden w-[300px] -translate-y-1/2 md:block lg:w-[380px]">
            <Bubbles />
          </div>
        </div>
      </section>

      <section className="lp-section z-[4] bg-lp-paper pb-16 pt-24 md:pb-24 md:pt-40">
        <div className="lp-container">
          <div className="mx-auto max-w-[56rem] space-y-10 md:space-y-14">
            <p data-reveal className="lp-display text-[clamp(2rem,4.2vw,3.5rem)] leading-[1.12] tracking-[-0.015em]">
              Most feedback tools are very good at collecting it.{' '}
              <span className="italic text-lp-ink3">We care about what happens next.</span>
            </p>
            <p
              data-reveal
              style={cssVars({ '--d': '120ms' })}
              className="lp-display text-[clamp(2rem,4.2vw,3.5rem)] leading-[1.12] tracking-[-0.015em]"
            >
              ApeAI reads every review, thread, ticket and transcript, finds the patterns hiding in them, and hands your team work
              it can start on Monday:{' '}
              <span className="lp-em" style={cssVars({ '--accent': 'var(--lp-coral)' })}>
                written, scoped, and waiting for a yes
              </span>
              .
            </p>
          </div>
          <div className="mt-16 md:mt-24">
            <ScatterToStack />
          </div>
        </div>
      </section>
    </>
  );
}
