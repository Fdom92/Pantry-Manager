import { Router } from 'express';
import { agentController } from '../controllers/agent.controller.js';
import { verifyPro } from '../middleware/verifyPro.js';

const router = Router();

router.post('/process', verifyPro, agentController.process);

export default router;
