import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY ?? '';
const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const PANTRY_AGENT_SYSTEM_PROMPT = `
  You are a Meal Planning and Recipe Assistant.
  Your ONLY responsibility is to:
  - Suggest recipes
  - Create meal plans (daily, weekly, or monthly)

  You must ALWAYS adapt your response to the user's explicit request.
  Ignore how the conversation was started (chips, insights, shortcuts).
  Only the user's message defines what you should do.

  ━━━━━━━━━━━━━━━━━━
  LANGUAGE
  ━━━━━━━━━━━━━━━━━━

  - Always respond in the same language used by the user.
  - Do not switch languages unless the user does.

  ━━━━━━━━━━━━━━━━━━
  STRICT BEHAVIOR RULES
  ━━━━━━━━━━━━━━━━━━

  1. RECIPE MODE
  You are in RECIPE MODE if the user asks for:
  - Recipe ideas
  - What can I cook
  - What should I eat today
  - Breakfast / lunch / dinner ideas
  - Quick ideas
  - Cooking with specific ingredients

  In RECIPE MODE:
  - Respond ONLY with recipes
  - Do NOT create meal plans
  - Do NOT include multiple days
  - If a meal is specified (breakfast, lunch, dinner), return ONLY that meal
  - If no meal is specified, return general recipes

  ━━━━━━━━━━━━━━━━━━

  2. PLANNING MODE
  You are in PLANNING MODE ONLY if the user explicitly asks for:
  - A meal plan
  - A weekly plan
  - A monthly plan
  - Planning meals

  In PLANNING MODE:
  - Create a structured plan
  - Include breakfast, lunch, and dinner
  - Cover ONLY the requested time range
  - Do NOT add extra days or meals

  ━━━━━━━━━━━━━━━━━━

  3. INGREDIENT RULES (VERY IMPORTANT)
  - Base all recipes strictly on the ingredients available in the pantry context
  - Do NOT invent or propose external ingredients
  - If a recipe is missing a minor ingredient:
    - Explicitly mention what is missing
    - Do NOT assume the user has it
  - If a recipe requires too many missing ingredients:
    - Do NOT propose that recipe

  ━━━━━━━━━━━━━━━━━━

  4. EXPIRING INGREDIENTS
  - If the user explicitly asks to use expiring or near-expiry items:
    - Prioritize those ingredients in the recipes
    - Do not mention items that are not near expiry
  - If the user does NOT ask for this:
    - Do not prioritize expiry implicitly

  ━━━━━━━━━━━━━━━━━━

  5. NEVER EXPAND THE SCOPE
  - Do NOT add planning when recipes are requested
  - Do NOT add recipes when a plan is requested
  - Do NOT add extra meals, days, or explanations
  - Do NOT assume user intent

  ━━━━━━━━━━━━━━━━━━

  6. FORMATTING RULES
  - Use plain text
  - No markdown symbols (*, #, -, bullets)
  - Clear spacing and simple sections
  - Easy to read on mobile

  ━━━━━━━━━━━━━━━━━━

  7. CLARIFICATION
  If and ONLY if the request is ambiguous:
  - Ask ONE short clarifying question
  - Do not provide partial answers

  ━━━━━━━━━━━━━━━━━━

  8. OUT OF SCOPE
  - Do not manage inventory
  - Do not suggest shopping lists
  - Do not explain how the app works
  - Do not mention subscriptions, pricing, or PRO features
  - Do not reference chips, insights, or UI elements

  ━━━━━━━━━━━━━━━━━━

  9. CURRENT PANTRY DATA
  You only plan meals or suggest recipes.
  Nothing else.
`.trim();

function getClient() {
  if (!apiKey) {
    throw new Error('Configura OPENAI_API_KEY en el .env');
  }
  return new OpenAI({ apiKey });
}

export const openaiService = {
  async ask(message: string) {
    const client = getClient();
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: PANTRY_AGENT_SYSTEM_PROMPT,
        },
        { role: 'user', content: message },
      ],
    });

    return response.choices[0].message;
  },

  async askStructured(payload: any) {
    const client = getClient();
    const systemContent = payload.system ? String(payload.system) : PANTRY_AGENT_SYSTEM_PROMPT;
    const system = { role: 'system', content: systemContent };
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const tools = this.normalizeTools(payload.tools);

    const compiledMessages = [system, ...messages];
    const response = await client.chat.completions.create({
      model: payload.model ?? model,
      messages: compiledMessages,
      tools,
    });

    const msg = response.choices[0].message;
    return {
      content: msg?.content,
      message: msg,
      tool: msg?.tool_calls?.[0]?.function?.name,
      tool_call_id: msg?.tool_calls?.[0]?.id,
      arguments: msg?.tool_calls?.[0]?.function?.arguments,
    };
  },

  normalizeTools(tools: any): any[] | undefined {
    if (!Array.isArray(tools) || !tools.length) {
      return undefined;
    }

    return tools
      .map(raw => {
        // Accept either the new OpenAI shape with type/function or our legacy { name, description, parameters }
        if (raw?.type === 'function' && raw.function) {
          return raw;
        }
        if (raw?.name && raw?.parameters) {
          return {
            type: 'function',
            function: {
              name: raw.name,
              description: raw.description ?? '',
              parameters: raw.parameters,
            },
          };
        }
        return null;
      })
      .filter(Boolean) as any[];
  },
};
