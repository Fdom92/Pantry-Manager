import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, Validators } from '@angular/forms';
import { QUICK_PROMPTS, USER_PROMPT_MAXLENGTH } from '@core/constants';
import { trimToNull } from '@core/domain/agent';
import { AgentEntryContext } from '@core/models/agent';
import type { AgentMessage, QuickPrompt } from '@core/models/agent';
import { NavController } from '@ionic/angular';
import type { IonContent, IonTextarea } from '@ionic/angular/standalone';
import { TranslateService } from '@ngx-translate/core';
import { RevenuecatService } from '../upgrade/revenuecat.service';
import { AgentConversationStore } from './agent-conversation.store';
import { MealPlannerAgentService } from './meal-planner-agent.service';
import { findLastUserMessageIndex } from './conversation.utils';

@Injectable()
export class AgentStateService {
  private readonly conversationStore = inject(AgentConversationStore);
  private readonly mealPlannerAgent = inject(MealPlannerAgentService);
  private readonly revenuecat = inject(RevenuecatService);
  private readonly navCtrl = inject(NavController);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate = inject(TranslateService);

  private content?: IonContent;
  private composerInput?: IonTextarea;

  readonly conversationMessages = this.conversationStore.messages;
  readonly isAgentProcessing = this.conversationStore.thinking;
  readonly agentExecutionPhase = this.conversationStore.agentPhase;
  readonly canRetryLastMessage = this.conversationStore.canRetry;
  readonly canUseAgent$ = this.revenuecat.canUseAgent$;
  readonly quickPrompts = QUICK_PROMPTS;

  private readonly canUseAgentState = signal(false);
  private readonly hasConversationStarted = signal(false);

  readonly shouldShowQuickStart = computed(() => this.canUseAgentState() && !this.hasConversationStarted());

  readonly composerControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(USER_PROMPT_MAXLENGTH)],
  });

  constructor() {
    this.canUseAgent$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isUnlocked => {
        this.updateComposerAccess(isUnlocked);
        this.canUseAgentState.set(isUnlocked);
      });

    effect(() => {
      this.conversationMessages();
      this.isAgentProcessing();
      void this.scrollToChatBottom();
    });

    effect(() => {
      if (this.conversationMessages().length) {
        this.hasConversationStarted.set(true);
      }
    });
  }

  attachView(content?: IonContent, composerInput?: IonTextarea): void {
    this.content = content;
    this.composerInput = composerInput;
  }

  async ionViewWillEnter(): Promise<void> {
    const pendingInit = this.conversationStore.consumeConversationInit();
    if (!pendingInit) {
      if (!this.hasConversationStarted()) {
        this.conversationStore.setEntryContext(AgentEntryContext.PLANNING);
      }
      return;
    }
    if (!this.revenuecat.canUseAgent()) {
      await this.navigateToUpgrade();
      return;
    }
    this.conversationStore.setEntryContext(pendingInit.entryContext);
    if (!pendingInit.initialPrompt) {
      return;
    }
    this.markConversationStarted();
    await this.handlePlannerRequest(pendingInit.initialPrompt);
  }

  trackById(_: number, message: AgentMessage): string {
    return message.id;
  }

  resetConversation(): void {
    this.conversationStore.resetConversation();
    this.composerControl.setValue('');
    this.hasConversationStarted.set(false);
    this.conversationStore.setEntryContext(AgentEntryContext.PLANNING);
  }

  async sendMessage(): Promise<void> {
    if (!this.revenuecat.canUseAgent()) {
      await this.navigateToUpgrade();
      return;
    }
    const message = trimToNull(this.composerControl.value);
    if (!message) {
      return;
    }
    this.composerControl.setValue('');
    this.markConversationStarted();
    await this.handlePlannerRequest(message);
  }

  async scrollToChatBottom(): Promise<void> {
    if (!this.content) {
      return;
    }
    try {
      await this.content.scrollToBottom(200);
    } catch {
      // best-effort; ignore
    }
  }

  async navigateToUpgrade(): Promise<void> {
    await this.navCtrl.navigateForward('/upgrade');
  }

  async retryLastAttempt(): Promise<void> {
    if (!this.canRetryLastMessage()) {
      return;
    }
    const history = this.conversationStore.getHistorySnapshot();
    const lastUserIndex = findLastUserMessageIndex(history);
    if (lastUserIndex === -1) {
      return;
    }
    this.conversationStore.setHistory(history.slice(0, lastUserIndex + 1));
    await this.handlePlannerRequest(history[lastUserIndex].content, { appendUserMessage: false });
  }

  async triggerQuickPrompt(prompt: QuickPrompt): Promise<void> {
    if (!this.revenuecat.canUseAgent()) {
      await this.navigateToUpgrade();
      return;
    }
    if (prompt.behavior === 'composer') {
      this.prepareCustomPrompt();
      return;
    }
    this.conversationStore.setEntryContext(prompt.context ?? AgentEntryContext.PLANNING);
    const message = this.translate.instant(prompt.promptKey ?? prompt.labelKey);
    if (!message) {
      return;
    }
    this.markConversationStarted();
    await this.handlePlannerRequest(message);
  }

  private markConversationStarted(): void {
    if (!this.hasConversationStarted()) {
      this.hasConversationStarted.set(true);
    }
  }

  private async handlePlannerRequest(
    userText: string,
    options?: { appendUserMessage?: boolean }
  ): Promise<void> {
    const trimmed = trimToNull(userText);
    if (!trimmed) {
      return;
    }

    if (options?.appendUserMessage !== false) {
      const userMessage = this.conversationStore.createMessage('user', trimmed);
      this.conversationStore.appendMessage(userMessage);
      this.markConversationStarted();
    }

    this.conversationStore.setRetryAvailable(false);
    this.conversationStore.setAgentPhase('thinking');
    try {
      const response = await this.mealPlannerAgent.run(userText);
      this.conversationStore.setAgentPhase('responding');
      const assistantMessage = this.conversationStore.createMessage(
        'assistant',
        response || this.translate.instant('agent.messages.noResponse')
      );
      this.conversationStore.appendMessage(assistantMessage);
    } catch (err) {
      console.error('[AgentStateService] Meal planner run failed', err);
      const errorMessage = this.conversationStore.createMessage(
        'assistant',
        this.translate.instant('agent.messages.unifiedError'),
        'error'
      );
      this.conversationStore.appendMessage(errorMessage);
      this.conversationStore.setRetryAvailable(true);
    } finally {
      this.conversationStore.setAgentPhase('idle');
      await this.scrollToChatBottom();
    }
  }

  private prepareCustomPrompt(): void {
    this.conversationStore.setEntryContext(AgentEntryContext.PLANNING);
    this.markConversationStarted();
    this.focusComposerInput();
  }

  private focusComposerInput(): void {
    setTimeout(() => {
      void this.composerInput?.setFocus();
    });
  }

  private updateComposerAccess(isUnlocked: boolean): void {
    if (isUnlocked) {
      this.composerControl.enable({ emitEvent: false });
      return;
    }
    this.composerControl.disable({ emitEvent: false });
    this.composerControl.setValue('', { emitEvent: false });
  }
}
