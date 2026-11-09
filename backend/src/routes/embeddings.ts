/**
 * ApeAI — Embedding Routes (Layer 2) — all routes require auth and are user-scoped.
 *
 * POST /embeddings/create  — Embed single feedback item
 * POST /embeddings/batch   — Embed all un-embedded (or stale) feedback
 * POST /embeddings/search  — Similarity search
 * GET  /embeddings/stats   — Embedding statistics
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createEmbeddingForFeedback,
  createEmbeddingsBatch,
  searchSimilar,
  getEmbeddingStats,
} from '../services/embeddingService';
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '../ai/geminiClient';
import { assertOwnsFeedback } from '../services/ownership';
import { EmbeddingCreate, EmbeddingBatchCreate, SimilaritySearchRequest } from '../types/storage';

export const embeddingsRouter = Router();
embeddingsRouter.use(requireAuth);

embeddingsRouter.post('/create', async (req: Request, res: Response, next: NextFunction) => {
  const body = req.body as EmbeddingCreate;
  if (!body.feedback_id) {
    res.status(422).json({ detail: "'feedback_id' is required" });
    return;
  }
  try {
    const result = await createEmbeddingForFeedback(body.feedback_id, req.userId!);
    res.json({
      id: result['id'] ?? '',
      feedback_id: result['feedback_id'] ?? body.feedback_id,
      model: result['model'] ?? EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      created_at: result['created_at'] ?? '',
      message: result.skipped ? 'Embedding already up to date' : 'Embedding created successfully',
    });
  } catch (err) {
    next(err);
  }
});

embeddingsRouter.post('/batch', async (req: Request, res: Response, next: NextFunction) => {
  const body = (req.body ?? {}) as EmbeddingBatchCreate;
  try {
    if (body.feedback_ids) await assertOwnsFeedback(body.feedback_ids, req.userId!);
    const result = await createEmbeddingsBatch(req.userId!, body.feedback_ids ?? undefined);
    res.json({
      ...result,
      message: `Batch complete: ${result.created} created, ${result.skipped} skipped, ${result.errors.length} failed`,
    });
  } catch (err) {
    next(err);
  }
});

embeddingsRouter.post('/search', async (req: Request, res: Response, next: NextFunction) => {
  const body = req.body as SimilaritySearchRequest;
  if (!body.text && !body.feedback_id) {
    res.status(400).json({ detail: "Either 'text' or 'feedback_id' must be provided" });
    return;
  }
  try {
    const results = await searchSimilar({
      userId: req.userId!,
      text: body.text,
      feedbackId: body.feedback_id,
      matchCount: body.match_count ?? 10,
      matchThreshold: body.match_threshold ?? 0.7,
    });
    res.json({
      query: body.text ? body.text.slice(0, 100) : `feedback:${body.feedback_id}`,
      results: results.map((r) => ({
        feedback_id: r['feedback_id'],
        content: r['content'],
        source: r['source'],
        similarity: r['similarity'],
      })),
      count: results.length,
    });
  } catch (err) {
    next(err);
  }
});

embeddingsRouter.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getEmbeddingStats(req.userId!));
  } catch (err) {
    next(err);
  }
});
