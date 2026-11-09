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

export function toUniversalFormat(doc: DbRow): DbRow {
  const docType = doc['type'] as string;
  const content = (doc['content'] ?? {}) as DbRow;

  if (docType === 'story') {
    const title = (doc['title'] ?? content['title'] ?? 'Unnamed Story') as string;
    const userRole = (content['user_role'] ?? '') as string;
    const req = (content['requirement'] ?? '') as string;
    const benefit = (content['benefit'] ?? '') as string;
    const acList = (content['acceptance_criteria'] ?? []) as string[];
    const priority = (content['priority'] ?? 'Medium') as string;

    let description = `${userRole}\n${req}\n${benefit}\n\n### Acceptance Criteria\n`;
    for (const ac of acList) {
      description += `- ${ac}\n`;
    }

    return {
      title,
      description: description.trim(),
      priority,
      labels: ['user-story', 'story'],
      assignee: null,
    };
  }

  if (docType === 'task') {
    const title = (doc['title'] ?? 'Unnamed Task') as string;
    const storyTitle = (content['story_title'] ?? '') as string;
    const frontendTasks = (content['frontend_tasks'] ?? []) as string[];
    const backendTasks = (content['backend_tasks'] ?? []) as string[];
    const testingTasks = (content['testing_tasks'] ?? []) as string[];
    const complexity = (content['estimated_complexity'] ?? 'Medium') as string;
    const dependencies = (content['dependencies'] ?? []) as string[];

    let description = `**Story Ref:** ${storyTitle}\n\n`;
    if (frontendTasks.length) {
      description += '### Frontend Tasks\n';
      frontendTasks.forEach((t) => (description += `- [ ] ${t}\n`));
      description += '\n';
    }
    if (backendTasks.length) {
      description += '### Backend Tasks\n';
      backendTasks.forEach((t) => (description += `- [ ] ${t}\n`));
      description += '\n';
    }
    if (testingTasks.length) {
      description += '### Testing Tasks\n';
      testingTasks.forEach((t) => (description += `- [ ] ${t}\n`));
      description += '\n';
    }
    description += `**Complexity:** ${complexity}\n`;
    if (dependencies.length) {
      description += `**Dependencies:** ${dependencies.join(', ')}\n`;
    }

    return {
      title,
      description: description.trim(),
      priority: 'Medium',
      labels: ['technical-task', 'task'],
      assignee: null,
    };
  }

  // Generic fallback
  return {
    title: (doc['title'] ?? 'AI Document') as string,
    description: (content['summary'] ?? doc['summary'] ?? JSON.stringify(content)) as string,
    priority: 'Medium',
    labels: docType ? [docType] : [],
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
