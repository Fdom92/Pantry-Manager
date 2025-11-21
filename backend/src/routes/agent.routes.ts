import { Router } from 'express';
import { agentController } from '../controllers/agent.controller.js';

const router = Router();

router.post('/process', agentController.process);

export default router;
