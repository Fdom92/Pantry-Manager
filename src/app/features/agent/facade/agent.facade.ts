import { Injectable, inject } from '@angular/core';
import type { AgentMessage, QuickPrompt } from '@core/models/agent';
import { AgentStateService } from '@core/services/agent';
import type { IonContent, IonTextarea } from '@ionic/angular/standalone';

@Injectable()
export class AgentFacade {
  private readonly state = inject(AgentStateService);

  readonly conversationMessages = this.state.conversationMessages;
  readonly isAgentProcessing = this.state.isAgentProcessing;
  readonly agentExecutionPhase = this.state.agentExecutionPhase;
  readonly canRetryLastMessage = this.state.canRetryLastMessage;
  readonly canUseAgent$ = this.state.canUseAgent$;
  readonly quickPrompts = this.state.quickPrompts;
  readonly shouldShowQuickStart = this.state.shouldShowQuickStart;
  readonly composerControl = this.state.composerControl;

  attachView(content?: IonContent, composerInput?: IonTextarea): void {
    this.state.attachView(content, composerInput);
  }

  async ionViewWillEnter(): Promise<void> {
    await this.state.ionViewWillEnter();
  }

  trackById(index: number, message: AgentMessage): string {
    return this.state.trackById(index, message);
  }

  resetConversation(): void {
    this.state.resetConversation();
  }

  async sendMessage(): Promise<void> {
    await this.state.sendMessage();
  }

  async navigateToUpgrade(): Promise<void> {
    await this.state.navigateToUpgrade();
  }

  async retryLastAttempt(): Promise<void> {
    await this.state.retryLastAttempt();
  }

  async triggerQuickPrompt(prompt: QuickPrompt): Promise<void> {
    await this.state.triggerQuickPrompt(prompt);
  }
}

