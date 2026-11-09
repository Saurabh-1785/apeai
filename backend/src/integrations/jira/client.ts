/**
 * ApeAI — Jira Integration Client
 *
 * Talks to Jira Cloud (REST API v3, email + API token Basic auth):
 *   - normalizeJiraUrl:    only Atlassian Cloud sites are allowed (the backend
 *                          sends credentials to this URL, so it must not be an
 *                          arbitrary / internal host).
 *   - checkJiraConnection: verifies credentials and project access at connect time.
 *   - publishToJira:       creates one issue for an approved document.
 *
 * Every failure is turned into a sentence the user can act on.
 */

import { mapToJira, JiraPayload } from './mapper';
import { BadRequestError } from '../../utils/errors';

type Task = Record<string, unknown>;
type Integration = Record<string, unknown>;

type JiraCreds = { apiUrl: string; email: string; apiKey: string; projectKey: string };

/** Hosts Atlassian uses for Jira Cloud sites. */
const JIRA_CLOUD_HOST = /^[a-z0-9][a-z0-9-]*\.(atlassian\.net|jira\.com)$/i;

/** Returns the site origin (https://team.atlassian.net) or throws a user-facing error. */
export function normalizeJiraUrl(raw: unknown): string {
  let url: URL;
  try {
    url = new URL(String(raw ?? '').trim());
  } catch {
    throw new BadRequestError('Enter your Jira site as a full address, for example https://your-team.atlassian.net.');
  }
  if (url.protocol !== 'https:' || !JIRA_CLOUD_HOST.test(url.hostname) || url.port) {
    throw new BadRequestError(
      'ApeAI works with Jira Cloud sites only. Use the address you open Jira at, for example https://your-team.atlassian.net.',
    );
  }
  return url.origin;
}

function credsFrom(integration: Integration): JiraCreds {
  const config = (integration['config'] ?? {}) as Record<string, unknown>;
  const creds = {
    apiUrl: integration['api_url'] as string,
    email: config['email'] as string,
    apiKey: integration['api_key'] as string,
    projectKey: integration['project_id'] as string,
  };
  if (!creds.apiUrl || !creds.email || !creds.apiKey || !creds.projectKey) {
    throw new Error('The Jira connection is missing its site, email, API token or project key. Reconnect Jira on the Integrations page.');
  }
  return creds;
}

async function jiraFetch(creds: JiraCreds, path: string, init: RequestInit = {}): Promise<Response> {
  const base = normalizeJiraUrl(creds.apiUrl);
  const auth = Buffer.from(`${creds.email}:${creds.apiKey}`).toString('base64');
  try {
    return await fetch(`${base}${path}`, {
      ...init,
      redirect: 'error', // never follow a redirect off the Atlassian host with credentials attached
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
        ...(init.headers ?? {}),
      },
    });
  } catch (err) {
    console.error('Jira request failed:', err);
    throw new Error(`We couldn't reach ${new URL(base).hostname}. Check the site address, then try again.`);
  }
}

/** Pulls Jira's own error text out of a failed response, for logs and field-level messages. */
async function readJiraError(res: Response): Promise<{ messages: string[]; fields: Record<string, string> }> {
  const text = await res.text().catch(() => '');
  try {
    const body = JSON.parse(text) as { errorMessages?: string[]; errors?: Record<string, string> };
    return { messages: body.errorMessages ?? [], fields: body.errors ?? {} };
  } catch {
    return { messages: text ? [text.slice(0, 300)] : [], fields: {} };
  }
}

function explainStatus(status: number, creds: JiraCreds): string | null {
  if (status === 401) {
    return 'Jira didn’t accept that email and API token. Create a new token at id.atlassian.com → Security → API tokens, then reconnect Jira.';
  }
  if (status === 403) {
    return `Your Jira account doesn’t have permission to create issues in project ${creds.projectKey}. Ask a Jira admin for access, or connect a different project.`;
  }
  if (status === 404) {
    return `Jira couldn’t find project ${creds.projectKey}, or your account can’t see it. Check the project key (it’s the prefix on issue numbers, like ${creds.projectKey}-12).`;
  }
  if (status === 429) return 'Jira is limiting requests right now. Wait a minute, then try again.';
  if (status >= 500) return 'Jira is having trouble right now. Try again in a few minutes.';
  return null;
}

type JiraProject = { name: string; issueTypes: Array<{ name: string; subtask?: boolean }> };

async function getProject(creds: JiraCreds): Promise<JiraProject> {
  const res = await jiraFetch(creds, `/rest/api/3/project/${encodeURIComponent(creds.projectKey)}`);
  if (!res.ok) {
    const detail = await readJiraError(res);
    console.error(`Jira project lookup ${res.status}:`, detail);
    throw new Error(explainStatus(res.status, creds) ?? `Jira couldn’t load project ${creds.projectKey}.`);
  }
  return (await res.json()) as JiraProject;
}

/** Confirms the token works and the project is reachable. Used when connecting. */
export async function checkJiraConnection(input: {
  apiUrl: string;
  email: string;
  apiKey: string;
  projectKey: string;
}): Promise<{ accountName: string; projectName: string }> {
  const creds: JiraCreds = { ...input, apiUrl: normalizeJiraUrl(input.apiUrl) };

  const me = await jiraFetch(creds, '/rest/api/3/myself');
  if (!me.ok) {
    console.error(`Jira /myself ${me.status}:`, await readJiraError(me));
    throw new Error(explainStatus(me.status, creds) ?? 'Jira didn’t accept the connection. Check the details and try again.');
  }
  const account = (await me.json()) as { displayName?: string; emailAddress?: string };
  const project = await getProject(creds);

  return { accountName: account.displayName || account.emailAddress || input.email, projectName: project.name };
}

/** Picks the first preferred issue type the project actually has. */
function chooseIssueType(project: JiraProject, preferred: string[]): string {
  const available = project.issueTypes.filter((t) => !t.subtask).map((t) => t.name);
  for (const want of preferred) {
    const hit = available.find((n) => n.toLowerCase() === want.toLowerCase());
    if (hit) return hit;
  }
  if (available.length === 0) throw new Error(`Project ${project.name} has no issue types ApeAI can create.`);
  return available.find((n) => n.toLowerCase() !== 'epic') ?? available[0];
}

async function createIssue(creds: JiraCreds, payload: JiraPayload): Promise<Response> {
  return jiraFetch(creds, '/rest/api/3/issue', { method: 'POST', body: JSON.stringify(payload) });
}

export async function publishToJira(
  task: Task,
  integration: Integration,
): Promise<{ external_id: string; external_url: string; external_status: string }> {
  const config = (integration['config'] ?? {}) as Record<string, unknown>;
  const creds = credsFrom(integration);
  const base = normalizeJiraUrl(creds.apiUrl);
  const preferred = (task['issue_types'] as string[] | undefined) ?? ['Task'];

  // Dry run: build the real payload, create nothing.
  if (config['dry_run'] === true) {
    const payload = mapToJira(task, creds.projectKey, preferred[0]);
    const fakeKey = `${creds.projectKey}-DRYRUN`;
    console.info(`[Jira Dry Run] Would create a ${preferred[0]} in ${creds.projectKey}:`, JSON.stringify(payload.fields.summary));
    return { external_id: fakeKey, external_url: `${base}/browse/${fakeKey}`, external_status: 'Dry run' };
  }

  const project = await getProject(creds);
  const issueType = chooseIssueType(project, preferred);
  let payload = mapToJira(task, creds.projectKey, issueType);
  let res = await createIssue(creds, payload);

  // Team-managed projects often have no Priority field on the create screen. Retry without it.
  if (res.status === 400) {
    const detail = await readJiraError(res.clone());
    if (detail.fields['priority']) {
      console.info('Jira rejected the priority field; retrying without it.');
      const { priority: _drop, ...fields } = payload.fields;
      payload = { fields } as JiraPayload;
      res = await createIssue(creds, payload);
    }
  }

  if (!res.ok) {
    const detail = await readJiraError(res);
    console.error(`Jira create issue ${res.status}:`, detail);
    const explained = explainStatus(res.status, creds);
    if (explained) throw new Error(explained);
    const fieldProblems = Object.entries(detail.fields).map(([field, msg]) => `${field}: ${msg}`);
    const reasons = [...detail.messages, ...fieldProblems]
      .map((r) => r.trim().replace(/\.+$/, ''))
      .filter(Boolean)
      .join('; ');
    throw new Error(
      `Jira didn’t create the issue${reasons ? `: ${reasons}` : ''}. This usually means project ${creds.projectKey} requires a field ApeAI doesn’t fill in.`,
    );
  }

  const data = (await res.json()) as { key: string };
  return { external_id: data.key, external_url: `${base}/browse/${data.key}`, external_status: 'To Do' };
}
