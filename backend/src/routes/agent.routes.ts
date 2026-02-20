import { Router } from 'express';
import { agentController } from '../controllers/agent.controller.js';
import { verifyPro } from '../middleware/verifyPro.js';
import { agentRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/process', verifyPro, agentRateLimiter, agentController.process);

export default router;
