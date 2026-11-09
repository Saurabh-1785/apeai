/**
 * ApeAI — Feedback Routes (Layer 1)
 *
 * POST /feedback/manual   — Submit single text feedback
 * GET  /feedback/stats    — Feedback counts by source
 * GET  /feedback/recent   — Get recent feedback
 * POST /feedback/csv      — Upload CSV file with multiple feedback items

 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { requireAuth } from '../middleware/auth';
import { normalizeManual, normalizeCsvRow } from '../services/normalize';
import {
  saveFeedback,
  saveFeedbackBatchDeduped,
  getRecentFeedbacks,
  getFeedbackStats,
} from '../services/saveFeedback';
import { parseIntParam } from '../services/ownership';
import { ManualFeedbackInput } from '../types/feedback';

export const feedbackRouter = Router();
const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_CSV_BYTES, files: 1 } });

// POST /feedback/manual
feedbackRouter.post(
  '/manual',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    const body = req.body as ManualFeedbackInput;

    if (!body.content || body.content.trim().length === 0) {
      res.status(422).json({ detail: "'content' field is required and must not be empty" });
      return;
    }
    if (body.content.length > 10000) {
      res.status(422).json({ detail: "'content' must be at most 10000 characters" });
      return;
    }

    try {
      const feedbackItem = normalizeManual(body);
      feedbackItem.userId = req.userId;

      const saved = await saveFeedback(feedbackItem);
      res.json({
        id: saved['id'] ?? '',
        source: saved['source'] ?? 'manual',
        author: saved['author'] ?? 'anonymous',
        content: saved['content'] ?? '',
        timestamp: saved['timestamp'] ?? '',
        message: 'Feedback saved successfully',
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('Failed to save')) {
        res.status(503).json({ detail: err.message });
        return;
      }
      next(err);
    }
  },
);

// GET /feedback/stats — counts for the authenticated user
feedbackRouter.get(
  '/stats',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await getFeedbackStats(req.userId!));
    } catch (err) {
      next(err);
    }
  },
);

// GET /feedback/recent
feedbackRouter.get(
  '/recent',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    const limit = parseIntParam(req.query['limit'], 50, 200) || 50;

    try {
      const items = await getRecentFeedbacks(req.userId!, limit);
      res.json({ feedbacks: items });
    } catch (err) {
      next(err);
    }
  },
);

// POST /feedback/csv
feedbackRouter.post(
  '/csv',
  requireAuth,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.file) {
      res.status(400).json({ detail: 'No file uploaded. Send a CSV as multipart form-data field "file".' });
      return;
    }

    const { originalname, mimetype, buffer } = req.file;

    // Validate content type
    const validTypes = ['text/csv', 'application/vnd.ms-excel', 'application/octet-stream'];
    if (!validTypes.includes(mimetype) && !originalname.endsWith('.csv')) {
      res.status(400).json({ detail: `Expected a CSV file, got: ${mimetype}` });
      return;
    }

    try {
      const textContent = buffer.toString('utf-8');

      // Parse CSV
      let records: Array<Record<string, string>>;
      try {
        records = parse(textContent, {
          bom: true, // Excel "CSV UTF-8" exports start with a byte-order mark
          columns: (header: string[]) => header.map((h) => h.trim()),
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true,
        }) as Array<Record<string, string>>;
      } catch (parseErr) {
        res.status(400).json({ detail: `CSV parse error: ${parseErr instanceof Error ? parseErr.message : parseErr}` });
        return;
      }

      const hasContent = records[0] && Object.keys(records[0]).some((k) => k.toLowerCase() === 'content');
      if (records.length === 0 || !hasContent) {
        const cols = records[0] ? Object.keys(records[0]) : [];
        res.status(400).json({
          detail: `CSV must have a 'content' column. Found columns: ${cols.join(', ')}`,
        });
        return;
      }

      const feedbackItems = [];
      const errors: Array<Record<string, unknown>> = [];

      for (let i = 0; i < records.length; i++) {
        const rowNumber = i + 1;
        try {
          const item = normalizeCsvRow(records[i], rowNumber);
          item.userId = req.userId;
          item.metadata = { ...item.metadata, file_name: originalname };
          feedbackItems.push(item);
        } catch (err) {
          errors.push({ row: rowNumber, error: String(err) });
        }
      }

      if (feedbackItems.length === 0) {
        res.status(400).json({ detail: 'No valid rows found in CSV' });
        return;
      }

      const { saved } = await saveFeedbackBatchDeduped(feedbackItems);
      const totalRows = feedbackItems.length + errors.length;

      res.json({
        total_rows: totalRows,
        saved: saved.length,
        errors,
        message: `Successfully saved ${saved.length} of ${totalRows} rows`,
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('Batch save failed')) {
        res.status(503).json({ detail: err.message });
        return;
      }
      next(err);
    }
  },
);
