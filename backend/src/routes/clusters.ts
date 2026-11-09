/**
 * ApeAI — Cluster Routes (Layer 2) — auth required, user-scoped.
 *
 * POST   /clusters                          — Create cluster
 * GET    /clusters/stats                    — Status counts
 * GET    /clusters                          — List clusters
 * GET    /clusters/:id                      — Get cluster with feedback
 * PATCH  /clusters/:id                      — Update cluster
 * DELETE /clusters/:id                      — Delete cluster
 * POST   /clusters/:id/feedback             — Add feedback items
 * DELETE /clusters/:id/feedback             — Remove feedback items (?feedback_ids=)
 * GET    /clusters/:id/duplicates           — Published tickets similar to this cluster
 * POST   /clusters/:id/append               — Merge into an existing ticket's cluster
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createCluster,
  getCluster,
  listClusters,
  updateCluster,
  deleteCluster,
  addFeedbackToCluster,
  removeFeedbackFromCluster,
  getClusterStats,
} from '../services/clusterService';
import { findDuplicateTickets, appendClusterToExistingDocument } from '../services/duplicateDetector';
import { assertOwnsFeedback, getOwnedCluster, parseIntParam } from '../services/ownership';
import { ClusterCreate, ClusterUpdate, ClusterAddFeedback } from '../types/storage';

export const clustersRouter = Router();
clustersRouter.use(requireAuth);

function clusterToResponse(cluster: Record<string, unknown>) {
  return {
    id: cluster['id'] ?? '',
    title: cluster['title'] ?? null,
    summary: cluster['summary'] ?? null,
    feedback_count: cluster['feedback_count'] ?? 0,
    confidence_score: cluster['confidence_score'] ?? 0.0,
    status: cluster['status'] ?? 'new',
    created_at: String(cluster['created_at'] ?? ''),
    updated_at: String(cluster['updated_at'] ?? ''),
    feedback_items: (cluster['feedback_items'] as unknown[]) ?? [],
  };
}

clustersRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  const body = req.body as ClusterCreate;
  if (!body.title) {
    res.status(422).json({ detail: "'title' is required" });
    return;
  }
  try {
    if (body.feedback_ids?.length) await assertOwnsFeedback(body.feedback_ids, req.userId!);
    const cluster = await createCluster({
      title: body.title,
      summary: body.summary,
      feedbackIds: body.feedback_ids,
      confidenceScore: body.confidence_score,
      userId: req.userId!,
    });
    res.status(201).json(clusterToResponse(cluster));
  } catch (err) {
    next(err);
  }
});

// Must come before /:clusterId
clustersRouter.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getClusterStats(req.userId!));
  } catch (err) {
    next(err);
  }
});

clustersRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const q = req.query as Record<string, string>;
  try {
    const result = await listClusters({
      status: q['status'],
      userId: req.userId!,
      limit: parseIntParam(q['limit'], 50, 500) || 50,
      offset: parseIntParam(q['offset'], 0, 1_000_000),
    });
    res.json({ clusters: result.clusters.map(clusterToResponse), total: result.total });
  } catch (err) {
    next(err);
  }
});

clustersRouter.get('/:clusterId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(clusterToResponse(await getCluster(req.params['clusterId']!, true, req.userId!)));
  } catch (err) {
    next(err);
  }
});

clustersRouter.patch('/:clusterId', async (req: Request, res: Response, next: NextFunction) => {
  const body = req.body as ClusterUpdate;
  try {
    await getOwnedCluster(req.params['clusterId']!, req.userId!);
    const cluster = await updateCluster(req.params['clusterId']!, {
      title: body.title,
      summary: body.summary,
      status: body.status,
      confidenceScore: body.confidence_score,
    });
    res.json(clusterToResponse(cluster));
  } catch (err) {
    next(err);
  }
});

clustersRouter.delete('/:clusterId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteCluster(req.params['clusterId']!, req.userId!);
    res.json({ message: `Cluster ${req.params['clusterId']} deleted` });
  } catch (err) {
    next(err);
  }
});

clustersRouter.post('/:clusterId/feedback', async (req: Request, res: Response, next: NextFunction) => {
  const body = req.body as ClusterAddFeedback;
  if (!Array.isArray(body.feedback_ids) || body.feedback_ids.length === 0) {
    res.status(422).json({ detail: "'feedback_ids' is required" });
    return;
  }
  try {
    await getOwnedCluster(req.params['clusterId']!, req.userId!);
    await assertOwnsFeedback(body.feedback_ids, req.userId!);
    res.json(await addFeedbackToCluster(req.params['clusterId']!, body.feedback_ids, body.similarity_scores));
  } catch (err) {
    next(err);
  }
});

clustersRouter.delete('/:clusterId/feedback', async (req: Request, res: Response, next: NextFunction) => {
  const raw = req.query['feedback_ids'];
  const ids: string[] = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    res.status(422).json({ detail: "'feedback_ids' query param is required" });
    return;
  }
  try {
    await getOwnedCluster(req.params['clusterId']!, req.userId!);
    res.json(await removeFeedbackFromCluster(req.params['clusterId']!, ids));
  } catch (err) {
    next(err);
  }
});

clustersRouter.get('/:clusterId/duplicates', async (req: Request, res: Response, next: NextFunction) => {
  const threshold = Number(req.query['threshold'] ?? 0.8);
  try {
    const matches = await findDuplicateTickets(
      req.params['clusterId']!,
      req.userId!,
      Number.isFinite(threshold) ? Math.min(Math.max(threshold, 0), 1) : 0.8,
      parseIntParam(req.query['limit'], 10, 50) || 10,
    );
    res.json({ duplicates: matches, count: matches.length });
  } catch (err) {
    next(err);
  }
});

clustersRouter.post('/:clusterId/append', async (req: Request, res: Response, next: NextFunction) => {
  const targetDocumentId = (req.body ?? {})['target_document_id'] as string | undefined;
  if (!targetDocumentId) {
    res.status(422).json({ detail: "'target_document_id' is required" });
    return;
  }
  try {
    res.json(await appendClusterToExistingDocument(req.params['clusterId']!, targetDocumentId, req.userId!));
  } catch (err) {
    next(err);
  }
});
