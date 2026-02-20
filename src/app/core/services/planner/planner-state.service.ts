import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, Validators } from '@angular/forms';
import { QUICK_PROMPTS, USER_PROMPT_MAX_LENGTH } from '@core/constants';
import { AgentEntryContext } from '@core/models/agent';
import type { AgentMessage, LlmMessage, LlmRole, QuickPrompt } from '@core/models/agent';
import { normalizeOptionalTrim } from '@core/utils/normalization.util';
import { NavController } from '@ionic/angular';
import type { IonContent, IonTextarea } from '@ionic/angular/standalone';
import { TranslateService } from '@ngx-translate/core';
import { UpgradeRevenuecatService } from '../upgrade/upgrade-revenuecat.service';
import { PlannerConversationStore } from './planner-conversation.store';
import { PlannerAgentService } from './planner-agent.service';
import { PlannerLlmClientService } from './planner-llm-client.service';
import { NetworkService } from '../shared/network.service';
import { createLatestOnlyRunner } from '@core/utils';

@Injectable()
export class PlannerStateService {
  private readonly conversationStore = inject(PlannerConversationStore);
  private readonly mealPlannerAgent = inject(PlannerAgentService);
  private readonly llmClient = inject(PlannerLlmClientService);
  private readonly revenuecat = inject(UpgradeRevenuecatService);
  private readonly networkService = inject(NetworkService);
  private readonly navCtrl = inject(NavController);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate = inject(TranslateService);
  private readonly requestTask = createLatestOnlyRunner(this.destroyRef);

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
  readonly hasActiveConversation = computed(() => this.hasConversationStarted());

  readonly composerControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(USER_PROMPT_MAX_LENGTH)],
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.requestTask.cancel();
      this.conversationStore.setAgentPhase('idle');
      this.conversationStore.setRetryAvailable(false);
    });

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
    // Preheat backend to avoid cold start (fire and forget)
    if (this.revenuecat.canUseAgent()) {
      void this.llmClient.preheatBackend();
    }

    const pendingInit = this.conversationStore.consumeConversationInit();
    if (!pendingInit) {
      if (!this.hasConversationStarted()) {
        this.conversationStore.setEntryContext(AgentEntryContext.PLANNING);
      }
      return;
    }
    if (!(await this.ensureAgentAccess())) {
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

  async sendMessage(): Promise<void> {
    if (!(await this.ensureAgentAccess())) {
      return;
    }

    // Check network connection before sending
    if (!this.networkService.checkConnection()) {
      const offlineMessage = this.conversationStore.createMessage(
        'assistant',
        this.translate.instant('agent.errors.offline'),
        'error'
      );
      this.conversationStore.appendMessage(offlineMessage);
      return;
    }

    const message = normalizeOptionalTrim(this.composerControl.value);
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

  clearConversation(): void {
    this.requestTask.cancel();
    this.conversationStore.resetConversation();
    this.hasConversationStarted.set(false);
  }

  async navigateToUpgrade(): Promise<void> {
    await this.navCtrl.navigateForward('/upgrade');
  }

  async retryLastAttempt(): Promise<void> {
    if (!this.canRetryLastMessage()) {
      return;
    }
    const history = this.conversationStore.getHistorySnapshot();
    const lastUserIndex = this.conversationStore.findLastUserMessageIndex(history);
    if (lastUserIndex === -1) {
      return;
    }
    this.conversationStore.setHistory(history.slice(0, lastUserIndex + 1));
    await this.handlePlannerRequest(history[lastUserIndex].content, { appendUserMessage: false });
  }

  async selectQuickPrompt(prompt: QuickPrompt): Promise<void> {
    if (!(await this.ensureAgentAccess())) {
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
    const trimmed = normalizeOptionalTrim(userText);
    if (!trimmed) {
      return;
    }

    await this.requestTask.run(async isActive => {
      if (options?.appendUserMessage !== false) {
        const userMessage = this.conversationStore.createMessage('user', trimmed);
        this.conversationStore.appendMessage(userMessage);
        this.markConversationStarted();
      }

      // Build conversation history for multi-turn context (read after user message is appended)
      const llmMessages: LlmMessage[] = this.conversationStore
        .getHistorySnapshot()
        .filter(m => !m.uiHidden && m.status !== 'error')
        .map(m => ({ role: m.role as LlmRole, content: m.content }));

      this.conversationStore.setRetryAvailable(false);
      this.conversationStore.setAgentPhase('thinking');

      let streamMsgId: string | null = null;
      let accumulated = '';

      try {
        for await (const chunk of this.mealPlannerAgent.stream(llmMessages)) {
          if (!isActive()) return;

          if (!streamMsgId) {
            // Append the streaming placeholder on first chunk
            this.conversationStore.setAgentPhase('responding');
            const msg = this.conversationStore.createMessage('assistant', '');
            streamMsgId = msg.id;
            this.conversationStore.appendMessage(msg, { dedupe: false });
          }

          accumulated += chunk;
          this.conversationStore.updateMessageContent(streamMsgId, accumulated);
        }

        if (!streamMsgId) {
          // Stream completed with no content
          const noResponse = this.conversationStore.createMessage(
            'assistant',
            this.translate.instant('agent.messages.noResponse')
          );
          this.conversationStore.appendMessage(noResponse);
        }
      } catch (err: any) {
        if (!isActive()) return;

        console.error('[PlannerStateService] Meal planner stream failed', err);
        const errorText = this.getErrorMessage(err);

        if (!streamMsgId) {
          // Error before any content arrived — show error message
          const errorMessage = this.conversationStore.createMessage('assistant', errorText, 'error');
          this.conversationStore.appendMessage(errorMessage);
        }
        // If error mid-stream, leave whatever content arrived
        this.conversationStore.setRetryAvailable(true);
      } finally {
        if (isActive()) {
          this.conversationStore.setAgentPhase('idle');
          await this.scrollToChatBottom();
        }
      }
    });
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

  private async ensureAgentAccess(): Promise<boolean> {
    if (this.revenuecat.canUseAgent()) {
      return true;
    }
    await this.navigateToUpgrade();
    return false;
  }

  private updateComposerAccess(isUnlocked: boolean): void {
    if (isUnlocked) {
      this.composerControl.enable({ emitEvent: false });
      return;
    }
    this.composerControl.disable({ emitEvent: false });
    this.composerControl.setValue('', { emitEvent: false });
  }

  /**
   * Get user-friendly error message based on error type (for mobile UX)
   */
  private getErrorMessage(err: any): string {
    // Cold start timeout
    if (err?.message === 'COLD_START_TIMEOUT') {
      return this.translate.instant('agent.errors.coldStart');
    }

    // Rate limit exceeded
    if (err?.status === 429) {
      return this.translate.instant('agent.errors.rateLimit');
    }

    // Timeout
    if (err?.timeout || err?.name === 'TimeoutError') {
      return this.translate.instant('agent.errors.timeout');
    }

    // Offline (shouldn't happen as we check before, but just in case)
    if (!this.networkService.checkConnection()) {
      return this.translate.instant('agent.errors.offline');
    }

    // Generic error
    return this.translate.instant('agent.errors.generic');
  }
}
