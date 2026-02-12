import type { PantryItem } from '../pantry';

// ENUMS
export enum AgentEntryContext {
  PLANNING = 'planning',
  RECIPES = 'recipes',
  INSIGHTS = 'insights',
  INSIGHTS_RECIPES = 'insights-recipes',
}

// TYPES
export type AgentRole = 'user' | 'assistant';
export type AgentPhase = 'idle' | 'thinking' | 'fetching' | 'responding';
export type QuickPromptBehavior = 'prompt' | 'composer';
export type LlmRole = 'system' | 'user' | 'assistant';

// INTERFACES
export interface QuickPrompt {
  id: string;
  labelKey: string;
  context?: AgentEntryContext;
  promptKey?: string;
  behavior?: QuickPromptBehavior;
}

export interface AgentConversationInit {
  entryContext: AgentEntryContext;
  initialPrompt?: string;
}
export interface AgentMessage {
  id: string;
  role: AgentRole;
  content: string;
  createdAt: string;
  status?: 'ok' | 'error';
  uiHidden?: boolean;
  data?: {
    summary?: string;
    details?: string[];
    items?: PantryItem[];
    item?: PantryItem;
  };
}
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
