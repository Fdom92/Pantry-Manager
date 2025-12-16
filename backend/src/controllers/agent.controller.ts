import { Request, Response } from 'express';
import { openaiService } from '../services/openai.service.js';

export const agentController = {
  async process(req: Request, res: Response) {
    try {
      const body = req.body ?? {};
      const { message } = body as { message?: string };

      // Support simple string prompts and richer payloads (tools/history)
      if (!message && !body.system && !body.messages) {
        return res.status(400).json({ error: 'Message required' });
      }

      const result = message
        ? await openaiService.ask(message)
        : await openaiService.askStructured(body);

      return res.json(result);
    } catch (err) {
      console.error('[agentController] process error', err);
      return res.status(500).json({ error: 'Agent error' });
    }
  },

  async telemetry(req: Request, res: Response) {
    try {
      const payload = req.body ?? {};
      const { event, timestamp } = payload as { event?: string; timestamp?: string };
      console.info('[agentController] telemetry', {
        event: event ?? 'unknown',
        timestamp,
      });
      return res.status(204).send();
    } catch (err) {
      console.error('[agentController] telemetry error', err);
      return res.status(500).json({ error: 'Telemetry error' });
    }
  },
};
