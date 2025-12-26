import type { PantryItem } from '@core/models/inventory';
import type { RawToolCall } from './tooling.models';

export enum AgentEntryContext {
  PLANNING = 'planning',
  RECIPES = 'recipes',
  INSIGHTS = 'insights',
  INSIGHTS_RECIPES = 'insights-recipes',
}

export interface AgentConversationInit {
  entryContext: AgentEntryContext;
  initialPrompt?: string;
}

export type AgentRole = 'user' | 'assistant' | 'tool';
export type AgentPhase = 'idle' | 'thinking' | 'fetching' | 'responding';

export interface AgentMessage {
  id: string;
  role: AgentRole;
  content: string;
  createdAt: string;
  modelContent?: string;
  toolName?: string;
  toolCallId?: string;
  toolCalls?: RawToolCall[];
  status?: 'ok' | 'error';
  uiHidden?: boolean;
  data?: {
    summary?: string;
    details?: string[];
    items?: PantryItem[];
    item?: PantryItem;
  };
}
