import React from 'react';
import { Check, Layers } from 'lucide-react';
import { cssVars } from './motion';

/* ── 01 Listen ───────────────────────────────────────────── */
const SOURCES = [
  { src: 'App Store', stars: '★★☆☆☆', text: 'Can’t get my numbers out of the dashboard.', color: 'var(--lp-blue)', sx: '-70px', sy: '-90px', sr: '-8deg' },
  { src: 'Reddit · r/SaaS', text: 'Anyone found a way to export this?', color: 'var(--lp-coral)', sx: '90px', sy: '-40px', sr: '6deg' },
  { src: 'Intercom', text: 'Is there a CSV option for a date range?', color: 'var(--lp-green)', sx: '-100px', sy: '24px', sr: '5deg' },
  { src: 'Zoom · 00:42:13', text: '…honestly, we just screenshot the charts.', color: 'var(--lp-violet)', sx: '80px', sy: '56px', sr: '-6deg' },
  { src: 'Sentry', text: 'TypeError in export.ts:42', mono: true, color: 'var(--lp-amber)', sx: '-50px', sy: '100px', sr: '9deg' },
];

function ListenVisual() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2.5 px-5 sm:px-8">
      {SOURCES.map((s, i) => (
        <div
          key={s.src}
          className="lp-src w-full max-w-[420px] rounded-[14px] border border-lp-line bg-lp-paper px-4 py-2.5 sm:py-3"
          style={cssVars({ '--sx': s.sx, '--sy': s.sy, '--sr': s.sr, '--d': `${i * 80}ms` })}
        >
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
            <span className="lp-mono text-[10.5px] uppercase tracking-[0.08em] text-lp-ink3">{s.src}</span>
            {s.stars && <span className="ml-auto text-[11px] tracking-[0.12em] text-lp-amber">{s.stars}</span>}
          </div>
          <p className={`mt-1 leading-snug ${s.mono ? 'lp-mono text-[12.5px]' : 'text-[14.5px]'}`}>{s.text}</p>
        </div>
      ))}
      <p className="lp-src-note lp-mono mt-2 text-[11.5px] text-lp-ink3">→ 5 rows, one shape</p>
    </div>
  );
}

/* ── 02 Group ────────────────────────────────────────────── */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GROUPS = [
  { cx: 132, cy: 132, color: 'var(--lp-coral)', label: 'CSV export', score: 86, ly: 58 },
  { cx: 352, cy: 124, color: 'var(--lp-blue)', label: 'iOS login loop', score: 74, ly: 50 },
  { cx: 242, cy: 262, color: 'var(--lp-green)', label: 'Dark mode', score: 61, ly: 344 },
];

const DOTS = (() => {
  const rand = seeded(7);
  const out: { x0: number; y0: number; x1: number; y1: number; color: string }[] = [];
  GROUPS.forEach((g) => {
    for (let k = 0; k < 9; k++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 40;
      out.push({
        x0: Math.round(30 + rand() * 420),
        y0: Math.round(40 + rand() * 280),
        x1: Math.round(g.cx + Math.cos(a) * r),
        y1: Math.round(g.cy + Math.sin(a) * r),
        color: g.color,
      });
    }
  });
  // interleave so the stagger doesn't move one cluster at a time
  return out.map((_, i) => out[(i % 3) * 9 + Math.floor(i / 3)]);
})();

function GroupVisual() {
  return (
    <div className="flex h-full items-center justify-center px-4">
      <svg viewBox="0 0 480 370" className="h-full max-h-[440px] w-full" aria-hidden>
        {GROUPS.map((g) => (
          <circle
            key={g.label}
            className="lp-hull"
            cx={g.cx}
            cy={g.cy}
            r={60}
            fill={g.color}
            fillOpacity={0.07}
            stroke={g.color}
            strokeWidth={1.5}
            strokeDasharray="4 6"
          />
        ))}
        {DOTS.map((d, i) => (
          <g
            key={i}
            className="lp-dot"
            style={cssVars({ '--x0': `${d.x0}px`, '--y0': `${d.y0}px`, '--x1': `${d.x1}px`, '--y1': `${d.y1}px`, '--d': `${i * 22}ms` })}
          >
            <circle r={5.5} fill="var(--lp-line-strong)" />
            <circle className="lp-dot-color" r={5.5} fill={d.color} />
          </g>
        ))}
        {GROUPS.map((g) => (
          <text key={g.label} className="lp-hull-label" x={g.cx} y={g.ly} textAnchor="middle" fontSize={16} fill="var(--lp-ink)">
            <tspan fontWeight={600}>{g.label}</tspan>
            <tspan dx={7} className="lp-mono" fontSize={14} fill="var(--lp-ink-3)">
              {g.score}
            </tspan>
          </text>
        ))}
      </svg>
    </div>
  );
}

/* ── 03 Draft ────────────────────────────────────────────── */
// Sheets start stacked, then cascade down-right in order (spacing lives in landing.css).
const SHEETS = [
  { tag: 'BRD', title: 'Business requirements', done: true },
  { tag: 'PRD', title: 'Product requirements', done: true },
  { tag: 'Stories', title: '4 user stories', done: true },
  { tag: 'Tasks', title: '11 tasks', done: false },
];
const BAR_WIDTHS = [0.92, 0.78, 0.86, 0.58, 0.72, 0.46];

function DraftVisual() {
  return (
    <div className="lp-draft absolute inset-0 flex items-center justify-center">
      {SHEETS.map((s, i) => (
        <div
          key={s.tag}
          className="lp-sheet-doc absolute aspect-[3/4] w-[52%] max-w-[210px] rounded-[12px] border border-lp-line bg-lp-paper p-3.5 shadow-[0_22px_34px_-24px_rgba(20,20,18,0.45)] sm:w-[36%] sm:p-4"
          style={{ zIndex: i, ...cssVars({ '--i': i - 1.5, '--d': `${i * 90}ms` }) }}
        >
          <div className="flex items-center justify-between">
            <span className="lp-mono text-[10px] uppercase tracking-[0.1em] text-lp-ink3 sm:text-[10.5px]">{s.tag}</span>
            {s.done ? (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-lp-green text-white">
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
            ) : (
              <span className="h-2 w-2 rounded-full bg-lp-amber" />
            )}
          </div>
          <p className="lp-display mt-1.5 truncate text-[15px] leading-[1.15] sm:text-[17px]">{s.title}</p>
          <div className="mt-3 space-y-2 sm:mt-4">
            {BAR_WIDTHS.map((w, j) => (
              <div
                key={j}
                className="lp-bar h-[5px] rounded-full bg-lp-line"
                style={{ width: `${w * 100}%`, ...cssVars({ '--d': `${350 + i * 110 + j * 55}ms` }) }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── 04 Review ───────────────────────────────────────────── */
function ReviewVisual() {
  return (
    <div className="flex h-full items-center justify-center px-5">
      <div className="w-full max-w-[420px] rounded-[16px] border border-lp-line bg-lp-paper p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <span className="lp-mono text-[10.5px] uppercase tracking-[0.08em] text-lp-ink3">PRD · CSV export</span>
          <span className="relative h-6 w-[96px]">
            <span className="lp-rv-draft absolute inset-0 flex items-center justify-end gap-1.5 text-[12.5px] font-semibold text-lp-ink2">
              <span className="h-1.5 w-1.5 rounded-full bg-lp-amber" /> Draft
            </span>
            <span className="lp-rv-approved absolute inset-0 flex items-center justify-end gap-1 text-[12.5px] font-semibold text-lp-green">
              <Check className="h-3.5 w-3.5" strokeWidth={3} /> Approved
            </span>
          </span>
        </div>
        <p className="lp-display mt-3 text-[26px] leading-[1.1]">Analytics CSV export</p>
        <dl className="mt-4 space-y-2.5 text-[13.5px] leading-snug sm:text-[14px]">
          <div className="flex gap-3">
            <dt className="w-[84px] shrink-0 text-lp-ink3">Goal</dt>
            <dd>Export dashboard data for any date range.</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-[84px] shrink-0 text-lp-ink3">Acceptance</dt>
            <dd>RFC 4180 CSV, under 10s for 100k rows.</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-[84px] shrink-0 text-lp-ink3">Out of scope</dt>
            <dd>Scheduled exports.</dd>
          </div>
        </dl>
        <div className="mt-6 flex items-center gap-2">
          <span className="lp-btn lp-btn-sm lp-btn-line">Reject</span>
          <span className="lp-btn lp-btn-sm lp-btn-line">Edit</span>
          <span className="relative ml-auto">
            <span className="lp-btn lp-btn-sm lp-btn-ink relative min-w-[118px] overflow-hidden">
              <span className="lp-rv-draft">Approve</span>
              <span className="lp-rv-approved absolute inset-0 flex items-center justify-center gap-1.5 bg-lp-green text-white">
                <Check className="h-3.5 w-3.5" strokeWidth={3} /> Approved
              </span>
            </span>
            <span className="lp-rv-cursor absolute left-[52%] top-[58%] flex flex-col items-start">
              <svg width="16" height="20" viewBox="0 0 18 22" fill="none">
                <path d="M1.5 1.5v16.2l4.6-4.4 3.1 6.9 2.9-1.3-3.1-6.8h6.4L1.5 1.5Z" fill="var(--lp-coral)" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              <span className="lp-cursor-tag" style={{ background: 'var(--lp-coral)' }}>You</span>
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── 05 Ship ─────────────────────────────────────────────── */
function ShipVisual() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3.5 px-5">
      <p className="lp-ship lp-mono flex items-center gap-1.5 text-[11.5px] text-lp-green" style={cssVars({ '--d': '0ms' })}>
        <Check className="h-3.5 w-3.5" strokeWidth={3} /> Published to Jira Cloud
      </p>
      <div className="lp-ship w-full max-w-[420px] rounded-[16px] border border-lp-line bg-lp-paper p-5" style={cssVars({ '--d': '120ms' })}>
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-lp-violet text-white">
            <Layers className="h-3 w-3" strokeWidth={2.5} />
          </span>
          <span className="lp-mono text-[12px] text-lp-ink2">APE-82</span>
          <span className="text-[12px] text-lp-ink3">Epic</span>
          <span className="ml-auto text-[12px] text-lp-ink3">To do</span>
        </div>
        <p className="lp-display mt-3 text-[26px] leading-[1.1]">Export analytics to CSV</p>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-lp-line pt-3">
          {[
            ['Stories', '4'],
            ['Tasks', '11'],
            ['Confidence', '86'],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-[12px] text-lp-ink3">{k}</p>
              <p className="lp-tnum mt-0.5 text-[15px] font-semibold">{v}</p>
            </div>
          ))}
        </div>
      </div>
      <div
        className="lp-ship w-full max-w-[420px] rounded-[16px] border border-dashed border-lp-linestrong p-4"
        style={cssVars({ '--d': '560ms' })}
      >
        <p className="text-[12px] font-semibold text-lp-ink3">Similar ticket already published</p>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <p className="text-[14px]">
            <span className="lp-mono text-[12.5px] text-lp-ink2">APE-61</span> Export reports to Excel
          </p>
          <span className="lp-mono text-[12px] text-lp-ink3">0.91</span>
        </div>
        <span className="lp-btn lp-btn-sm lp-btn-line mt-3 w-full">Add this feedback to APE-61</span>
      </div>
    </div>
  );
}

export const STEP_VISUALS = [ListenVisual, GroupVisual, DraftVisual, ReviewVisual, ShipVisual];
