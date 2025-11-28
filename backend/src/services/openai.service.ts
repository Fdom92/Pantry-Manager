import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY ?? '';
const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

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
          content:
            'Eres un asistente que interpreta instrucciones para gestionar una despensa: mover productos, ajustar stock, añadir caducidades, generar recetas, etc.',
        },
        { role: 'user', content: message },
      ],
    });

    return response.choices[0].message;
  },

  async askStructured(payload: any) {
    const client = getClient();
    const system = payload.system
      ? { role: 'system', content: String(payload.system) }
      : null;
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const tools = this.normalizeTools(payload.tools);

    const compiledMessages = system ? [system, ...messages] : messages;
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
