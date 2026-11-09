import React from 'react';

interface StatusBadgeProps {
  status: string | null | undefined;
}

const STYLES: Record<string, string> = {
  // document statuses
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  review: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  published: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  // cluster statuses
  new: 'bg-slate-100 text-slate-700 border-slate-200',
  clustered: 'bg-sky-50 text-sky-700 border-sky-200',
  brd_generated: 'bg-violet-50 text-violet-700 border-violet-200',
  prd_generated: 'bg-violet-50 text-violet-700 border-violet-200',
  stories_generated: 'bg-blue-50 text-blue-700 border-blue-200',
  tasks_generated: 'bg-blue-50 text-blue-700 border-blue-200',
  tickets_created: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  archived: 'bg-zinc-100 text-zinc-500 border-zinc-200',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const normalized = String(status ?? 'unknown').toLowerCase();
  const style = STYLES[normalized] ?? 'bg-slate-100 text-slate-700 border-slate-200';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style}`}>
      {normalized.replace(/_/g, ' ').toUpperCase()}
    </span>
  );
};
