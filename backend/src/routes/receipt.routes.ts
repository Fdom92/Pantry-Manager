import { Router } from 'express';
import { receiptController } from '../controllers/receipt.controller.js';
import { verifyPro } from '../middleware/verifyPro.js';
import { agentRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/parse', verifyPro, agentRateLimiter, receiptController.parse);

export default router;
