import { Injectable, computed, signal } from '@angular/core';
import { AgentConversationInit, AgentEntryContext, AgentMessage, AgentPhase, AgentRole } from '@core/models/agent';
import { createDocumentId } from '@core/utils';

@Injectable({
  providedIn: 'root',
})
export class AgentConversationStore {
  private readonly historySignal = signal<AgentMessage[]>([]);
  private readonly thinkingSignal = signal(false);
  private readonly agentPhaseSignal = signal<AgentPhase>('idle');
  private readonly retryAvailableSignal = signal(false);
  private readonly entryContextSignal = signal<AgentEntryContext>(AgentEntryContext.PLANNING);
  private readonly pendingConversationInitSignal = signal<AgentConversationInit | null>(null);

  readonly messages = computed(() => this.historySignal().filter(message => this.isVisibleMessage(message)));
  readonly thinking = this.thinkingSignal.asReadonly();
  readonly agentPhase = computed(() => this.agentPhaseSignal());
  readonly canRetry = computed(() => this.retryAvailableSignal());
  readonly entryContext = computed(() => this.entryContextSignal());

  getHistorySnapshot(): AgentMessage[] {
    return this.historySignal();
  }

  setHistory(messages: AgentMessage[]): void {
    this.historySignal.set(messages);
  }

  updateHistory(updater: (history: AgentMessage[]) => AgentMessage[]): void {
    this.historySignal.update(updater);
  }

  appendMessage(message: AgentMessage, options?: { dedupe?: boolean }): void {
    const dedupe = options?.dedupe ?? true;
    this.historySignal.update(history =>
      dedupe ? this.appendWithoutDuplicate(history, message) : [...history, message]
    );
  }

  resetConversation(): void {
    this.historySignal.set([]);
    this.setAgentPhase('idle');
    this.setRetryAvailable(false);
    this.pendingConversationInitSignal.set(null);
  }

  setAgentPhase(phase: AgentPhase): void {
    this.agentPhaseSignal.set(phase);
    this.thinkingSignal.set(phase !== 'idle');
  }

  setRetryAvailable(value: boolean): void {
    this.retryAvailableSignal.set(value);
  }

  isRetryAvailable(): boolean {
    return this.retryAvailableSignal();
  }

  setEntryContext(context: AgentEntryContext): void {
    this.entryContextSignal.set(context);
  }

  getEntryContext(): AgentEntryContext {
    return this.entryContextSignal();
  }

  setPendingConversationInit(init: AgentConversationInit | null): void {
    this.pendingConversationInitSignal.set(init);
  }

  consumeConversationInit(): AgentConversationInit | null {
    const init = this.pendingConversationInitSignal();
    if (!init) {
      return null;
    }
    this.pendingConversationInitSignal.set(null);
    this.setEntryContext(init.entryContext);
    return init;
  }

  createMessage(role: AgentRole, content: string, status: AgentMessage['status'] = 'ok'): AgentMessage {
    return {
      id: createDocumentId('msg'),
      role,
      content,
      status,
      createdAt: new Date().toISOString(),
    };
  }

  private isVisibleMessage(message: AgentMessage): boolean {
    if (message.uiHidden) {
      return false;
    }
    if (message.role === 'tool') {
      return false;
    }
    return true;
  }

  private appendWithoutDuplicate(history: AgentMessage[], message: AgentMessage): AgentMessage[] {
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
}
