/**
 * ApeAI — Approval Routes — auth required, user-scoped.
 *
 * POST /approvals  — Submit review (approve/reject). Reviewer = authenticated user.
 * GET  /approvals  — List approvals
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { createApproval, listApprovals } from '../services/documentService';
import { parseIntParam } from '../services/ownership';
import { ApprovalCreate } from '../types/storage';

export const approvalsRouter = Router();
approvalsRouter.use(requireAuth);

type DbRow = Record<string, unknown>;

function approvalToResponse(a: DbRow) {
  return {
    id: a['id'] ?? '',
    document_id: a['document_id'] ?? '',
    approved: a['approved'] ?? false,
    reviewed_by: a['reviewed_by'] ?? '',
    review_notes: a['review_notes'] ?? null,
    has_edits: a['edited_content'] != null,
    reviewed_at: String(a['reviewed_at'] ?? a['created_at'] ?? ''),
    message: a['approved'] ? 'approved' : 'rejected',
  };
}

approvalsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  const body = req.body as ApprovalCreate;
  if (!body.document_id) {
    res.status(422).json({ detail: "'document_id' is required" });
    return;
  }
  if (typeof body.approved !== 'boolean') {
    res.status(422).json({ detail: "'approved' must be true or false" });
    return;
  }
  try {
    const approval = await createApproval({
      documentId: body.document_id,
      userId: req.userId!,
      approved: body.approved,
      reviewNotes: body.review_notes,
      editedContent: body.edited_content,
    });
    res.status(201).json(approvalToResponse(approval));
  } catch (err) {
    next(err);
  }
});

approvalsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const q = req.query as Record<string, string>;
  try {
    const result = await listApprovals({
      userId: req.userId!,
      documentId: q['document_id'],
      limit: parseIntParam(q['limit'], 50, 500),
      offset: parseIntParam(q['offset'], 0, 1_000_000),
    });
    res.json({ approvals: result.approvals.map(approvalToResponse), total: result.total });
  } catch (err) {
    next(err);
  }
});
