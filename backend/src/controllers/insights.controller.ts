import { Request, Response } from 'express';
import { openaiService } from '../services/openai.service.js';
import { logger } from '../utils/logger.js';

const SYSTEM_PROMPT = `You are a behavioral analyst for household food consumption habits.

You receive pre-computed signals about a user's pantry — do NOT recompute or describe these numbers.

Your task:
- Detect non-obvious behavioral patterns from the signals
- Identify real problems with concrete impact on food waste or spending
- Give specific, personalized recommendations based on the actual data
- Optionally suggest one strategic improvement

STRICT RULES — violating any of these means a failed output:
- Do NOT repeat visible metrics (counts, percentages, ratios)
- Do NOT enumerate statistics literally (e.g. "you have 5 expired items")
- Do NOT suggest app features or explain how to use the app
- Do NOT suggest recipes or meal planning
- Do NOT write generic advice (e.g. "try to improve your habits", "consider organizing...")
- Each insight must be specific to the user's actual signals — no copy-paste insights
- Explain the behavioral WHY, not the data WHAT
- Write ALL string values in the JSON in the language specified at the top of the user message (RESPONSE LANGUAGE field)

OUTPUT: Return ONLY valid JSON with no text outside it:
{"patterns":[],"problems":[],"recommendations":[],"suggestions":[]}

Each array item MUST be a plain string sentence — no nested objects, no keys, no JSON sub-fields.

LIMITS: max 2 patterns, max 2 problems (0 is valid if no real problems exist), max 2 recommendations, max 1 suggestion (0 is valid)`;

const LOCALE_TO_LANGUAGE: Record<string, string> = {
  es: 'Spanish',
  en: 'English',
  de: 'German',
  fr: 'French',
  it: 'Italian',
  pt: 'Portuguese',
};

function buildUserMessage(body: any): string {
  const { locale, signals, activity, patterns, inventory, products, derived } = body;
  const language = LOCALE_TO_LANGUAGE[locale as string] ?? 'English';

  const fmt = (v: number | null | undefined, decimals = 0): string =>
    v == null ? 'unknown' : (v * 100).toFixed(decimals) + '%';

  const categoryLines =
    Array.isArray(inventory) && inventory.length > 0
      ? inventory
          .map(
            (c: any) =>
              `  - ${c.foodType}: ${c.count} items, waste ratio ${fmt(c.expiredRatio)}`
          )
          .join('\n')
      : '  - no category data';

  const productLine = (label: string, names: string[]) =>
    `${label}: ${names?.length ? names.join(', ') : 'none'}`;

  return `RESPONSE LANGUAGE: ${language} — ALL string values in your JSON output MUST be written in ${language}.

INVENTORY STATE:
  Risk level: ${derived?.riskLevel ?? 'unknown'}
  Inventory trend: ${derived?.inventoryTrend ?? 'unknown'}
  Waste trend: ${derived?.wasteTrend ?? 'unknown'}
  Total products: ${signals?.totalProducts ?? 0}
  No-expiry ratio: ${fmt(signals?.noExpiryRatio)}

ACTIVITY (last 30 days):
  Added: ${activity?.addedCount ?? 0} | Consumed: ${activity?.consumedCount ?? 0} | Expired unused: ${activity?.expiredCount ?? 0}
  Inventory delta: ${activity?.inventoryDelta ?? 'unknown'}
  Activity waste ratio: ${fmt(activity?.wasteRatio)}

BEHAVIORAL PATTERNS:
  Most wasteful food type: ${patterns?.mostWastefulFoodType ?? 'none'}
  Most consumed food type: ${patterns?.mostConsumedFoodType ?? 'none'}
  Least rotating food type: ${patterns?.leastRotatingFoodType ?? 'none'}
  Overrepresented category: ${patterns?.overrepresentedCategory ?? 'none'}
  Underused category: ${patterns?.underusedCategory ?? 'none'}

TOP CATEGORIES WITH WASTE RATIO:
${categoryLines}

PRODUCTS OF CONCERN:
  ${productLine('Near expiry', products?.nearExpiryProducts)}
  ${productLine('Recently expired', products?.recentlyExpiredProducts)}
  ${productLine('Stale (no movement 30d)', products?.staleProducts)}`;
}

function validateBody(body: any): boolean {
  return (
    body &&
    body.signals &&
    body.activity &&
    body.patterns &&
    Array.isArray(body.inventory) &&
    body.products &&
    body.derived
  );
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

    if (!validateBody(body)) {
      res.status(400).json({ error: 'PAYLOAD_REQUIRED' });
      return;
    }

    logger.info('Insights analyze request', {
      userId,
      locale: body.locale,
      riskLevel: body.derived?.riskLevel,
    });

    const userMessage = buildUserMessage(body);

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

    // Unwrap common wrapper patterns: {"analysis":{...}} or {"data":{...}}
    if (!validateAnalysis(parsed)) {
      const inner = parsed?.analysis ?? parsed?.data ?? parsed?.result;
      if (inner && validateAnalysis(inner)) {
        parsed = inner;
      } else {
        logger.error('OpenAI response missing required keys', { userId, parsed: JSON.stringify(parsed).slice(0, 200) });
        res.status(500).json({ error: 'INVALID_RESPONSE' });
        return;
      }
    }

    const toStrings = (arr: any[]): string[] =>
      arr
        .map(i => (typeof i === 'string' ? i : i?.text ?? i?.insight ?? i?.content ?? JSON.stringify(i)))
        .filter((s): s is string => typeof s === 'string' && s.length > 0);

    res.json({
      analysis: {
        patterns: toStrings(parsed.patterns).slice(0, 2),
        problems: toStrings(parsed.problems).slice(0, 2),
        recommendations: toStrings(parsed.recommendations).slice(0, 2),
        suggestions: toStrings(parsed.suggestions).slice(0, 1),
        generatedAt: new Date().toISOString(),
      },
    });
  },
};
