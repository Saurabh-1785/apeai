import React from 'react';

interface StatusBadgeProps {
  status: string | null | undefined;
}

type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'ai' | 'muted';

const STATUS: Record<string, { label: string; tone: Tone }> = {
  // document statuses
  draft: { label: 'Draft', tone: 'warning' },
  review: { label: 'In review', tone: 'info' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  published: { label: 'Published', tone: 'ai' },
  // cluster statuses
  new: { label: 'New', tone: 'neutral' },
  clustered: { label: 'Clustered', tone: 'info' },
  brd_generated: { label: 'BRD drafted', tone: 'warning' },
  prd_generated: { label: 'PRD drafted', tone: 'warning' },
  stories_generated: { label: 'Stories drafted', tone: 'warning' },
  tasks_generated: { label: 'Tasks drafted', tone: 'warning' },
  tickets_created: { label: 'Ticketed', tone: 'success' },
  archived: { label: 'Archived', tone: 'muted' },
};

const DOT: Record<Tone, string> = {
  neutral: 'bg-ink-3',
  info: 'bg-info',
  warning: 'bg-warning',
  success: 'bg-success',
  danger: 'bg-danger',
  ai: 'bg-ai',
  muted: 'bg-line-strong',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const key = String(status ?? 'unknown').toLowerCase();
  const fallback = key.replace(/_/g, ' ');
  const { label, tone } = STATUS[key] ?? { label: fallback.charAt(0).toUpperCase() + fallback.slice(1), tone: 'neutral' as Tone };

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-card px-2 py-0.5 text-[12px] font-semibold ${
        tone === 'muted' ? 'text-ink-3' : 'text-ink-2'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} aria-hidden />
      {label}
    </span>
  );
};
