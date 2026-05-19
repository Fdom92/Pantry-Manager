import { Router } from 'express';
import { insightsController } from '../controllers/insights.controller.js';
import { verifyPro } from '../middleware/verifyPro.js';
import { agentRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/analyze', verifyPro, agentRateLimiter, insightsController.analyze);

export default router;
