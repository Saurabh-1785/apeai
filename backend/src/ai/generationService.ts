/**
 * ApeAI — Generation Service
 *
 * Orchestrates Gemini to generate structured product documents.
 *
 * - Every model response is parsed and shape-checked before it is stored.
 * - Generation is idempotent: if the document for a step already exists
 *   (same cluster + parent), it is returned instead of creating a duplicate.
 * - Cluster status only moves forward (see advanceClusterStatus).
 */

import {
  CLUSTER_SUMMARY_PROMPT,
  BRD_PROMPT,
  PRD_PROMPT,
  STORY_PROMPT,
  TASK_PROMPT,
  formatPrompt,
} from './prompts';
import { geminiClient } from './geminiClient';
import { getCluster, updateCluster } from '../services/clusterService';
import { createDocument } from '../services/documentService';
import { getSupabaseClient } from '../db/supabase';
import { advanceClusterStatus, getOwnedCluster, getOwnedDocument } from '../services/ownership';
import { BadRequestError, UpstreamError } from '../utils/errors';

type DbRow = Record<string, unknown>;

/** Hard cap on feedback text sent to the model per cluster. */
const MAX_FEEDBACK_PROMPT_CHARS = 30_000;

// ─── Model I/O helpers ────────────────────────────────────────

function parseModelJson(text: string, step: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new UpstreamError(`AI returned invalid JSON for ${step}. Please retry.`);
  }
}

async function generateJson(modelType: 'flash' | 'pro', prompt: string, step: string): Promise<unknown> {
  const model = geminiClient.getModel(modelType, true);
  let text: string;
  try {
    const response = await model.generateContent(prompt);
    text = response.response.text();
  } catch (err) {
    throw new UpstreamError(`AI generation failed for ${step}: ${err instanceof Error ? err.message : err}`);
  }
  return parseModelJson(text, step);
}

function isObject(v: unknown): v is DbRow {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function requireObjectWith(v: unknown, keys: string[], step: string): DbRow {
  if (!isObject(v)) throw new UpstreamError(`AI response for ${step} was not a JSON object. Please retry.`);
  const missing = keys.filter((k) => typeof v[k] !== 'string' || !(v[k] as string).trim());
  if (missing.length > 0) {
    throw new UpstreamError(`AI response for ${step} is missing: ${missing.join(', ')}. Please retry.`);
  }
  return v;
}

/** Coerces a field to string[] (models occasionally return a single string). */
function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x.trim()) as string[];
  if (typeof v === 'string' && v.trim()) return [v];
  return [];
}

// ─── Lookup helpers ───────────────────────────────────────────

async function findDocuments(clusterId: string, type: string, parentId?: string): Promise<DbRow[]> {
  const db = getSupabaseClient();
  let q = db
    .from('documents')
    .select('*')
    .eq('cluster_id', clusterId)
    .eq('type', type)
    .order('created_at', { ascending: true });
  if (parentId) q = q.eq('parent_id', parentId);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to look up ${type} documents: ${error.message}`);
  return (data ?? []) as DbRow[];
}

async function getParentDocument(
  documentId: string,
  expectedType: string,
  clusterId: string,
  userId: string,
): Promise<DbRow> {
  const doc = await getOwnedDocument(documentId, userId);
  if (doc['type'] !== expectedType) {
    throw new BadRequestError(`Document ${documentId} is a ${doc['type']}, expected ${expectedType}`);
  }
  if (doc['cluster_id'] !== clusterId) {
    throw new BadRequestError(`Document ${documentId} does not belong to cluster ${clusterId}`);
  }
  return doc;
}

// ─── Confidence scoring ───────────────────────────────────────

/**
 * 0–100 reliability score from:
 *   volume   (50%) — how many feedback items back the cluster (saturates at 20)
 *   cohesion (35%) — mean similarity of linked items
 *   depth    (15%) — average feedback length (saturates at 300 chars)
 */
export function computeConfidence(items: DbRow[]): number {
  const n = items.length;
  if (n === 0) return 0;
  const volume = Math.min(1, Math.log2(n + 1) / Math.log2(21));
  const sims = items
    .map((i) => i['similarity_score'])
    .filter((s): s is number => typeof s === 'number' && Number.isFinite(s));
  const cohesion = sims.length > 0 ? sims.reduce((a, b) => a + b, 0) / sims.length : 0.75;
  const avgLen = items.reduce((a, i) => a + String(i['content'] ?? '').length, 0) / n;
  const depth = Math.min(1, avgLen / 300);
  const score = 100 * (0.5 * volume + 0.35 * Math.min(1, cohesion) + 0.15 * depth);
  return Math.round(score * 10) / 10;
}

// ─── Pipeline steps ───────────────────────────────────────────

export async function summarizeCluster(clusterId: string, userId: string): Promise<DbRow> {
  const cluster = await getCluster(clusterId, true, userId);
  const feedbackItems = (cluster['feedback_items'] ?? []) as DbRow[];
  if (feedbackItems.length === 0) throw new BadRequestError('No feedback items found in cluster');

  let feedbackText = '';
  for (const f of feedbackItems) {
    const line = `- ${String(f['content'] ?? '').replace(/\s+/g, ' ').trim()} (Source: ${f['source']})\n`;
    if (feedbackText.length + line.length > MAX_FEEDBACK_PROMPT_CHARS) break;
    feedbackText += line;
  }

  const prompt = formatPrompt(CLUSTER_SUMMARY_PROMPT, { feedback_text: feedbackText });
  const data = requireObjectWith(await generateJson('flash', prompt, 'cluster summary'), ['title', 'summary'], 'cluster summary');

  await updateCluster(clusterId, {
    title: (data['title'] as string).slice(0, 200),
    summary: data['summary'] as string,
    confidenceScore: computeConfidence(feedbackItems),
  });
  await advanceClusterStatus(clusterId, 'clustered');

  return data;
}

export async function generateBrd(clusterId: string, userId: string): Promise<DbRow> {
  const cluster = await getOwnedCluster(clusterId, userId);
  const summary = cluster['summary'] as string | undefined;
  if (!summary) throw new BadRequestError('Cluster must be summarized before generating BRD');

  const existing = await findDocuments(clusterId, 'brd');
  if (existing.length > 0) return existing[0];

  const prompt = formatPrompt(BRD_PROMPT, { cluster_summary: summary });
  const data = requireObjectWith(await generateJson('pro', prompt, 'BRD'), ['title', 'problem_statement'], 'BRD');

  const doc = await createDocument({
    clusterId,
    userId,
    docType: 'brd',
    title: data['title'] as string,
    content: { ...data, goals: asStringArray(data['goals']), success_metrics: asStringArray(data['success_metrics']) },
  });

  await advanceClusterStatus(clusterId, 'brd_generated');
  return doc;
}

export async function generatePrd(clusterId: string, brdId: string, userId: string): Promise<DbRow> {
  const brd = await getParentDocument(brdId, 'brd', clusterId, userId);

  const existing = await findDocuments(clusterId, 'prd', brdId);
  if (existing.length > 0) return existing[0];

  const prompt = formatPrompt(PRD_PROMPT, { brd_content: JSON.stringify(brd['content']) });
  const data = requireObjectWith(await generateJson('pro', prompt, 'PRD'), ['title'], 'PRD');

  const doc = await createDocument({
    clusterId,
    userId,
    docType: 'prd',
    title: data['title'] as string,
    content: {
      ...data,
      user_flows: asStringArray(data['user_flows']),
      functional_requirements: asStringArray(data['functional_requirements']),
      non_functional_requirements: asStringArray(data['non_functional_requirements']),
      technical_constraints: asStringArray(data['technical_constraints']),
      milestones: asStringArray(data['milestones']),
    },
    parentId: brdId,
  });

  await advanceClusterStatus(clusterId, 'prd_generated');
  return doc;
}

export async function generateStories(clusterId: string, prdId: string, userId: string): Promise<DbRow[]> {
  const prd = await getParentDocument(prdId, 'prd', clusterId, userId);

  const existing = await findDocuments(clusterId, 'story', prdId);
  if (existing.length > 0) return existing;

  const prompt = formatPrompt(STORY_PROMPT, { prd_content: JSON.stringify(prd['content']) });
  const raw = await generateJson('pro', prompt, 'user stories');

  // Accept a bare array, { stories: [...] }, or a single story object.
  let candidates: unknown[];
  if (Array.isArray(raw)) candidates = raw;
  else if (isObject(raw) && Array.isArray(raw['stories'])) candidates = raw['stories'] as unknown[];
  else if (isObject(raw) && typeof raw['title'] === 'string') candidates = [raw];
  else candidates = [];

  const stories = candidates.filter(
    (s): s is DbRow => isObject(s) && typeof s['title'] === 'string' && (s['title'] as string).trim() !== '',
  );
  if (stories.length === 0) throw new UpstreamError('AI returned no valid user stories. Please retry.');

  const created: DbRow[] = [];
  for (const story of stories) {
    created.push(
      await createDocument({
        clusterId,
        userId,
        docType: 'story',
        title: story['title'] as string,
        content: { ...story, acceptance_criteria: asStringArray(story['acceptance_criteria']) },
        parentId: prdId,
      }),
    );
  }

  await advanceClusterStatus(clusterId, 'stories_generated');
  return created;
}

export async function generateTasks(clusterId: string, storyId: string, userId: string): Promise<DbRow> {
  const story = await getParentDocument(storyId, 'story', clusterId, userId);

  const existing = await findDocuments(clusterId, 'task', storyId);
  if (existing.length > 0) return existing[0];

  const prompt = formatPrompt(TASK_PROMPT, { story_content: JSON.stringify(story['content']) });
  const raw = await generateJson('flash', prompt, 'technical tasks');
  if (!isObject(raw)) throw new UpstreamError('AI response for technical tasks was not a JSON object. Please retry.');

  const content: DbRow = {
    ...raw,
    story_title: typeof raw['story_title'] === 'string' ? raw['story_title'] : story['title'],
    frontend_tasks: asStringArray(raw['frontend_tasks']),
    backend_tasks: asStringArray(raw['backend_tasks']),
    testing_tasks: asStringArray(raw['testing_tasks']),
    dependencies: asStringArray(raw['dependencies']),
  };
  const taskCount =
    (content['frontend_tasks'] as string[]).length +
    (content['backend_tasks'] as string[]).length +
    (content['testing_tasks'] as string[]).length;
  if (taskCount === 0) throw new UpstreamError('AI returned no technical tasks. Please retry.');

  const doc = await createDocument({
    clusterId,
    userId,
    docType: 'task',
    title: `Technical Tasks: ${story['title']}`,
    content,
    parentId: storyId,
  });

  // Advance once every story in the cluster has its task breakdown.
  const stories = await findDocuments(clusterId, 'story');
  const tasks = await findDocuments(clusterId, 'task');
  const covered = new Set(tasks.map((t) => t['parent_id']));
  if (stories.every((s) => covered.has(s['id']))) {
    await advanceClusterStatus(clusterId, 'tasks_generated');
  }

  return doc;
}
