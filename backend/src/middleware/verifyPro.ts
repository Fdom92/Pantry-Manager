import { Request, Response, NextFunction } from 'express';
import { getCachedPro } from '../services/revenuecat.service.js';

const isDevEnvironment = process.env.NODE_ENV !== 'production';

export async function verifyPro(req: Request, res: Response, next: NextFunction) {
  if (isDevEnvironment) {
    return next();
  }
  const userId = (req.headers['x-user-id'] as string) || (req.body?.userId as string);
  if (!userId) {
    return res.status(403).json({ error: 'PRO_REQUIRED' });
  }
  try {
    const pro = await getCachedPro(userId);
    if (!pro) {
      return res.status(403).json({ error: 'PRO_REQUIRED' });
    }
    return next();
  } catch (err) {
    console.error('[verifyPro] error', err);
    return res.status(403).json({ error: 'PRO_REQUIRED' });
  }
}
