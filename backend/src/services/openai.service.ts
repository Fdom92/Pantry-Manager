import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY ?? '';
const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const OPENAI_TIMEOUT_MS = 35000; // 35s - within frontend (45s) and Render boot budget


// Singleton client
let clientInstance: OpenAI | null = null;

function getClient(): OpenAI {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  if (!clientInstance) {
    clientInstance = new OpenAI({
      apiKey,
      timeout: OPENAI_TIMEOUT_MS,
      maxRetries: 1, // Only 1 retry to stay within time budget
    });
  }

  return clientInstance;
}

export const openaiService = {
  async createCompletion(payload: { system: string; userMessage: string }): Promise<string> {
    const client = getClient();
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: String(payload.system) },
        { role: 'user', content: String(payload.userMessage) },
      ],
      response_format: { type: 'json_object' },
      stream: false,
    });
    return response.choices[0]?.message?.content ?? '{}';
  },
};
