import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { QUICK_PROMPTS, USER_PROMPT_MAXLENGTH } from '@core/constants';
import { AgentEntryContext, AgentMessage, QuickPrompt } from '@core/models/agent';
import { AgentConversationStore, MealPlannerAgentService, findLastUserMessageIndex } from '@core/services';
import { RevenuecatService } from '@core/services/upgrade';
import { NavController, ViewWillEnter } from '@ionic/angular';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-agent',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonBadge,
    IonIcon,
    IonContent,
    IonSpinner,
    IonFooter,
    IonChip,
    IonTextarea,
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
  ],
  templateUrl: './agent.component.html',
  styleUrls: ['./agent.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentComponent implements ViewWillEnter {
  @ViewChild(IonContent, { static: false }) private content?: IonContent;
  @ViewChild(IonTextarea, { static: false }) private composerInput?: IonTextarea;
  // DI
  private readonly conversationStore = inject(AgentConversationStore);
  private readonly mealPlannerAgent = inject(MealPlannerAgentService);
  private readonly revenuecat = inject(RevenuecatService);
  private readonly navCtrl = inject(NavController);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate = inject(TranslateService);
  // DATA
  readonly conversationMessages = this.conversationStore.messages;
  readonly isAgentProcessing = this.conversationStore.thinking;
  readonly agentExecutionPhase = this.conversationStore.agentPhase;
  readonly canRetryLastMessage = this.conversationStore.canRetry;
  readonly canUseAgent$ = this.revenuecat.canUseAgent$;
  readonly quickPrompts = QUICK_PROMPTS;
  // SIGNALS
  private readonly canUseAgentState = signal(false);
  private readonly hasConversationStarted = signal(false);
  // COMPUTED
  readonly shouldShowQuickStart = computed(() => this.canUseAgentState() && !this.hasConversationStarted());
  // FORM
  readonly composerControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(USER_PROMPT_MAXLENGTH)],
  });

  constructor() {
    // Keep the composer enabled only for allowed users (PRO or override) to avoid template disabled binding warnings.
    this.canUseAgent$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isUnlocked => {
        this.updateComposerAccess(isUnlocked);
        this.canUseAgentState.set(isUnlocked);
      });

    effect(() => {
      // react to message updates and thinking indicator
      this.conversationMessages();
      this.isAgentProcessing();
      // keep the chat pinned to the bottom when new messages arrive
      void this.scrollToChatBottom();
    });

    effect(() => {
      if (this.conversationMessages().length) {
        this.hasConversationStarted.set(true);
      }
    });
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
    const message = this.getTrimmedComposerValue();
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
    const trimmed = userText?.trim();
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
      const assistantMessage = this.conversationStore.createMessage('assistant', response || this.translate.instant('agent.messages.noResponse'));
      this.conversationStore.appendMessage(assistantMessage);
    } catch (err) {
      console.error('[AgentComponent] Meal planner run failed', err);
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

  private getTrimmedComposerValue(): string | null {
    const value = this.composerControl.value.trim();
    return value || null;
  }
}
