'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/services/api';
import { Cluster } from '@/types/models';
import { useToast } from '@/components/ui/ToastProvider';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { RecentFeedbacks } from '@/components/RecentFeedbacks';
import { ConnectorSimulator } from '@/components/ConnectorSimulator';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/components/AuthContext';
import { LoadingState, PageHeader, SectionHeader } from '@/components/app/primitives';
import { ArrowRight, Loader2, AlertTriangle, RefreshCw, Play } from 'lucide-react';

const SOURCE_GROUPS = [
  { label: 'App stores', keys: ['appstore', 'google_play'], color: 'bg-info' },
  { label: 'Reddit', keys: ['reddit'], color: 'bg-brand' },
  { label: 'Support', keys: ['intercom', 'zendesk'], color: 'bg-success' },
  { label: 'Transcripts', keys: ['transcript'], color: 'bg-ai' },
  { label: 'Errors', keys: ['sentry', 'posthog'], color: 'bg-warning' },
  { label: 'Pasted', keys: ['manual'], color: 'bg-ink-3' },
  { label: 'CSV', keys: ['csv'], color: 'bg-ink-3' },
];

export default function FeedbackInboxPage() {
  const { toast } = useToast();
  const { session, loading: authLoading } = useAuth();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clusterTotal, setClusterTotal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [stats, setStats] = useState<{ total: number; by_source: Record<string, number> }>({ total: 0, by_source: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action states
  const [clustering, setClustering] = useState(false);

  const fetchData = async () => {
    try {
      setError(null);
      const [clusterResult, statsResult] = await Promise.allSettled([
        api.getClusters({ limit: 100 }),
        api.getFeedbackStats()
      ]);

      if (clusterResult.status === 'fulfilled') {
        setClusters(clusterResult.value.clusters || []);
        setClusterTotal(clusterResult.value.total ?? (clusterResult.value.clusters || []).length);
      } else {
        console.error('Failed to fetch clusters:', clusterResult.reason);
        setError(`Failed to fetch clusters: ${clusterResult.reason?.message || 'Unknown error'}`);
      }

      setRefreshKey((k) => k + 1);

      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value || { total: 0, by_source: {} });
      } else {
        console.error('Failed to fetch stats:', statsResult.reason);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch data once auth session is resolved
    if (!authLoading && session) {
      fetchData();
    } else if (!authLoading && !session) {
      // Not authenticated — ProtectedRoute will handle redirect
      setLoading(false);
    }
  }, [authLoading, session]);

  const handleRunClustering = async () => {
    setClustering(true);
    try {
      const res = await api.triggerClustering();
      const msg = res.message || `Clustering complete! ${res.new_clusters || 0} new clusters, ${res.linked || 0} linked.`;
      toast(msg, 'success');
      fetchData();
    } catch (err: any) {
      toast(err.message || 'Failed to trigger clustering', 'error');
    } finally {
      setClustering(false);
    }
  };

  if (loading) return <LoadingState label="Loading your inbox…" />;

  const sourceCounts = SOURCE_GROUPS.map((g) => ({
    ...g,
    count: g.keys.reduce((sum, k) => sum + (stats.by_source[k] || 0), 0),
  }));
  const maxSource = Math.max(1, ...sourceCounts.map((s) => s.count));

  const runButton = (
    <button type="button" onClick={handleRunClustering} disabled={clustering} className="btn btn-primary">
      {clustering ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-3.5 w-3.5 fill-current" aria-hidden />}
      {clustering ? 'Clustering…' : 'Run clustering'}
    </button>
  );

  return (
    <ProtectedRoute>
      <div className="space-y-12">
        <PageHeader
          eyebrow="workspace · inbox"
          title="Inbox"
          description="Everything people said, grouped into the problems they keep running into."
          actions={
            <>
              <button type="button" onClick={fetchData} aria-label="Refresh inbox" title="Refresh" className="btn btn-secondary btn-icon">
                <RefreshCw className="h-4 w-4" aria-hidden />
              </button>
              {runButton}
            </>
          }
        />

        {/* Summary */}
        <section aria-label="Summary" className="card grid overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <div className="grid grid-cols-2 divide-x divide-line border-b border-line md:border-b-0 md:border-r">
            {[
              { label: 'Feedback items', value: stats.total },
              { label: 'Clusters', value: clusterTotal },
            ].map((s) => (
              <div key={s.label} className="flex flex-col justify-between gap-6 p-6">
                <p className="text-[13px] font-semibold text-ink-2">{s.label}</p>
                <p className="font-display text-[56px] leading-none tabular-nums">{s.value.toLocaleString()}</p>
              </div>
            ))}
          </div>
          <div className="p-6">
            <p className="text-[13px] font-semibold text-ink-2">By source</p>
            <dl className="mt-4 grid gap-2.5">
              {sourceCounts.map((s) => (
                <div key={s.label} className="grid grid-cols-[96px_minmax(0,1fr)_40px] items-center gap-3 text-[13.5px]">
                  <dt className="text-ink-2">{s.label}</dt>
                  <div className="h-1.5 overflow-hidden rounded-full bg-stone" aria-hidden>
                    <div
                      className={`h-full origin-left rounded-full ${s.color} transition-transform duration-300`}
                      style={{ transform: `scaleX(${s.count / maxSource})` }}
                    />
                  </div>
                  <dd className="text-right font-mono text-[12.5px] tabular-nums text-ink">{s.count}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {error && (
          <div role="alert" className="alert alert-error">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>{error}</p>
          </div>
        )}

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
          <section aria-labelledby="clusters-title" className="space-y-5">
            <SectionHeader
              title={<span id="clusters-title">Clusters</span>}
              count={clusterTotal}
              description="Each one is a problem several people described."
            />

            {clusters.length === 0 ? (
              <div className="card flex flex-col items-center px-6 py-14 text-center">
                <p className="font-display text-[28px] leading-tight">No clusters yet.</p>
                <p className="mt-2 max-w-sm text-[14.5px] leading-relaxed text-ink-2">
                  Add some feedback, then run clustering to group it by meaning.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                  <Link href="/upload" className="btn btn-secondary">
                    Add feedback
                  </Link>
                  {runButton}
                </div>
              </div>
            ) : (
              <ul className="card app-enter-stagger divide-y divide-line overflow-hidden">
                {clusters.map((cluster) => {
                  const archived = cluster.status === 'archived';
                  const confidence =
                    typeof cluster.confidence_score === 'number' && cluster.confidence_score > 0
                      ? Math.round(cluster.confidence_score)
                      : null;
                  return (
                    <li
                      key={cluster.id}
                      className={`flex flex-col gap-4 p-5 transition-colors duration-150 hover:bg-stone/40 sm:flex-row sm:items-center sm:justify-between sm:gap-8 ${
                        archived ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h3 className="text-[16px] font-semibold leading-snug">{cluster.title}</h3>
                          <StatusBadge status={cluster.status} />
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-ink-2">
                          {cluster.summary || 'No summary yet. Open the pipeline to generate one.'}
                        </p>
                        <p className="mt-2 text-[12.5px] text-ink-3">
                          {cluster.feedback_count ?? 0} item{(cluster.feedback_count ?? 0) === 1 ? '' : 's'}
                          {confidence !== null && <> · confidence {confidence}</>} · created{' '}
                          {new Date(cluster.created_at).toLocaleDateString([], { dateStyle: 'medium' })}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Link href={`/pipeline/${cluster.id}`} className="btn btn-secondary btn-sm">
                          Pipeline
                        </Link>
                        <Link href={`/review/${cluster.id}`} className="btn btn-primary btn-sm">
                          Review <ArrowRight className="arrow h-3.5 w-3.5" aria-hidden />
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <aside className="lg:pt-[68px]">
            <div className="lg:sticky lg:top-24">
              <ConnectorSimulator onIngestionComplete={fetchData} />
            </div>
          </aside>
        </div>

        <RecentFeedbacks refreshKey={refreshKey} />
      </div>
    </ProtectedRoute>
  );
}
