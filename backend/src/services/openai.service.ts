import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY ?? '';
const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const OPENAI_TIMEOUT_MS = 18000; // 18s - before frontend (20s) and Render (30s)


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
  /**
   * Creates an OpenAI streaming response and returns an async iterable of text chunks.
   * The HTTP call to OpenAI happens eagerly so callers can catch auth/rate errors
   * before committing to SSE headers.
   */
  async createStream(payload: any): Promise<AsyncIterable<string>> {
    const client = getClient();
    const system = { role: 'system', content: String(payload.system) };
    const messages = Array.isArray(payload.messages) ? payload.messages : [];

    // This await makes the HTTP request to OpenAI — may throw 429, auth errors, etc.
    const openaiStream = await client.chat.completions.create({
      model: payload.model ?? model,
      messages: [system, ...messages],
      stream: true,
    });

    return (async function* () {
      for await (const chunk of openaiStream) {
        const text = chunk.choices[0]?.delta?.content ?? '';
        if (text) yield text;
      }
    })();
  },
};
