import type { NextFunction, Request, Response } from 'express';
import type { AgentStore } from '../core/agentStore.js';

function extractBearerToken(req: Request): string | null {
  const authHeader = req.header('authorization') || req.header('Authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice('bearer '.length).trim();
  }

  const alt = req.header('x-speak-access-token');
  if (alt && alt.trim().length > 0) return alt.trim();
  return null;
}

/**
 * Require a valid Speak agent session token.
 *
 * On success:
 * - stores authenticated agent id under `res.locals.speakAgentId`
 */
export function createRequireAgentAuth(agentStore: AgentStore) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = extractBearerToken(req);
      if (!token) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing Bearer token',
          },
        });
        return;
      }

      const agent = await agentStore.resolveAgentFromToken(token);
      if (!agent) {
        res.status(401).json({
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired session token',
          },
        });
        return;
      }

      res.locals.speakAgentId = agent.id;
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Auth validation failed';
      res.status(500).json({
        error: {
          code: 'AUTH_INTERNAL_ERROR',
          message,
        },
      });
    }
  };
}
