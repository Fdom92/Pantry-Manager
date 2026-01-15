import { Injectable, inject } from '@angular/core';
import type { AgentConversationInit, AgentEntryContext, AgentMessage, AgentPhase } from '@core/models/agent';
import { RevenuecatService } from '../upgrade/revenuecat.service';
import { AgentConversationStore } from './agent-conversation.store';
import { MealPlannerAgentService } from './meal-planner-agent.service';

@Injectable({ providedIn: 'root' })
export class AgentStoreService {
  private readonly conversationStore = inject(AgentConversationStore);
  private readonly mealPlannerAgent = inject(MealPlannerAgentService);
  private readonly revenuecat = inject(RevenuecatService);

  readonly messages = this.conversationStore.messages;
  readonly thinking = this.conversationStore.thinking;
  readonly agentPhase = this.conversationStore.agentPhase;
  readonly canRetry = this.conversationStore.canRetry;
  readonly canUseAgent$ = this.revenuecat.canUseAgent$;

  canUseAgent(): boolean {
    return this.revenuecat.canUseAgent();
  }

  prepareConversation(init: { entryContext: AgentEntryContext; initialPrompt?: string | null }): void {
    const nextInit: AgentConversationInit = {
      entryContext: init.entryContext,
      initialPrompt: init.initialPrompt ?? undefined,
    };
    this.conversationStore.prepareConversation(nextInit);
  }

  consumeConversationInit(): AgentConversationInit | null {
    return this.conversationStore.consumeConversationInit();
  }

  setEntryContext(context: AgentEntryContext): void {
    this.conversationStore.setEntryContext(context);
  }

  resetConversation(): void {
    this.conversationStore.resetConversation();
  }

  createMessage(role: 'user' | 'assistant', content: string, status?: AgentMessage['status']): AgentMessage {
    return this.conversationStore.createMessage(role, content, status);
  }

  appendMessage(message: AgentMessage): void {
    this.conversationStore.appendMessage(message);
  }

  setRetryAvailable(value: boolean): void {
    this.conversationStore.setRetryAvailable(value);
  }

  setAgentPhase(phase: AgentPhase): void {
    this.conversationStore.setAgentPhase(phase);
  }

  getHistorySnapshot(): AgentMessage[] {
    return this.conversationStore.getHistorySnapshot();
  }

  setHistory(history: AgentMessage[]): void {
    this.conversationStore.setHistory(history);
  }

  async runAgent(userText: string): Promise<string> {
    return this.mealPlannerAgent.run(userText);
  }
}
