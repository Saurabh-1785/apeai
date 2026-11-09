/**
 * ApeAI — Ticket Link Routes — auth required, user-scoped.
 *
 * POST /ticket-links  — Create ticket link (document + integration must be yours)
 * GET  /ticket-links  — List ticket links
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { createOwnedTicketLink, listTicketLinks } from '../services/documentService';
import { TicketLinkCreate } from '../types/storage';

export const ticketLinksRouter = Router();
ticketLinksRouter.use(requireAuth);

ticketLinksRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  const body = req.body as TicketLinkCreate;
  try {
    const link = await createOwnedTicketLink(req.userId!, {
      documentId: body.document_id,
      integrationId: body.integration_id,
      externalId: body.external_id,
      externalUrl: body.external_url,
      externalStatus: body.external_status,
    });
    res.status(201).json({
      id: link['id'] ?? '',
      document_id: link['document_id'] ?? '',
      integration_id: link['integration_id'] ?? '',
      external_id: link['external_id'] ?? '',
      external_url: link['external_url'] ?? null,
      external_status: link['external_status'] ?? null,
      synced_at: String(link['synced_at'] ?? ''),
    });
  } catch (err) {
    next(err);
  }
});

ticketLinksRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const links = await listTicketLinks(req.userId!, req.query['document_id'] as string | undefined);
    res.json({ ticket_links: links, total: links.length });
  } catch (err) {
    next(err);
  }
});
