'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '@/services/api';
import { Integration } from '@/types/models';
import { FormError } from '@/components/app/FormError';
import type { FriendlyError } from '@/lib/authErrors';

/**
 * Jira Cloud connection form. Used on the Integrations page and inline
 * on the Review page, so publishing never needs a detour.
 * The backend checks the token and project before saving (unless dry run).
 */
export function JiraConnectForm({
  onConnected,
  idPrefix = 'jira',
  submitLabel = 'Connect Jira',
  autoFocus = false,
}: {
  onConnected: (integration: Integration) => void;
  idPrefix?: string;
  submitLabel?: string;
  /** Focus the first field on mount (used inside the slide-over). */
  autoFocus?: boolean;
}) {
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [project, setProject] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);

  const id = (name: string) => `${idPrefix}-${name}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let origin: string;
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== 'https:') throw new Error();
      origin = parsed.origin;
    } catch {
      setError({ message: 'Enter your Jira site as a full address, for example https://your-team.atlassian.net.' });
      return;
    }

    setSubmitting(true);
    try {
      const integration = await api.createIntegration({
        type: 'jira',
        name: 'Jira Cloud',
        is_active: true,
        api_url: origin,
        project_id: project.trim().toUpperCase(),
        api_key: token.trim(),
        config: { email: email.trim(), dry_run: dryRun },
      });
      setToken('');
      onConnected(integration);
    } catch (err: any) {
      setError({ message: err?.message || "We couldn't connect to Jira. Check the details and try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <FormError error={error} className="" />

      <div>
        <label htmlFor={id('url')} className="field-label">
          Site URL
        </label>
        <input
          id={id('url')}
          type="url"
          required
          autoFocus={autoFocus}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-team.atlassian.net"
          className="field"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={id('email')} className="field-label">
            Account email
          </label>
          <input
            id={id('email')}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="field"
          />
        </div>
        <div>
          <label htmlFor={id('project')} className="field-label">
            Project key
          </label>
          <input
            id={id('project')}
            type="text"
            required
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="APE"
            aria-describedby={id('project-hint')}
            className="field font-mono uppercase"
          />
          <p id={id('project-hint')} className="field-hint">
            The prefix on issue numbers, like APE in APE-12.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor={id('token')} className="field-label">
          API token
        </label>
        <input
          id={id('token')}
          type="password"
          required
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          aria-describedby={id('token-hint')}
          className="field"
        />
        <p id={id('token-hint')} className="field-hint">
          Create one at id.atlassian.com → Security → API tokens. It&apos;s kept on the server and masked whenever
          it&apos;s shown.
        </p>
      </div>

      <label
        htmlFor={id('dry-run')}
        className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 transition-colors hover:bg-stone/40"
      >
        <input
          type="checkbox"
          id={id('dry-run')}
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
          className="checkbox mt-0.5"
        />
        <span>
          <span className="block text-[14px] font-semibold">Dry run</span>
          <span className="block text-[13px] text-ink-2">
            Try publishing without touching Jira. Nothing is checked or created, and tickets get a placeholder number.
          </span>
        </span>
      </label>

      <button type="submit" disabled={submitting} className="btn btn-primary btn-lg w-full sm:w-auto">
        {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {submitting ? (dryRun ? 'Saving…' : 'Checking with Jira…') : submitLabel}
      </button>
    </form>
  );
}
