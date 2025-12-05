import type { PantryItem, ItemBatch } from '@core/models';

export type AgentRole = 'user' | 'assistant' | 'tool';

export interface AgentMessage {
  id: string;
  role: AgentRole;
  content: string;
  createdAt: string;
  modelContent?: string;
  toolName?: string;
  toolCallId?: string;
  toolCalls?: any[];
  status?: 'ok' | 'error';
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

export type RawToolCall =
  | AgentToolCall
  | {
      id?: string;
      function?: { name: string; arguments?: string | Record<string, any> };
      name?: string;
      arguments?: string | Record<string, any>;
    };

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
  tool_calls?: any[];
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
    toolCalls?: AgentToolCall[];
    tool_calls?: Array<{
      id?: string;
      function?: { name: string; arguments?: string | Record<string, any> };
    }>;
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
