import { Request, Response } from 'express';
import { openaiService } from '../services/openai.service.js';
import { logger } from '../utils/logger.js';

const SYSTEM_PROMPT = `You are a domestic intelligence system that analyzes pantry behavior. You state facts. You do not summarize dashboards.

The backend has pre-computed all signals. Your only job: phrase them in the user's language following the section rules below.

═══ SECTION ROLES — each section answers ONE question ═══

PATTERNS  → "What is happening?" — structural behavior facts, dominant categories, consumption distribution
PROBLEMS  → "What is failing?" — waste, stagnation, expiry risk, clear imbalances
RECOMMENDATIONS → "What should change?" — concrete single actions, no diagnosis repetition
SUGGESTIONS → "One strategic improvement" — optional, only if genuinely useful

═══ ANTI-DUPLICATION LAW ═══
If a topic appears in PATTERNS it must NOT reappear in PROBLEMS or RECOMMENDATIONS.
If a topic appears in PROBLEMS it must NOT reappear in RECOMMENDATIONS.
Before writing each item: check — did I already say this? If yes, skip it.
Each item must introduce information not present in any other item.

═══ FORBIDDEN LANGUAGE ═══
Hedging words — forbidden in ALL languages:
  ES: puede, podría, sugiere, parece, quizás, es posible, posiblemente
  EN: may, might, could, seems, suggests, possibly, perhaps
  DE: könnte, möglicherweise, vielleicht, scheint, schlägt vor
  FR: peut, pourrait, semble, suggère, peut-être, il est possible
  IT: potrebbe, sembra, suggerisce, forse, è possibile
  PT: pode, poderia, sugere, parece, talvez, é possível

Consultant/passive style — forbidden in ALL languages:
  ES: "es necesario", "se debe", "se recomienda", "se sugiere"
  EN: "it is recommended", "one should", "it is necessary"
  DE: "es ist notwendig", "es wird empfohlen", "sollte man"
  FR: "il est nécessaire", "il est recommandé", "on devrait"
  IT: "è necessario", "si consiglia", "si dovrebbe"
  PT: "é necessário", "recomenda-se", "deve-se"

Also forbidden across all languages:
- Psychological causes: do not explain WHY users behave a certain way
- Dietary/nutritional advice
- Raw metric repetition: do not repeat counts, percentages, or ratios from the input

═══ REQUIRED STYLE ═══
- Short declarative sentences — max 12 words each
- Direct verbs: "Reducir", "Aumentar", "Mejorar", "Revisar" — not "Se debería reducir"
- One idea per sentence
- If signals are balanced with no real issue: state that the pantry shows balanced behavior — do not invent problems. Write this in the RESPONSE LANGUAGE.

═══ STYLE EXAMPLES (shown in Spanish — same rules apply in every language) ═══
BAD PATTERN: "Las proteínas podrían estar dominando la despensa, lo que puede llevar a un desequilibrio."
GOOD PATTERN: "Las proteínas concentran la mayor parte del inventario activo."

BAD PROBLEM: "Se detecta que los lácteos no se consumen con la frecuencia adecuada."
GOOD PROBLEM: "Los lácteos acumulan el mayor desperdicio relativo."

BAD RECOMMENDATION: "Se recomienda prestar atención al consumo de frutas y verduras para mejorar la rotación."
GOOD RECOMMENDATION: "Aumentar el consumo de frutas antes de añadir nuevas unidades."

═══ SELF-VALIDATION (do this before returning) ═══
1. Does any topic repeat across sections? → remove it from the later section
2. Does any sentence contain a forbidden word? → rewrite it
3. Does any sentence restate a raw number from the input? → remove it
4. Does each section answer only its assigned question? → verify

OUTPUT: Return ONLY valid JSON with no text outside it:
{"patterns":[],"problems":[],"recommendations":[],"suggestions":[]}

Each array item: one plain string sentence, no nested objects.
Write ALL strings in the language specified by RESPONSE LANGUAGE at the top of the user message.

LIMITS: max 2 patterns, max 2 problems (0 valid), max 2 recommendations, max 1 suggestion (0 valid)`;

const LOCALE_TO_LANGUAGE: Record<string, string> = {
  es: 'Spanish',
  en: 'English',
  de: 'German',
  fr: 'French',
  it: 'Italian',
  pt: 'Portuguese',
};

function buildUserMessage(body: any): string {
  const { locale, activity, patterns, inventory, products, derived } = body;
  const language = LOCALE_TO_LANGUAGE[locale as string] ?? 'English';
  const pct = (v: number | null | undefined): string =>
    v == null ? '?' : `${(v * 100).toFixed(0)}%`;

  const cats: any[] = Array.isArray(inventory) ? inventory : [];
  const productLine = (label: string, names: string[]) =>
    `${label}: ${names?.length ? names.join(', ') : 'none'}`;

  const categoryLines = cats.length > 0
    ? cats.map((c: any) =>
        `  - ${c.foodType}: rotation=${c.rotationScore ?? '?'}, waste_ratio=${pct(c.expiredRatio)}, consumption_share=${pct(c.consumptionShare)}`
      ).join('\n')
    : '  - no category data';

  return `RESPONSE LANGUAGE: ${language} — ALL string values in your JSON MUST be written in ${language}.

INVENTORY PROFILE:
  Balance: ${derived?.inventoryBalanceScore ?? 'unknown'}
  Risk: ${derived?.riskLevel ?? 'unknown'}
  Waste trend: ${derived?.wasteTrend ?? 'unknown'}
  Inventory trend: ${derived?.inventoryTrend ?? 'unknown'}

CATEGORY SIGNALS (pre-computed, sorted by inventory size):
${categoryLines}

KEY PATTERNS (pre-computed by backend — use these directly):
  Dominant waste category: ${patterns?.mostWastefulFoodType ?? 'none'}
  Most consumed category: ${patterns?.mostConsumedFoodType ?? 'none'}
  Least rotating category: ${patterns?.leastRotatingFoodType ?? 'none'}
  Overrepresented category: ${patterns?.overrepresentedCategory ?? 'none'}
  Underused category (0 consumption): ${patterns?.underusedCategory ?? 'none'}

ACTIVITY (last 30 days):
  Net flow: ${activity?.inventoryDelta ?? 'unknown'} (added=${activity?.addedCount ?? 0}, consumed=${activity?.consumedCount ?? 0}, expired=${activity?.expiredCount ?? 0})

PRODUCTS OF CONCERN:
  ${productLine('Near expiry', products?.nearExpiryProducts)}
  ${productLine('Recently expired', products?.recentlyExpiredProducts)}
  ${productLine('No movement 30d', products?.staleProducts)}`;
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

function normalizeAnalysis(raw: any): Record<string, string[]> | null {
  const candidate = raw?.analysis ?? raw?.data ?? raw?.result ?? raw;
  if (!candidate || typeof candidate !== 'object') return null;
  const toArr = (v: unknown): string[] => (Array.isArray(v) ? v : []);
  return {
    patterns: toArr(candidate.patterns),
    problems: toArr(candidate.problems),
    recommendations: toArr(candidate.recommendations),
    suggestions: toArr(candidate.suggestions),
  };
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

    const normalized = normalizeAnalysis(parsed);
    if (!normalized) {
      logger.error('OpenAI response unparseable structure', { userId, parsed: JSON.stringify(parsed).slice(0, 200) });
      res.status(500).json({ error: 'INVALID_RESPONSE' });
      return;
    }

    const toStrings = (arr: any[]): string[] =>
      arr
        .map(i => (typeof i === 'string' ? i : i?.text ?? i?.insight ?? i?.content ?? JSON.stringify(i)))
        .filter((s): s is string => typeof s === 'string' && s.length > 0);

    res.json({
      analysis: {
        patterns: toStrings(normalized.patterns).slice(0, 2),
        problems: toStrings(normalized.problems).slice(0, 2),
        recommendations: toStrings(normalized.recommendations).slice(0, 2),
        suggestions: toStrings(normalized.suggestions).slice(0, 1),
        generatedAt: new Date().toISOString(),
      },
    });
  },
};
