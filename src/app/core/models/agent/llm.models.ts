export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmCompletionRequest {
  system: string;
  messages: LlmMessage[];
}

export interface LlmCompletionResponse {
  content: string;
}

export interface LlmClientError extends Error {
  status?: number;
  timeout?: boolean;
}
