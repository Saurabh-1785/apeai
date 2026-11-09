'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { useAuth } from '@/components/AuthContext';
import { Code, List, RefreshCw, AlertTriangle } from 'lucide-react';
import { LoadingState, SectionHeader } from '@/components/app/primitives';

export function RecentFeedbacks({ refreshKey = 0 }: { refreshKey?: number }) {
  const { session, loading: authLoading } = useAuth();
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'pretty' | 'json'>('pretty');

  const fetchFeedbacks = async () => {
    setLoading(true);
    try {
      setError(null);
      const res = await api.getRecentFeedbacks(10);
      setFeedbacks(res.feedbacks || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch recent feedbacks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && session) {
      fetchFeedbacks();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [authLoading, session, refreshKey]);

  return (
    <section aria-labelledby="recent-title" className="space-y-5 border-t border-line pt-12">
      <SectionHeader
        title={<span id="recent-title">Recent feedback</span>}
        description="The latest ten items saved to your workspace."
        actions={
          <>
            <div className="seg" role="group" aria-label="View as">
              <button type="button" aria-pressed={viewMode === 'pretty'} onClick={() => setViewMode('pretty')} className="seg-btn">
                <List className="h-3.5 w-3.5" aria-hidden /> List
              </button>
              <button type="button" aria-pressed={viewMode === 'json'} onClick={() => setViewMode('json')} className="seg-btn">
                <Code className="h-3.5 w-3.5" aria-hidden /> JSON
              </button>
            </div>
            <button type="button" onClick={fetchFeedbacks} aria-label="Refresh recent feedback" title="Refresh" className="btn btn-secondary btn-icon">
              <RefreshCw className="h-4 w-4" aria-hidden />
            </button>
          </>
        }
      />

      {error && (
        <div role="alert" className="alert alert-error">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="card">
          <LoadingState label="Loading recent feedback…" className="py-14" />
        </div>
      ) : feedbacks.length === 0 ? (
        <div className="card px-6 py-12 text-center text-[14.5px] text-ink-2">
          Nothing here yet. Feedback you add shows up here first.
        </div>
      ) : viewMode === 'pretty' ? (
        <ul className="card divide-y divide-line">
          {feedbacks.map((fb) => (
            <li key={fb.id} className="grid gap-2 p-4 sm:grid-cols-[112px_minmax(0,1fr)_auto] sm:gap-6 sm:p-5">
              <span className="font-mono text-[12px] leading-6 text-ink-3">{fb.source}</span>
              <p className="text-[14.5px] leading-relaxed">{fb.content}</p>
              <p className="text-[12.5px] leading-6 text-ink-3 sm:text-right">
                {fb.author}
                <span className="mx-1.5" aria-hidden>
                  ·
                </span>
                <time dateTime={fb.created_at}>
                  {new Date(fb.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </time>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <pre className="code-block max-h-[520px]">{JSON.stringify(feedbacks, null, 2)}</pre>
      )}
    </section>
  );
}
