/**
 * ApeAI — Publish Service
 *
 * Orchestrates publishing approved documents to external platforms.
 * Mirrors Python services/publish_service.py.
 */

import { getSupabaseClient } from '../db/supabase';
import { createTicketLink } from './documentService';
import { getOwnedDocument, getOwnedIntegration } from './ownership';
import { BadRequestError, ConflictError, UpstreamError } from '../utils/errors';

type DbRow = Record<string, unknown>;

const asText = (v: unknown): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)).trim()).filter(Boolean) : [];

/** "### Heading" + bullets, skipped entirely when the list is empty. */
function section(heading: string, items: string[]): string {
  return items.length ? `### ${heading}\n${items.map((i) => `- ${i}`).join('\n')}\n\n` : '';
}
function paragraph(heading: string, text: string): string {
  return text ? `### ${heading}\n${text}\n\n` : '';
}

/**
 * Converts a document into the tracker-neutral shape publishers consume:
 * title, a small-markdown description, priority, labels, and the issue
 * types to try in order (the publisher picks the first the project has).
 */
export function toUniversalFormat(doc: DbRow): DbRow {
  const docType = doc['type'] as string;
  const content = (doc['content'] ?? {}) as DbRow;
  const title = asText(doc['title']) || asText(content['title']);
  const footer = '\nCreated by ApeAI from customer feedback, after human review.';

  if (docType === 'story') {
    const narrative = [content['user_role'], content['requirement'], content['benefit']].map(asText).filter(Boolean).join(' ');
    return {
      title: title || 'User story',
      description: (
        (narrative ? `${narrative}\n\n` : '') +
        section('Acceptance criteria', asList(content['acceptance_criteria'])) +
        footer
      ).trim(),
      priority: asText(content['priority']) || 'Medium',
      labels: ['apeai', 'user-story'],
      issue_types: ['Story', 'Task'],
      assignee: null,
    };
  }

  if (docType === 'task') {
    const storyTitle = asText(content['story_title']);
    const deps = asList(content['dependencies']);
    let description = storyTitle ? `**Story:** ${storyTitle}\n\n` : '';
    description += section('Frontend', asList(content['frontend_tasks']));
    description += section('Backend', asList(content['backend_tasks']));
    description += section('Testing', asList(content['testing_tasks']));
    description += `**Estimated complexity:** ${asText(content['estimated_complexity']) || 'Medium'}\n`;
    if (deps.length) description += `**Depends on:** ${deps.join(', ')}\n`;
    return {
      title: title || 'Technical task',
      description: (description + footer).trim(),
      priority: 'Medium',
      labels: ['apeai', 'technical-task'],
      issue_types: ['Task', 'Story'],
      assignee: null,
    };
  }

  if (docType === 'brd') {
    return {
      title: title || 'Business requirements',
      description: (
        paragraph('Problem', asText(content['problem_statement'])) +
        paragraph('Business impact', asText(content['business_impact'])) +
        section('Goals', asList(content['goals'])) +
        section('Stakeholders', asList(content['target_stakeholders'])) +
        section('Success metrics', asList(content['success_metrics'])) +
        footer
      ).trim(),
      priority: 'Medium',
      labels: ['apeai', 'brd'],
      issue_types: ['Task', 'Story'],
      assignee: null,
    };
  }

  if (docType === 'prd') {
    return {
      title: title || 'Product requirements',
      description: (
        section('User flows', asList(content['user_flows'])) +
        section('Functional requirements', asList(content['functional_requirements'])) +
        section('Non-functional requirements', asList(content['non_functional_requirements'])) +
        section('Technical constraints', asList(content['technical_constraints'])) +
        section('Milestones', asList(content['milestones'])) +
        footer
      ).trim(),
      priority: 'Medium',
      labels: ['apeai', 'prd'],
      issue_types: ['Task', 'Story'],
      assignee: null,
    };
  }

  // Summary or anything else: readable key/value sections instead of raw JSON.
  let description = asText(content['summary'] ?? doc['summary']);
  description = description ? `${description}\n\n` : '';
  for (const [key, value] of Object.entries(content)) {
    if (['title', 'summary'].includes(key)) continue;
    const heading = key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
    description += Array.isArray(value) ? section(heading, asList(value)) : paragraph(heading, asText(value));
  }
  return {
    title: title || 'ApeAI document',
    description: (description + footer).trim(),
    priority: asText(content['priority']) || 'Medium',
    labels: ['apeai', ...(docType ? [docType] : [])],
    issue_types: ['Task', 'Story'],
    assignee: null,
  };
}

/** Integration types that have a working publisher. */
export const SUPPORTED_PUBLISH_TYPES = ['jira'];

/**
 * Publishes an approved document to an integration owned by the user.
 *
 * Failure handling:
 *   - If the external API call fails, nothing was created; the document
 *     stays 'approved' and can be retried.
 *   - If the external ticket WAS created but recording the link fails, the
 *     document is still marked 'published' (never reverted), so a retry
 *     cannot create a duplicate ticket. The error includes the ticket id.
 */
export async function publishDocument(
  documentId: string,
  integrationId: string,
  userId: string,
): Promise<DbRow> {
  const db = getSupabaseClient();

  const doc = await getOwnedDocument(documentId, userId);
  const integration = await getOwnedIntegration(integrationId, userId);

  if (integration['is_active'] === false) {
    throw new BadRequestError(`Integration ${integrationId} is inactive`);
  }

  const { data: links, error: linkErr } = await db
    .from('ticket_links')
    .select('integration_id')
    .eq('document_id', documentId);
  if (linkErr) throw new Error(`Failed to check existing ticket links: ${linkErr.message}`);
  const existingLinks = (links ?? []) as DbRow[];

  if (existingLinks.some((l) => l['integration_id'] === integrationId)) {
    throw new ConflictError(`Document ${documentId} has already been published to this integration`);
  }

  // 'published' is allowed only when it was published to a *different*
  // integration (and that link exists). A 'published' doc with no links
  // means an earlier publish created a ticket but failed to record it.
  const status = doc['status'] as string;
  if (status === 'published' && existingLinks.length === 0) {
    throw new ConflictError(
      'Document is marked published but has no ticket link recorded. Check your tracker for an existing ticket before republishing.',
    );
  }
  if (status !== 'approved' && status !== 'published') {
    throw new BadRequestError(`Only approved documents can be published. Current status: ${status}`);
  }

  const intType = integration['type'] as string;
  if (!SUPPORTED_PUBLISH_TYPES.includes(intType)) {
    throw new BadRequestError(`Publishing to ${intType} is not supported yet`);
  }

  console.info(`🔄 Publishing document ${documentId} to integration ${integrationId}...`);

  // Step 1: create the external ticket. On failure nothing exists externally.
  let result: { external_id: string; external_url: string; external_status: string };
  try {
    const { publishToJira } = await import('../integrations/jira/client');
    result = await publishToJira(toUniversalFormat(doc), integration);
  } catch (err) {
    console.error(`❌ Failed to publish document ${documentId}:`, err);
    throw new UpstreamError(err instanceof Error ? err.message : String(err));
  }

  // Step 2: the ticket exists — mark published first so it can never be re-sent.
  await db.from('documents').update({ status: 'published' }).eq('id', documentId);

  // Step 3: record the link.
  try {
    const link = await createTicketLink({
      documentId,
      integrationId,
      externalId: result.external_id,
      externalUrl: result.external_url,
      externalStatus: result.external_status ?? 'Open',
    });
    console.info(`✅ Published document ${documentId} as ticket ${result.external_id}`);
    return {
      success: true,
      ticket_link: link,
      external_url: result.external_url,
      external_id: result.external_id,
    };
  } catch (err) {
    console.error(`⚠️ Ticket ${result.external_id} created but link record failed:`, err);
    return {
      success: true,
      ticket_link: null,
      external_url: result.external_url,
      external_id: result.external_id,
      warning: `Ticket ${result.external_id} was created but its link could not be saved: ${
        err instanceof Error ? err.message : err
      }`,
    };
  }
}
