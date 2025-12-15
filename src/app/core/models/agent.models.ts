import type { PantryItem, ItemBatch } from '@core/models';

export type AgentRole = 'user' | 'assistant' | 'tool';
export type AgentPhase = 'idle' | 'thinking' | 'fetching' | 'responding';

export type AgentModelCallError = Error & {
  status?: number;
  userMessage?: string;
  timeout?: boolean;
};

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

export interface AgentToolCall {
  id?: string;
  name: string;
  arguments: Record<string, any>;
}

export interface RawToolCall {
  id?: string;
  type?: 'function';
  name?: string;
  arguments?: string | Record<string, any>;
  function?: {
    name?: string;
    arguments?: string | Record<string, any>;
  };
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface AgentModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: RawToolCall[];
}

export interface AgentModelRequest {
  system: string;
  messages: AgentModelMessage[];
  tools: AgentToolDefinition[];
  context?: Record<string, any>;
}

export interface AgentModelResponse {
  content?: string;
  message?: {
    content?: string;
    tool_call_id?: string;
    toolCalls?: RawToolCall[];
    tool_calls?: RawToolCall[];
  };
  tool?: string;
  tool_call_id?: string;
  arguments?: any;
  error?: string;
}

export interface ToolExecution {
  tool: string;
  success: boolean;
  message: AgentMessage;
}

export interface MoveBatchesResult {
  moved: ItemBatch[];
  remaining: ItemBatch[];
}
