/**
 * ApeAI — Jira Integration Routes
 *
 * POST /publish/jira/:documentId[?integration_id=]
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth';
import { getSupabaseClient } from '../../db/supabase';
import { publishDocument } from '../../services/publishService';

export const jiraRouter = Router();

jiraRouter.post(
  '/jira/:documentId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    const { documentId } = req.params;
    let integrationId = req.query['integration_id'] as string | undefined;

    try {
      // Auto-resolve the caller's own active Jira integration if not specified.
      if (!integrationId) {
        const db = getSupabaseClient();
        const { data } = await db
          .from('integrations')
          .select('id')
          .eq('type', 'jira')
          .eq('is_active', true)
          .eq('user_id', req.userId!)
          .order('created_at', { ascending: false })
          .limit(1);

        if (!data || data.length === 0) {
          res.status(400).json({
            detail: 'No active Jira integration configured. Add one on the Integrations page.',
          });
          return;
        }
        integrationId = (data[0] as Record<string, string>)['id'];
      }

      res.json(await publishDocument(documentId, integrationId, req.userId!));
    } catch (err) {
      next(err);
    }
  },
);
