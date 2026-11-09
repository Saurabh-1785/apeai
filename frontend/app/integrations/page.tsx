'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { Integration } from '@/types/models';
import { useToast } from '@/components/ui/ToastProvider';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/components/AuthContext';
import { LoadingState, PageHeader } from '@/components/app/primitives';
import { AlertTriangle, Check } from 'lucide-react';
import { JiraConnectForm } from '@/components/JiraConnectForm';

function TrackerMark({ letter, className }: { letter: string; className: string }) {
  return (
    <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-[22px] leading-none ${className}`}>
      {letter}
    </span>
  );
}

export default function IntegrationsPage() {
  const { toast } = useToast();
  const { session, loading: authLoading } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadIntegrations = async () => {
    try {
      setError(null);
      const res = await api.getIntegrations();
      setIntegrations(res.integrations || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch active integration pipelines');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (session) loadIntegrations();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session]);

  const handleDisconnect = async (id: string, name: string) => {
    if (!confirm(`Disconnect ${name}? Published tickets stay in Jira, but you won't be able to publish new ones until you reconnect.`)) return;
    try {
      await api.deleteIntegration(id);
      toast('Jira Cloud disconnected', 'success');
      loadIntegrations();
    } catch (err: any) {
      toast(err.message || 'Failed to disconnect integration', 'error');
    }
  };

  if (loading) return <LoadingState label="Loading integrations…" />;

  const activeJira = integrations.find((i) => i.type === 'jira');

  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-[760px] space-y-10 pb-8">
        <PageHeader
          eyebrow="workspace · integrations"
          title="Integrations"
          description="Connect the tracker your engineers already use. Approved documents publish there as tickets."
        />

        {error && (
          <div role="alert" className="alert alert-error">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>{error}</p>
          </div>
        )}

        <section aria-labelledby="jira-title" className="card overflow-hidden">
          <div className="flex items-start gap-4 border-b border-line p-6 md:px-8">
            <TrackerMark letter="J" className="bg-info/10 text-info" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 id="jira-title" className="text-[17px] font-semibold">
                  Jira Cloud
                </h2>
                {activeJira && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card px-2 py-0.5 text-[12px] font-semibold text-ink-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden /> Connected
                  </span>
                )}
              </div>
              <p className="mt-1 text-[14px] text-ink-2">
                Connect once. After that, every approved document has a Publish to Jira button on its review page.
              </p>
            </div>
          </div>

          {activeJira ? (
            <div className="space-y-6 p-6 md:px-8">
              <dl className="divide-y divide-line rounded-xl border border-line text-[14px]">
                <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:justify-between">
                  <dt className="text-ink-3">Site</dt>
                  <dd className="break-all font-mono text-[13px]">{activeJira.api_url}</dd>
                </div>
                <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:justify-between">
                  <dt className="text-ink-3">Project</dt>
                  <dd className="text-[14px]">
                    {activeJira.config?.project_name && <span className="mr-2">{activeJira.config.project_name}</span>}
                    <span className="font-mono text-[13px] text-ink-2">{activeJira.project_id}</span>
                  </dd>
                </div>
                {activeJira.config?.account_name && (
                  <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:justify-between">
                    <dt className="text-ink-3">Creates issues as</dt>
                    <dd>{activeJira.config.account_name}</dd>
                  </div>
                )}
                {activeJira.config?.dry_run && (
                  <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:justify-between">
                    <dt className="text-ink-3">Mode</dt>
                    <dd>Dry run (no real issues are created)</dd>
                  </div>
                )}
              </dl>
              <button type="button" onClick={() => handleDisconnect(activeJira.id, activeJira.name)} className="btn btn-danger">
                Disconnect Jira
              </button>
            </div>
          ) : (
            <div className="p-6 md:px-8">
              <JiraConnectForm
                onConnected={(integration) => {
                  toast(
                    integration.config?.dry_run
                      ? "Jira connected in dry-run mode. Publishing won't create real issues."
                      : `Jira connected. ApeAI can create issues in ${integration.config?.project_name || integration.project_id}.`,
                    'success',
                  );
                  loadIntegrations();
                }}
              />
            </div>
          )}
        </section>

        <section aria-labelledby="next-title" className="space-y-3">
          <h2 id="next-title" className="text-[13px] font-semibold text-ink-2">
            Coming next
          </h2>
          <ul className="card divide-y divide-line">
            {[
              { name: 'GitHub Issues', letter: 'G', note: 'Publish as issues in a repository.' },
              { name: 'Linear', letter: 'L', note: 'Publish as Linear issues in a team.' },
            ].map((t) => (
              <li key={t.name} className="flex items-center gap-4 p-5 md:px-8">
                <TrackerMark letter={t.letter} className="bg-stone text-ink-3" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-ink-2">{t.name}</p>
                  <p className="text-[13px] text-ink-3">{t.note}</p>
                </div>
                <span className="text-[12.5px] font-medium text-ink-3">Not available yet</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="flex items-center gap-2 text-[13px] text-ink-3">
          <Check className="h-3.5 w-3.5 text-success" aria-hidden />
          Each approved document publishes once per integration, so re-clicking never files duplicates.
        </p>
      </div>
    </ProtectedRoute>
  );
}
