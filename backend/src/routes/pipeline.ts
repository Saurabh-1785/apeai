/**
 * ApeAI — Pipeline Routes (Layer 3 — AI Orchestration) — auth required, user-scoped.
 *
 * GET  /pipeline/status                                   — Pipeline overview
 * POST /pipeline/cluster                                  — Cluster your unprocessed feedback
 * POST /pipeline/summarize/:clusterId                     — Generate AI summary
 * POST /pipeline/generate-brd/:clusterId                  — Generate BRD
 * POST /pipeline/generate-prd/:clusterId?brd_id=          — Generate PRD
 * POST /pipeline/generate-stories/:clusterId?prd_id=      — Generate user stories
 * POST /pipeline/generate-tasks/:storyId?cluster_id=      — Generate tasks for one story
 *
 * Generation steps are idempotent: an existing document for the step is returned.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { getPipelineStatus } from '../services/documentService';
import { clusterUnprocessedFeedback } from '../ai/clusteringService';
import {
  summarizeCluster,
  generateBrd,
  generatePrd,
  generateStories,
  generateTasks,
} from '../ai/generationService';
import { docToResponse } from './documents';
import { BadRequestError } from '../utils/errors';

export const pipelineRouter = Router();
pipelineRouter.use(requireAuth);

type Handler = (req: Request) => Promise<unknown>;

function route(handler: Handler) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await handler(req));
    } catch (err) {
      next(err);
    }
  };
}

function requireQuery(req: Request, name: string): string {
  const v = req.query[name];
  if (typeof v !== 'string' || !v) throw new BadRequestError(`'${name}' query parameter is required`);
  return v;
}

pipelineRouter.get('/status', route((req) => getPipelineStatus(req.userId!)));

pipelineRouter.post('/cluster', route((req) => clusterUnprocessedFeedback(req.userId!)));

pipelineRouter.post(
  '/summarize/:clusterId',
  route((req) => summarizeCluster(req.params['clusterId']!, req.userId!)),
);

pipelineRouter.post(
  '/generate-brd/:clusterId',
  route(async (req) => docToResponse(await generateBrd(req.params['clusterId']!, req.userId!))),
);

pipelineRouter.post(
  '/generate-prd/:clusterId',
  route(async (req) =>
    docToResponse(await generatePrd(req.params['clusterId']!, requireQuery(req, 'brd_id'), req.userId!)),
  ),
);

pipelineRouter.post(
  '/generate-stories/:clusterId',
  route(async (req) =>
    (await generateStories(req.params['clusterId']!, requireQuery(req, 'prd_id'), req.userId!)).map(docToResponse),
  ),
);

pipelineRouter.post(
  '/generate-tasks/:storyId',
  route(async (req) =>
    docToResponse(await generateTasks(requireQuery(req, 'cluster_id'), req.params['storyId']!, req.userId!)),
  ),
);
