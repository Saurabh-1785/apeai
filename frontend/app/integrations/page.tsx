'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { Integration } from '@/types/models';
import { useToast } from '@/components/ui/ToastProvider';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/components/AuthContext';
import { LoadingState, PageHeader } from '@/components/app/primitives';
import { Loader2, AlertTriangle, Check } from 'lucide-react';

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

  // Form states
  const [submitting, setSubmitting] = useState<string | null>(null);

  // Jira Form
  const [jiraUrl, setJiraUrl] = useState('');
  const [jiraEmail, setJiraEmail] = useState('');
  const [jiraToken, setJiraToken] = useState('');
  const [jiraProject, setJiraProject] = useState('');
  const [jiraDryRun, setJiraDryRun] = useState(false);

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

  const handleConnect = async (type: 'jira') => {
    setSubmitting(type);
    try {
      const payload: Partial<Integration> = {
        type,
        name: `Active ${type.toUpperCase()} pipeline`,
        is_active: true,
      };

      if (type === 'jira') {
        if (!jiraUrl || !jiraEmail || !jiraToken || !jiraProject) {
          throw new Error('All fields are required to bind Jira Cloud.');
        }
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(jiraUrl.trim());
        } catch {
          throw new Error('Jira URL must be a full URL, e.g. https://your-team.atlassian.net');
        }
        if (parsedUrl.protocol !== 'https:') throw new Error('Jira URL must use https://');
        payload.api_url = parsedUrl.origin;
        payload.project_id = jiraProject.trim().toUpperCase();
        payload.api_key = jiraToken.trim();
        payload.config = { email: jiraEmail.trim(), dry_run: jiraDryRun };
      }

      await api.createIntegration(payload);
      toast('Jira Cloud connected', 'success');

      // Clear forms
      setJiraUrl('');
      setJiraEmail('');
      setJiraToken('');
      setJiraProject('');
      setJiraDryRun(false);

      loadIntegrations();
    } catch (err: any) {
      toast(err.message || `Failed to link ${type}`, 'error');
    } finally {
      setSubmitting(null);
    }
  };

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
              <p className="mt-1 text-[14px] text-ink-2">Publish approved stories and tasks as Jira issues.</p>
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
                  <dt className="text-ink-3">Project key</dt>
                  <dd className="font-mono text-[13px]">{activeJira.project_id}</dd>
                </div>
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
            <form
              className="space-y-5 p-6 md:px-8"
              onSubmit={(e) => {
                e.preventDefault();
                handleConnect('jira');
              }}
            >
              <div>
                <label htmlFor="jira-url" className="field-label">
                  Site URL
                </label>
                <input
                  id="jira-url"
                  type="url"
                  required
                  value={jiraUrl}
                  onChange={(e) => setJiraUrl(e.target.value)}
                  placeholder="https://your-team.atlassian.net"
                  className="field"
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="jira-email" className="field-label">
                    Account email
                  </label>
                  <input
                    id="jira-email"
                    type="email"
                    required
                    value={jiraEmail}
                    onChange={(e) => setJiraEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="field"
                  />
                </div>
                <div>
                  <label htmlFor="jira-project" className="field-label">
                    Project key
                  </label>
                  <input
                    id="jira-project"
                    type="text"
                    required
                    value={jiraProject}
                    onChange={(e) => setJiraProject(e.target.value)}
                    placeholder="APE"
                    className="field font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="jira-token" className="field-label">
                  API token
                </label>
                <input
                  id="jira-token"
                  type="password"
                  required
                  autoComplete="off"
                  value={jiraToken}
                  onChange={(e) => setJiraToken(e.target.value)}
                  aria-describedby="jira-token-hint"
                  className="field"
                />
                <p id="jira-token-hint" className="field-hint">
                  Create one in your Atlassian account under Security → API tokens. It&apos;s kept on the server and masked
                  whenever it&apos;s shown.
                </p>
              </div>

              <label htmlFor="jira-dry-run" className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 transition-colors hover:bg-stone/40">
                <input
                  type="checkbox"
                  id="jira-dry-run"
                  checked={jiraDryRun}
                  onChange={(e) => setJiraDryRun(e.target.checked)}
                  className="checkbox mt-0.5"
                />
                <span>
                  <span className="block text-[14px] font-semibold">Dry run</span>
                  <span className="block text-[13px] text-ink-2">Test the connection without creating real issues.</span>
                </span>
              </label>

              <button type="submit" disabled={submitting !== null} className="btn btn-primary btn-lg w-full sm:w-auto">
                {submitting === 'jira' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {submitting === 'jira' ? 'Connecting…' : 'Connect Jira'}
              </button>
            </form>
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
