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
import {
  ArrowLeft,
  Check,
  FileText,
  Sparkles,
  Loader2,
  AlertTriangle,
  ExternalLink,
  GitMerge,
} from 'lucide-react';

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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-10 h-10 text-slate-900 dark:text-zinc-300 animate-spin" />
        <p className="text-sm font-semibold text-slate-500">Loading pipeline stepper...</p>
      </div>
    );
  }

  if (error || !cluster) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft className="w-4 h-4" /> Back to Inbox
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl space-y-2">
          <h3 className="font-bold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" /> Pipeline Error
          </h3>
          <p className="text-sm">{error || 'Cluster not found'}</p>
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
      title: 'Feedback Clustered',
      description: 'Signals grouped together via vector database similarity search.',
      status: 'complete',
      detail: `${cluster.feedback_count ?? 0} feedback item(s)` +
        (typeof cluster.confidence_score === 'number' && cluster.confidence_score > 0
          ? ` · confidence ${Math.round(cluster.confidence_score)}%`
          : ''),
    },
    {
      title: 'AI Cluster Summary',
      description: 'Summarize signals into clean semantic definitions.',
      status: hasSummary ? 'complete' : 'active',
      actionLabel: 'Generate Summary',
      action: runStep('summary', 'AI summary', runSummary),
      loading: running === 'summary',
    },
    {
      title: 'Business Requirements (BRD)',
      description: 'Generate a Business Requirements Document.',
      status: hasBRD ? 'complete' : !hasSummary ? 'pending' : 'active',
      actionLabel: 'Generate BRD',
      action: runStep('brd', 'BRD', runBRD),
      loading: running === 'brd',
    },
    {
      title: 'Product Requirements (PRD)',
      description: 'Draft technical and scope specifications.',
      status: hasPRD ? 'complete' : !hasBRD ? 'pending' : 'active',
      actionLabel: 'Generate PRD',
      action: runStep('prd', 'PRD', () => runPRD(documents)),
      loading: running === 'prd',
    },
    {
      title: 'Agile User Stories',
      description: 'Generate formatted stories with explicit acceptance criteria.',
      status: hasStories ? 'complete' : !hasPRD ? 'pending' : 'active',
      detail: hasStories ? `${stories.length} story(ies)` : undefined,
      actionLabel: 'Draft User Stories',
      action: runStep('stories', 'User stories', () => runStories(documents)),
      loading: running === 'stories',
    },
    {
      title: 'Technical Task Breakdown',
      description: 'Subdivide every story into concrete engineering tasks.',
      status: hasTasks ? 'complete' : !hasStories ? 'pending' : 'active',
      detail: hasStories ? `${stories.length - missingTasks.length} of ${stories.length} stories broken down` : undefined,
      actionLabel: missingTasks.length < stories.length ? `Break Down Remaining (${missingTasks.length})` : 'Break Down Tasks',
      action: runStep('tasks', 'Task breakdown', () => runTasks(documents)),
      loading: running === 'tasks',
    },
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Inbox
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{cluster.title}</h2>
              <StatusBadge status={cluster.status} />
            </div>
            <p className="text-sm text-slate-500 mt-1">Workflow Stepper: Trigger and monitor document pipelines.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={triggerGenerateAll}
              disabled={busy || allDone || isArchived}
              className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-slate-100 disabled:to-slate-100 disabled:text-slate-400 text-white font-bold px-4 py-2.5 rounded-lg shadow-sm transition-all disabled:opacity-50 border border-transparent disabled:border-slate-200"
            >
              {running === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {running === 'all' ? taskProgress ? `Tasks: ${taskProgress}` : 'Generating...' : allDone ? 'All Generated' : 'Generate All'}
            </button>
            <Link
              href={`/review/${clusterId}`}
              className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2.5 rounded-lg shadow-sm transition-colors"
            >
              <FileText className="w-4 h-4" />
              Review & Edit Drafts
            </Link>
          </div>
        </div>
      </div>

      {isArchived && (
        <div className="bg-zinc-50 border border-zinc-200 text-zinc-600 p-4 rounded-xl text-sm font-semibold">
          This cluster was merged into an existing ticket and is archived.
        </div>
      )}

      {!isArchived && duplicates.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-amber-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Possible duplicates: {duplicates.length} published ticket(s) look similar
          </h3>
          <ul className="space-y-2">
            {duplicates.map((dup) => (
              <li key={dup.ticket_link_id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white border border-amber-100 rounded-lg p-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 truncate">{dup.document_title || dup.external_id}</p>
                  <p className="text-[11px] text-slate-500">
                    {dup.external_id} · {Math.round(dup.similarity * 100)}% similar
                    {dup.external_status ? ` · ${dup.external_status}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {dup.external_url && (
                    <a href={dup.external_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900">
                      Open <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <button
                    onClick={() => handleAppend(dup)}
                    disabled={appendingTo !== null || busy}
                    className="inline-flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {appendingTo === dup.document_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitMerge className="w-3.5 h-3.5" />}
                    Append to this ticket
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">Pipeline Stepper</h3>

        <div className="relative border-l border-slate-200 ml-4 pl-8 space-y-8 py-2">
          {steps.map((step, idx) => {
            const isComplete = step.status === 'complete';
            const isActive = step.status === 'active' && !isArchived;
            const isPending = step.status === 'pending';
            const spinning = step.loading || (running === 'all' && isActive);

            return (
              <div key={step.title} className="relative">
                <div className={`absolute -left-[41px] top-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${
                  isComplete ? 'bg-slate-900 text-white border-slate-900' :
                  isActive ? 'bg-white text-slate-900 border-slate-900 shadow-sm shadow-slate-950/5' :
                  'bg-white text-slate-400 border-slate-200'
                }`}>
                  {isComplete ? <Check className="w-3.5 h-3.5" /> : <span>{idx + 1}</span>}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className={`font-bold ${
                      isComplete ? 'text-slate-800' : isActive ? 'text-slate-900 font-extrabold' : 'text-slate-400'
                    }`}>{step.title}</h4>
                    <p className="text-xs text-slate-500 max-w-xl leading-relaxed">{step.description}</p>
                    {step.detail && <p className="text-[11px] font-semibold text-slate-400">{step.detail}</p>}
                  </div>

                  <div className="flex-shrink-0">
                    {isActive && step.action && (
                      <button
                        onClick={step.action}
                        disabled={busy}
                        className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition-colors border border-slate-900 disabled:opacity-50"
                      >
                        {spinning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {step.loading && taskProgress ? taskProgress : step.actionLabel}
                      </button>
                    )}
                    {isComplete && (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                        <Check className="w-3.5 h-3.5" /> Complete
                      </span>
                    )}
                    {isPending && (
                      <span className="text-slate-400 text-xs font-medium">Waiting on previous steps...</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
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
