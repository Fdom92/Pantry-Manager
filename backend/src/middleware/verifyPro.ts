import { Request, Response, NextFunction } from 'express';
import { getCachedPro } from '../services/revenuecat.service.js';
import { logger } from '../utils/logger.js';

const isDevEnvironment = process.env.NODE_ENV !== 'production';

export async function verifyPro(req: Request, res: Response, next: NextFunction) {
  const userId = (req.headers['x-user-id'] as string) || (req.body?.userId as string);

  // In development, skip PRO check but still attach userId if present
  if (isDevEnvironment) {
    if (userId) {
      (req as any).userId = userId;
    }
    return next();
  }

  if (!userId) {
    return res.status(403).json({ error: 'PRO_REQUIRED' });
  }

  try {
    const pro = await getCachedPro(userId);
    if (!pro) {
      logger.warn('PRO verification failed', { userId });
      return res.status(403).json({ error: 'PRO_REQUIRED' });
    }

    // Attach userId to request for rate limiter and logging
    (req as any).userId = userId;

    return next();
  } catch (err: any) {
    logger.error('PRO verification error', { userId, error: err.message });
    return res.status(403).json({ error: 'PRO_REQUIRED' });
  }
}
