import type { NextFunction, Request, Response } from 'express';

export function createMasterApiKeyMiddleware(masterApiKey: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!masterApiKey) {
      next();
      return;
    }

    const incoming = req.header('x-api-key') || '';
    if (incoming !== masterApiKey) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid x-api-key',
        },
      });
      return;
    }

    next();
  };
}
