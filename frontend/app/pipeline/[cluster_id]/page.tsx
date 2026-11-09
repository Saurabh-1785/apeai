'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/services/api';
import { Cluster, Document, DuplicateTicket } from '@/types/models';
import { useToast } from '@/components/ui/ToastProvider';
import { StatusBadge } from '@/components/ui/StatusBadge';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/components/AuthContext';
import { BackLink, LoadingState, PageHeader } from '@/components/app/primitives';
import { Check, Sparkles, Loader2, AlertTriangle, ExternalLink, GitMerge, Archive } from 'lucide-react';


interface Step {
  title: string;
  description: string;
  status: 'complete' | 'active' | 'pending';
  detail?: string;
  actionLabel?: string;
  action?: () => Promise<void>;
  loading?: boolean;
}

type PipelineData = { cluster: Cluster; documents: Document[] };

function storiesMissingTasks(documents: Document[]): Document[] {
  const covered = new Set(documents.filter((d) => d.type === 'task').map((d) => d.parent_id));
  return documents.filter((d) => d.type === 'story' && !covered.has(d.id));
}

function PipelineTracker() {
  const params = useParams();
  const { toast } = useToast();
  const { session, loading: authLoading } = useAuth();
  const clusterId = params.cluster_id as string;

  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Which step is running ('summary' | 'brd' | 'prd' | 'stories' | 'tasks' | 'all'), one at a time.
  const [running, setRunning] = useState<string | null>(null);
  const [taskProgress, setTaskProgress] = useState<string | null>(null);

  const [duplicates, setDuplicates] = useState<DuplicateTicket[]>([]);
  const [appendingTo, setAppendingTo] = useState<string | null>(null);

  const loadData = useCallback(async (): Promise<PipelineData> => {
    try {
      setError(null);
      const [current, docsRes] = await Promise.all([
        api.getCluster(clusterId),
        api.getDocuments(clusterId),
      ]);
      const docs = docsRes.documents || [];
      setCluster(current);
      setDocuments(docs);
      return { cluster: current, documents: docs };
    } catch (err: any) {
      setError(err.message || 'Failed to load pipeline tracker');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  useEffect(() => {
    if (authLoading || !session || !clusterId) return;
    loadData().catch(() => undefined);
    // Duplicate detection is advisory; failures are ignored.
    api
      .getClusterDuplicates(clusterId)
      .then((res) => setDuplicates(res.duplicates || []))
      .catch(() => setDuplicates([]));
  }, [clusterId, loadData, authLoading, session]);

  // ─── Step executors (each returns fresh data) ───────────────

  const runSummary = async () => {
    await api.triggerSummarization(clusterId);
    return loadData();
  };

  const runBRD = async () => {
    await api.triggerBRD(clusterId);
    return loadData();
  };

  const runPRD = async (docs: Document[]) => {
    const brd = docs.find((d) => d.type === 'brd');
    if (!brd) throw new Error('Generate the BRD first');
    await api.triggerPRD(clusterId, brd.id);
    return loadData();
  };

  const runStories = async (docs: Document[]) => {
    const prd = docs.find((d) => d.type === 'prd');
    if (!prd) throw new Error('Generate the PRD first');
    await api.triggerStories(clusterId, prd.id);
    return loadData();
  };

  /** Generates tasks for every story that does not have them yet. */
  const runTasks = async (docs: Document[]) => {
    const pending = storiesMissingTasks(docs);
    if (pending.length === 0 && !docs.some((d) => d.type === 'story')) {
      throw new Error('Generate user stories first');
    }
    const failures: string[] = [];
    for (let i = 0; i < pending.length; i++) {
      setTaskProgress(`Story ${i + 1} of ${pending.length}`);
      try {
        await api.triggerTasks(pending[i].id, clusterId);
      } catch (err: any) {
        failures.push(`${pending[i].title || pending[i].id}: ${err.message}`);
      }
    }
    setTaskProgress(null);
    const fresh = await loadData();
    if (failures.length > 0) {
      throw new Error(`Task breakdown failed for ${failures.length} story(ies). ${failures[0]}`);
    }
    return fresh;
  };

  const runStep = (key: string, label: string, fn: () => Promise<unknown>) => async () => {
    if (running) return;
    setRunning(key);
    try {
      await fn();
      toast(`${label} complete`, 'success');
    } catch (err: any) {
      toast(err.message || `${label} failed`, 'error');
    } finally {
      setRunning(null);
      setTaskProgress(null);
    }
  };

  const triggerGenerateAll = runStep('all', 'Full pipeline', async () => {
    let data: PipelineData = { cluster: cluster!, documents };

    if (!data.cluster.summary) {
      toast('Generating AI summary...', 'info');
      data = await runSummary();
    }
    if (!data.documents.some((d) => d.type === 'brd')) {
      toast('Drafting Business Requirements (BRD)...', 'info');
      data = await runBRD();
    }
    if (!data.documents.some((d) => d.type === 'prd')) {
      toast('Drafting Product Requirements (PRD)...', 'info');
      data = await runPRD(data.documents);
    }
    if (!data.documents.some((d) => d.type === 'story')) {
      toast('Drafting user stories...', 'info');
      data = await runStories(data.documents);
    }
    if (storiesMissingTasks(data.documents).length > 0) {
      toast('Breaking down technical tasks...', 'info');
      await runTasks(data.documents);
    }
  });

  const handleAppend = async (dup: DuplicateTicket) => {
    if (
      !confirm(
        `Move this cluster's feedback into "${dup.document_title || dup.external_id}" and archive this cluster?`,
      )
    ) {
      return;
    }
    setAppendingTo(dup.document_id);
    try {
      const res = await api.appendClusterToTicket(clusterId, dup.document_id);
      toast(res.message || 'Feedback appended to existing ticket', 'success');
      await loadData();
      setDuplicates([]);
    } catch (err: any) {
      toast(err.message || 'Failed to append to existing ticket', 'error');
    } finally {
      setAppendingTo(null);
    }
  };

  // ─── Render ─────────────────────────────────────────────────

  if (loading) return <LoadingState label="Loading pipeline…" />;

  if (error || !cluster) {
    return (
      <div className="space-y-6">
        <BackLink href="/dashboard">Inbox</BackLink>
        <div role="alert" className="alert alert-error">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Couldn&apos;t load this pipeline</p>
            <p>{error || 'Cluster not found'}</p>
          </div>
        </div>
      </div>
    );
  }

  const isArchived = cluster.status === 'archived';
  const stories = documents.filter((d) => d.type === 'story');
  const missingTasks = storiesMissingTasks(documents);
  const hasSummary = !!cluster.summary;
  const hasBRD = documents.some((d) => d.type === 'brd');
  const hasPRD = documents.some((d) => d.type === 'prd');
  const hasStories = stories.length > 0;
  const hasTasks = hasStories && missingTasks.length === 0;
  const allDone = hasSummary && hasBRD && hasPRD && hasStories && hasTasks;
  const busy = running !== null;

  const steps: Step[] = [
    {
      title: 'Feedback clustered',
      description: 'Similar feedback grouped together by meaning.',
      status: 'complete',
      detail: `${cluster.feedback_count ?? 0} feedback item(s)` +
        (typeof cluster.confidence_score === 'number' && cluster.confidence_score > 0
          ? ` · confidence ${Math.round(cluster.confidence_score)}`
          : ''),
    },
    {
      title: 'Summary',
      description: 'A short, plain description of the problem this cluster represents.',
      status: hasSummary ? 'complete' : 'active',
      actionLabel: 'Write summary',
      action: runStep('summary', 'AI summary', runSummary),
      loading: running === 'summary',
    },
    {
      title: 'Business requirements (BRD)',
      description: 'Why this matters: the problem, impact, goals and success metrics.',
      status: hasBRD ? 'complete' : !hasSummary ? 'pending' : 'active',
      actionLabel: 'Draft BRD',
      action: runStep('brd', 'BRD', runBRD),
      loading: running === 'brd',
    },
    {
      title: 'Product requirements (PRD)',
      description: 'What to build: flows, requirements, constraints and milestones.',
      status: hasPRD ? 'complete' : !hasBRD ? 'pending' : 'active',
      actionLabel: 'Draft PRD',
      action: runStep('prd', 'PRD', () => runPRD(documents)),
      loading: running === 'prd',
    },
    {
      title: 'User stories',
      description: 'Stories with explicit acceptance criteria.',
      status: hasStories ? 'complete' : !hasPRD ? 'pending' : 'active',
      detail: hasStories ? `${stories.length} story(ies)` : undefined,
      actionLabel: 'Draft stories',
      action: runStep('stories', 'User stories', () => runStories(documents)),
      loading: running === 'stories',
    },
    {
      title: 'Task breakdown',
      description: 'Frontend, backend and testing tasks for every story.',
      status: hasTasks ? 'complete' : !hasStories ? 'pending' : 'active',
      detail: hasStories ? `${stories.length - missingTasks.length} of ${stories.length} stories broken down` : undefined,
      actionLabel: missingTasks.length < stories.length ? `Break down remaining (${missingTasks.length})` : 'Break down tasks',
      action: runStep('tasks', 'Task breakdown', () => runTasks(documents)),
      loading: running === 'tasks',
    },
  ];

  const completedCount = steps.filter((s) => s.status === 'complete').length;

  return (
    <div className="space-y-10">
      <PageHeader
        back={<BackLink href="/dashboard">Inbox</BackLink>}
        eyebrow="cluster · pipeline"
        title={cluster.title}
        meta={<StatusBadge status={cluster.status} />}
        description="Run each step on its own, or generate everything at once. Nothing is published from here."
        actions={
          <>
            <button type="button" onClick={triggerGenerateAll} disabled={busy || allDone || isArchived} className="btn btn-primary">
              {running === 'all' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : allDone ? <Check className="h-4 w-4" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
              {running === 'all' ? (taskProgress ? `Tasks: ${taskProgress}` : 'Generating…') : allDone ? 'All generated' : 'Generate all'}
            </button>
            <Link href={`/review/${clusterId}`} className="btn btn-secondary">
              Review drafts
            </Link>
          </>
        }
      />

      {isArchived && (
        <div role="status" className="alert alert-info">
          <Archive className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>This cluster was merged into an existing ticket and is archived.</p>
        </div>
      )}

      {!isArchived && duplicates.length > 0 && (
        <section aria-labelledby="dups-title" className="card overflow-hidden">
          <div className="flex items-start gap-3 border-b border-line bg-warning/[0.07] px-6 py-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <div>
              <h2 id="dups-title" className="text-[15px] font-semibold">
                This might already be ticketed
              </h2>
              <p className="mt-0.5 text-[13.5px] text-ink-2">
                {duplicates.length === 1 ? 'A published ticket looks' : `${duplicates.length} published tickets look`} similar. You can
                add this feedback to {duplicates.length === 1 ? 'it' : 'one of them'} instead of filing a new ticket.
              </p>
            </div>
          </div>
          <ul className="divide-y divide-line">
            {duplicates.map((dup) => (
              <li key={dup.ticket_link_id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-[14.5px] font-semibold">{dup.document_title || dup.external_id}</p>
                  <p className="mt-0.5 text-[12.5px] text-ink-3">
                    <span className="font-mono">{dup.external_id}</span> · {Math.round(dup.similarity * 100)}% similar
                    {dup.external_status ? ` · ${dup.external_status}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {dup.external_url && (
                    <a href={dup.external_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                      Open <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  )}
                  <button type="button" onClick={() => handleAppend(dup)} disabled={appendingTo !== null || busy} className="btn btn-secondary btn-sm">
                    {appendingTo === dup.document_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <GitMerge className="h-3.5 w-3.5" aria-hidden />}
                    Add to this ticket
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="steps-title" className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line px-6 py-5 sm:flex-row sm:items-center sm:justify-between md:px-8">
          <h2 id="steps-title" className="section-title">
            Steps
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-ink-2">
              {completedCount} of {steps.length} done
            </span>
            <span className="h-1.5 w-28 overflow-hidden rounded-full bg-stone" aria-hidden>
              <span
                className="block h-full origin-left rounded-full bg-ink transition-transform duration-300"
                style={{ transform: `scaleX(${completedCount / steps.length})` }}
              />
            </span>
          </div>
        </div>

        <ol className="px-6 py-7 md:px-8">
          {steps.map((step, idx) => {
            const isComplete = step.status === 'complete';
            const isActive = step.status === 'active' && !isArchived;
            const isPending = step.status === 'pending';
            const spinning = step.loading || (running === 'all' && isActive);
            const isLast = idx === steps.length - 1;

            return (
              <li key={step.title} className={`relative grid grid-cols-[32px_minmax(0,1fr)] gap-5 ${isLast ? '' : 'pb-8'}`}>
                {!isLast && (
                  <span
                    aria-hidden
                    className={`absolute bottom-0 left-[15.5px] top-9 w-px ${isComplete ? 'bg-ink' : 'bg-line'}`}
                  />
                )}
                <span
                  className={`relative z-[1] flex h-8 w-8 items-center justify-center rounded-full border text-[12px] font-semibold transition-colors duration-200 ${
                    isComplete
                      ? 'border-ink bg-ink text-paper'
                      : isActive
                      ? 'border-ink bg-card text-ink'
                      : 'border-line bg-card text-ink-3'
                  }`}
                  aria-hidden
                >
                  {isComplete ? (
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  ) : spinning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <span className="font-mono">{idx + 1}</span>
                  )}
                </span>

                <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                  <div className="min-w-0 space-y-1">
                    <h3 className={`text-[16px] font-semibold leading-snug ${isPending ? 'text-ink-3' : 'text-ink'}`}>
                      {step.title}
                      <span className="sr-only">
                        {isComplete ? ' (complete)' : isActive ? ' (ready to run)' : ' (waiting on earlier steps)'}
                      </span>
                    </h3>
                    <p className={`max-w-xl text-[14px] leading-relaxed ${isPending ? 'text-ink-3' : 'text-ink-2'}`}>{step.description}</p>
                    {step.detail && <p className="font-mono text-[12px] text-ink-3">{step.detail}</p>}
                  </div>

                  <div className="shrink-0">
                    {isActive && step.action && (
                      <button type="button" onClick={step.action} disabled={busy} className="btn btn-primary btn-sm">
                        {spinning ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
                        {step.loading && taskProgress ? taskProgress : step.actionLabel}
                      </button>
                    )}
                    {isComplete && (
                      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-success">
                        <Check className="h-3.5 w-3.5" aria-hidden /> Done
                      </span>
                    )}
                    {isPending && <span className="text-[13px] text-ink-3">Waiting</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

export default function PipelineTrackerPage() {
  return (
    <ProtectedRoute>
      <PipelineTracker />
    </ProtectedRoute>
  );
}
