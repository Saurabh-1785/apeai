/**
 * ApeAI — Integration Routes — auth required, user-scoped.
 *
 * POST   /integrations       — Create integration
 * GET    /integrations       — List integrations (API keys masked)
 * PATCH  /integrations/:id   — Update integration
 * DELETE /integrations/:id   — Delete integration
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createIntegration,
  listIntegrations,
  updateIntegration,
  deleteIntegration,
} from '../services/documentService';
import { IntegrationCreate, IntegrationUpdate } from '../types/storage';
import { checkJiraConnection, normalizeJiraUrl } from '../integrations/jira/client';
import { BadRequestError } from '../utils/errors';

export const integrationsRouter = Router();
integrationsRouter.use(requireAuth);

type DbRow = Record<string, unknown>;

function integrationToResponse(i: DbRow) {
  return {
    id: i['id'] ?? '',
    type: i['type'] ?? '',
    name: i['name'] ?? '',
    api_url: i['api_url'] ?? null,
    project_id: i['project_id'] ?? null,
    config: (i['config'] ?? {}) as Record<string, unknown>,
    is_active: i['is_active'] ?? true,
    created_at: String(i['created_at'] ?? ''),
    updated_at: String(i['updated_at'] ?? ''),
  };
}

integrationsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  const body = req.body as IntegrationCreate;
  try {
    let apiUrl = body.api_url;
    let projectId = body.project_id;
    let config = (body.config ?? {}) as Record<string, unknown>;

    if (body.type === 'jira') {
      // Credentials are later sent to this URL, so only Atlassian Cloud hosts are accepted.
      apiUrl = normalizeJiraUrl(body.api_url);
      projectId = String(body.project_id ?? '').trim().toUpperCase();
      const email = String(config['email'] ?? '').trim();
      if (!projectId) throw new BadRequestError('Enter the Jira project key, for example APE.');
      if (!email) throw new BadRequestError('Enter the email address you sign in to Jira with.');
      if (!body.api_key?.trim()) throw new BadRequestError('Paste a Jira API token.');

      config = { ...config, email };
      // Check the token and project now, so problems show up here and not at publish time.
      // Dry run skips the check: it never talks to Jira.
      if (config['dry_run'] !== true) {
        try {
          const check = await checkJiraConnection({ apiUrl, email, apiKey: body.api_key.trim(), projectKey: projectId });
          config = { ...config, account_name: check.accountName, project_name: check.projectName };
        } catch (err) {
          throw new BadRequestError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    const integration = await createIntegration({
      userId: req.userId!,
      intType: body.type,
      name: body.name,
      apiKey: body.api_key?.trim(),
      apiUrl,
      projectId,
      config,
    });
    res.status(201).json(integrationToResponse(integration));
  } catch (err) {
    next(err);
  }
});

integrationsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const q = req.query as Record<string, string>;
  try {
    const result = await listIntegrations({
      userId: req.userId!,
      intType: q['type'],
      activeOnly: q['active_only'] !== 'false',
    });
    res.json({ integrations: result.integrations.map(integrationToResponse), total: result.total });
  } catch (err) {
    next(err);
  }
});

integrationsRouter.patch('/:integrationId', async (req: Request, res: Response, next: NextFunction) => {
  const body = req.body as IntegrationUpdate;
  try {
    const integration = await updateIntegration(req.params['integrationId']!, req.userId!, {
      name: body.name,
      apiKey: body.api_key,
      apiUrl: body.api_url,
      projectId: body.project_id,
      config: body.config,
      isActive: body.is_active,
    });
    res.json(integrationToResponse(integration));
  } catch (err) {
    next(err);
  }
});

integrationsRouter.delete('/:integrationId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteIntegration(req.params['integrationId']!, req.userId!);
    res.json({ message: `Integration ${req.params['integrationId']} deleted` });
  } catch (err) {
    next(err);
  }
});
