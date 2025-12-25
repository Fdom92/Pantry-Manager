import { AgentMessage } from '@core/models/agent';

export function isVisibleAgentMessage(message: AgentMessage): boolean {
  if (message.uiHidden) {
    return false;
  }
  if (message.role === 'tool') {
    return false;
  }
  return true;
}

export function appendWithUserDedupe(history: AgentMessage[], message: AgentMessage): AgentMessage[] {
  if (message.role !== 'user') {
    return [...history, message];
  }
  if (!history.length) {
    return [...history, message];
  }
  const last = history[history.length - 1];
  if (
    last.role === message.role &&
    last.content === message.content &&
    !last.toolCalls?.length &&
    !message.toolCalls?.length
  ) {
    return [...history.slice(0, -1), message];
  }
  return [...history, message];
}

export function findLastUserMessageIndex(history: AgentMessage[]): number {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.role === 'user') {
      return i;
    }
  }
  return -1;
}
