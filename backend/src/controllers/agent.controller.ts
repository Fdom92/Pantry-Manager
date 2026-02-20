import { Request, Response } from 'express';
import { openaiService } from '../services/openai.service.js';
import { logger } from '../utils/logger.js';

export const agentController = {
  async process(req: Request, res: Response): Promise<void> {
    const userId = (req as any).userId || 'unknown';
    const body = req.body ?? {};

    if (!body.system || !body.messages) {
      res.status(400).json({ error: 'MESSAGE_REQUIRED' });
      return;
    }

    logger.info('Agent request', { userId });

    let chunks: AsyncIterable<string>;
    try {
      // Eagerly starts the OpenAI HTTP request — may throw 429, auth errors, etc.
      // before we commit to SSE headers.
      chunks = await openaiService.createStream(body);
    } catch (err: any) {
      logger.error('OpenAI stream creation failed', {
        userId,
        error: err.message,
        status: err.status,
      });

      if (err.status === 429) {
        res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED' });
      } else if (err.code === 'ECONNABORTED' || err.name === 'AbortError') {
        res.status(504).json({ error: 'TIMEOUT' });
      } else if (err.status && err.status >= 500) {
        res.status(502).json({ error: 'OPENAI_ERROR' });
      } else {
        res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
      return;
    }

    // Commit to SSE after successful connection to OpenAI
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const startTime = Date.now();
    try {
      for await (const text of chunks) {
        res.write(`data: ${JSON.stringify({ t: text })}\n\n`);
        // Flush compression middleware buffer so chunks reach the client immediately
        (res as any).flush?.();
      }
      res.write('data: [DONE]\n\n');
      logger.info('Agent stream complete', { userId, duration: Date.now() - startTime });
    } catch (err: any) {
      logger.error('Agent stream error', { userId, error: err.message });
      res.write(`data: ${JSON.stringify({ error: 'STREAM_ERROR' })}\n\n`);
    } finally {
      res.end();
    }
  },
};
