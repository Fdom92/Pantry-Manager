import { Injectable, computed, signal } from '@angular/core';
import { AgentConversationInit, AgentEntryContext, AgentMessage, AgentPhase, AgentRole } from '@core/models/agent';
import { createDocumentId } from '@core/utils';
import { appendWithUserDedupe, isVisibleAgentMessage } from './conversation.utils';

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

  readonly messages = computed(() => this.historySignal().filter(message => isVisibleAgentMessage(message)));
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
      dedupe ? appendWithUserDedupe(history, message) : [...history, message]
    );
  }

  resetConversation(): void {
    this.historySignal.set([]);
    this.setAgentPhase('idle');
    this.setRetryAvailable(false);
    this.pendingConversationInitSignal.set(null);
  }

  prepareConversation(init: AgentConversationInit): void {
    this.resetConversation();
    this.setEntryContext(init.entryContext);
    this.setPendingConversationInit(init);
  }

  setAgentPhase(phase: AgentPhase): void {
    this.agentPhaseSignal.set(phase);
    this.thinkingSignal.set(phase !== 'idle');
  }

  setRetryAvailable(value: boolean): void {
    this.retryAvailableSignal.set(value);
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

}
