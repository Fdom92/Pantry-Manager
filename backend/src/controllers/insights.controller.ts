import { Request, Response } from 'express';
import { openaiService } from '../services/openai.service.js';
import { logger } from '../utils/logger.js';

const SYSTEM_PROMPT = `Eres un asistente de análisis de despensa doméstica. Analiza los datos y devuelve ÚNICAMENTE un JSON válido con este formato exacto:

{"patterns":[],"problems":[],"recommendations":[],"suggestions":[]}

Reglas: máximo 3 ítems por sección, mínimo 1. Cada ítem: frase corta y accionable. Sin texto fuera del JSON. Idioma: español.`;

function buildUserMessage(events: any[], snapshot: any): string {
  const addedCount = events.filter((e: any) => e.eventType === 'ADD').length;
  const consumedCount = events.filter((e: any) => e.eventType === 'CONSUME').length;
  const expiredCount = events.filter((e: any) => e.eventType === 'EXPIRE').length;

  const topAdded = (() => {
    const counts: Record<string, number> = {};
    events.filter((e: any) => e.eventType === 'ADD' && e.foodType).forEach((e: any) => {
      counts[e.foodType] = (counts[e.foodType] ?? 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k).join(', ') || 'N/A';
  })();

  const topExpired = (() => {
    const counts: Record<string, number> = {};
    events.filter((e: any) => e.eventType === 'EXPIRE' && e.foodType).forEach((e: any) => {
      counts[e.foodType] = (counts[e.foodType] ?? 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k).join(', ') || 'ninguno';
  })();

  return `INVENTARIO ACTUAL:
- Total: ${snapshot.total} productos
- Caducados: ${snapshot.expired}
- En revisión: ${snapshot.review}
- Próximos a caducar: ${snapshot.nearExpiry}
- Básicos sin stock: ${snapshot.basicsOutOfStock}

ACTIVIDAD ÚLTIMOS 30 DÍAS (${events.length} eventos):
- Añadidos: ${addedCount}
- Consumidos: ${consumedCount}
- Caducados sin usar: ${expiredCount}
- Tipos más añadidos: ${topAdded}
- Tipos más caducados: ${topExpired}`;
}

function validateAnalysis(parsed: any): boolean {
  return (
    parsed &&
    Array.isArray(parsed.patterns) &&
    Array.isArray(parsed.problems) &&
    Array.isArray(parsed.recommendations) &&
    Array.isArray(parsed.suggestions)
  );
}

export const insightsController = {
  async analyze(req: Request, res: Response): Promise<void> {
    const userId = (req as any).userId || 'unknown';
    const body = req.body ?? {};

    if (!body.events || !body.snapshot) {
      res.status(400).json({ error: 'PAYLOAD_REQUIRED' });
      return;
    }

    const events = Array.isArray(body.events) ? body.events.slice(0, 200) : [];
    const snapshot = body.snapshot;

    logger.info('Insights analyze request', { userId, eventCount: events.length });

    const userMessage = buildUserMessage(events, snapshot);

    let content: string;
    try {
      content = await openaiService.createCompletion({ system: SYSTEM_PROMPT, userMessage });
    } catch (err: any) {
      logger.error('OpenAI completion failed', { userId, error: err.message });
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

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      logger.error('Failed to parse OpenAI JSON response', { userId, content });
      res.status(500).json({ error: 'INVALID_RESPONSE' });
      return;
    }

    if (!validateAnalysis(parsed)) {
      logger.error('OpenAI response missing required keys', { userId });
      res.status(500).json({ error: 'INVALID_RESPONSE' });
      return;
    }

    res.json({
      analysis: {
        patterns: parsed.patterns.slice(0, 3),
        problems: parsed.problems.slice(0, 3),
        recommendations: parsed.recommendations.slice(0, 3),
        suggestions: parsed.suggestions.slice(0, 3),
        generatedAt: new Date().toISOString(),
      },
    });
  },
};
