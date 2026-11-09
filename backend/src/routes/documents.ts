/**
 * ApeAI — Document Routes (Layer 2) — auth required, user-scoped.
 *
 * POST   /documents        — Create document (in a cluster you own)
 * GET    /documents        — List documents (filters)
 * GET    /documents/:id    — Get document
 * PATCH  /documents/:id    — Update title/content (status only draft|review)
 * DELETE /documents/:id    — Delete document
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { createDocument, listDocuments, updateDocument, deleteDocument } from '../services/documentService';
import { getOwnedCluster, getOwnedDocument, parseIntParam } from '../services/ownership';
import { DocumentCreate, DocumentUpdate } from '../types/storage';

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

type DbRow = Record<string, unknown>;

export function docToResponse(doc: DbRow) {
  return {
    id: doc['id'] ?? '',
    cluster_id: doc['cluster_id'] ?? '',
    type: doc['type'] ?? '',
    title: doc['title'] ?? null,
    content: (doc['content'] ?? {}) as Record<string, unknown>,
    version: doc['version'] ?? 1,
    parent_id: doc['parent_id'] ?? null,
    status: doc['status'] ?? 'draft',
    created_at: String(doc['created_at'] ?? ''),
    updated_at: String(doc['updated_at'] ?? ''),
  };
}

documentsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  const body = req.body as DocumentCreate;
  if (!body.cluster_id || !body.type) {
    res.status(422).json({ detail: "'cluster_id' and 'type' are required" });
    return;
  }
  try {
    await getOwnedCluster(body.cluster_id, req.userId!);
    if (body.parent_id) {
      const parent = await getOwnedDocument(body.parent_id, req.userId!);
      if (parent['cluster_id'] !== body.cluster_id) {
        res.status(400).json({ detail: 'Parent document belongs to a different cluster' });
        return;
      }
    }
    const doc = await createDocument({
      clusterId: body.cluster_id,
      userId: req.userId!,
      docType: body.type,
      title: body.title,
      content: body.content,
      parentId: body.parent_id,
    });
    res.status(201).json(docToResponse(doc));
  } catch (err) {
    next(err);
  }
});

documentsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const q = req.query as Record<string, string>;
  try {
    const result = await listDocuments({
      userId: req.userId!,
      clusterId: q['cluster_id'],
      docType: q['type'],
      status: q['status'],
      parentId: q['parent_id'],
      limit: parseIntParam(q['limit'], 100, 500),
      offset: parseIntParam(q['offset'], 0, 1_000_000),
    });
    res.json({ documents: result.documents.map(docToResponse), total: result.total });
  } catch (err) {
    next(err);
  }
});

documentsRouter.get('/:documentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(docToResponse(await getOwnedDocument(req.params['documentId']!, req.userId!)));
  } catch (err) {
    next(err);
  }
});

documentsRouter.patch('/:documentId', async (req: Request, res: Response, next: NextFunction) => {
  const body = req.body as DocumentUpdate;
  try {
    const doc = await updateDocument(req.params['documentId']!, req.userId!, {
      title: body.title,
      content: body.content,
      status: body.status,
    });
    res.json(docToResponse(doc));
  } catch (err) {
    next(err);
  }
});

documentsRouter.delete('/:documentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteDocument(req.params['documentId']!, req.userId!);
    res.json({ message: `Document ${req.params['documentId']} deleted` });
  } catch (err) {
    next(err);
  }
});
