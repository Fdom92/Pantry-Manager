import { Request, Response, Router } from 'express';
import { getCachedPro } from '../services/revenuecat.service.js';

const router = Router();

router.post('/check-pro', async (req: Request, res: Response) => {
  const userId = req.body?.userId as string | undefined;
  if (!userId) {
    return res.status(400).json({ error: 'USER_ID_REQUIRED' });
  }
  try {
    const pro = await getCachedPro(userId);
    return res.json({ pro });
  } catch (err) {
    console.error('[payments] check-pro error', err);
    return res.status(500).json({ error: 'PRO_CHECK_FAILED' });
  }
});

export default router;
