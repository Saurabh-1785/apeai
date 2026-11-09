'use client';

import React, { useState } from 'react';
import { api } from '@/services/api';
import { useToast } from '@/components/ui/ToastProvider';
import { Loader2, Check } from 'lucide-react';

// ─── Connector Source Definitions ─────────────────────────────

interface ConnectorSource {
  id: string;
  label: string;
  detail: string;
  count: number;
  dot: string;
}

const CONNECTOR_SOURCES: ConnectorSource[] = [
  { id: 'appstore', label: 'App Store', detail: 'App Store & Google Play reviews', count: 5, dot: 'bg-info' },
  { id: 'reddit', label: 'Reddit', detail: 'Posts and comments', count: 3, dot: 'bg-brand' },
  { id: 'intercom', label: 'Intercom', detail: 'Intercom & Zendesk tickets', count: 4, dot: 'bg-success' },
  { id: 'transcript', label: 'Transcripts', detail: 'Fireflies & Zoom calls', count: 2, dot: 'bg-ai' },
  { id: 'sentry', label: 'Sentry', detail: 'Sentry & PostHog alerts', count: 3, dot: 'bg-warning' },
];

// ─── Connector Simulator Component ────────────────────────────

interface ConnectorSimulatorProps {
  onIngestionComplete?: () => void;
}

export function ConnectorSimulator({ onIngestionComplete }: ConnectorSimulatorProps) {
  const { toast } = useToast();
  const [loadingSource, setLoadingSource] = useState<string | null>(null);
  const [completedSources, setCompletedSources] = useState<Set<string>>(new Set());

  const handleSimulate = async (source: ConnectorSource) => {
    if (loadingSource) return;

    setLoadingSource(source.id);
    try {
      const result = await api.simulateIngestion(source.id);
      setCompletedSources(prev => { const arr = Array.from(prev); arr.push(source.id); return new Set(arr); });
      toast(result.message || `${result.saved} ${source.label} items ingested`, 'success');
      onIngestionComplete?.();
    } catch (err: any) {
      toast(`Couldn't send ${source.label} samples: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setLoadingSource(null);
    }
  };

  const handleSimulateAll = async () => {
    if (loadingSource) return;
    setLoadingSource('all');

    try {
      let totalSaved = 0;
      for (const source of CONNECTOR_SOURCES) {
        try {
          const result = await api.simulateIngestion(source.id);
          totalSaved += result.saved || 0;
          setCompletedSources(prev => { const arr = Array.from(prev); arr.push(source.id); return new Set(arr); });
        } catch {
          // Continue with other sources
        }
      }
      toast(`Sample data sent: ${totalSaved} items added to your inbox`, 'success');
      onIngestionComplete?.();
    } catch (err: any) {
      toast(`Simulation failed: ${err.message}`, 'error');
    } finally {
      setLoadingSource(null);
    }
  };

  return (
    <section aria-labelledby="simulator-title" className="card p-5">
      <h2 id="simulator-title" className="text-[15px] font-semibold">
        Try it with sample data
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
        Send realistic test payloads. They land in your inbox exactly like real feedback.
      </p>

      <ul className="mt-4 divide-y divide-line border-y border-line">
        {CONNECTOR_SOURCES.map((source) => {
          const isLoading = loadingSource === source.id || loadingSource === 'all';
          const isCompleted = completedSources.has(source.id);
          return (
            <li key={source.id} className="flex items-center gap-3 py-2.5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${source.dot}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium leading-tight">{source.label}</p>
                <p className="truncate text-[12px] text-ink-3">{source.detail}</p>
              </div>
              <button
                type="button"
                onClick={() => handleSimulate(source)}
                disabled={loadingSource !== null}
                aria-label={`Send ${source.count} ${source.label} samples`}
                className="btn btn-ghost btn-sm min-w-[72px]"
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : isCompleted ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-success" aria-hidden /> Sent
                  </>
                ) : (
                  `Send ${source.count}`
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <button type="button" onClick={handleSimulateAll} disabled={loadingSource !== null} className="btn btn-secondary mt-4 w-full">
        {loadingSource === 'all' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {loadingSource === 'all' ? 'Sending…' : 'Send all five'}
      </button>

      {completedSources.size > 0 && (
        <p className="mt-3 flex items-center justify-between text-[12.5px] text-ink-3">
          <span>
            {completedSources.size} of {CONNECTOR_SOURCES.length} sent
          </span>
          <button type="button" onClick={() => setCompletedSources(new Set())} className="font-semibold transition-colors hover:text-ink">
            Reset
          </button>
        </p>
      )}
    </section>
  );
}
