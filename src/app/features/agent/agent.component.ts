import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AgentEntryContext, AgentMessage } from '@core/models/agent';
import { AgentService } from '@core/services/agent.service';
import { RevenuecatService } from '@core/services/revenuecat.service';
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

interface QuickPrompt {
  id: string;
  labelKey: string;
  context: AgentEntryContext;
  promptKey?: string;
}

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
  // DI
  private readonly agentService = inject(AgentService);
  private readonly revenuecat = inject(RevenuecatService);
  private readonly navCtrl = inject(NavController);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate = inject(TranslateService);
  private readonly canUseAgentState = signal(false);
  private readonly hasConversationStarted = signal(false);
  readonly shouldShowQuickStart = computed(() => this.canUseAgentState() && !this.hasConversationStarted());
  // Data
  readonly conversationMessages = this.agentService.messages;
  readonly isAgentProcessing = this.agentService.thinking;
  readonly agentExecutionPhase = this.agentService.agentPhase;
  readonly canRetryLastMessage = this.agentService.canRetry;
  readonly canUseAgent$ = this.revenuecat.canUseAgent$;
  readonly quickPrompts: QuickPrompt[] = [
    {
      id: 'cook-today',
      labelKey: 'agent.quickStart.today',
      context: AgentEntryContext.PLANNING,
    },
    {
      id: 'quick-ideas',
      labelKey: 'agent.quickStart.quickIdeas',
      context: AgentEntryContext.RECIPES,
    },
    {
      id: 'weekly-plan',
      labelKey: 'agent.quickStart.weeklyPlan',
      context: AgentEntryContext.PLANNING,
    },
    {
      id: 'use-expiring',
      labelKey: 'agent.quickStart.useExpiring',
      context: AgentEntryContext.DASHBOARD_INSIGHT,
    },
  ];
  // Form
  readonly composerControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)],
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
    const pendingInit = this.agentService.consumeConversationInit();
    if (!pendingInit) {
      if (!this.hasConversationStarted()) {
        this.agentService.setEntryContext(AgentEntryContext.PLANNING);
      }
      return;
    }
    if (!this.revenuecat.canUseAgent()) {
      await this.navigateToUpgrade();
      return;
    }
    this.agentService.setEntryContext(pendingInit.entryContext);
    if (!pendingInit.initialPrompt) {
      return;
    }
    this.markConversationStarted();
    await this.agentService.sendMessage(pendingInit.initialPrompt);
    await this.scrollToChatBottom();
  }

  trackById(_: number, message: AgentMessage): string {
    return message.id;
  }

  resetConversation(): void {
    this.agentService.resetConversation();
    this.composerControl.setValue('');
    this.hasConversationStarted.set(false);
    this.agentService.setEntryContext(AgentEntryContext.PLANNING);
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
    await this.agentService.sendMessage(message);
    await this.scrollToChatBottom();
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
    await this.agentService.retryLastUserMessage();
    await this.scrollToChatBottom();
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

  async triggerQuickPrompt(prompt: QuickPrompt): Promise<void> {
    if (!this.revenuecat.canUseAgent()) {
      await this.navigateToUpgrade();
      return;
    }
    this.agentService.setEntryContext(prompt.context);
    const message = this.translate.instant(prompt.promptKey ?? prompt.labelKey);
    if (!message) {
      return;
    }
    this.markConversationStarted();
    await this.agentService.sendMessage(message);
    await this.scrollToChatBottom();
  }

  private markConversationStarted(): void {
    if (!this.hasConversationStarted()) {
      this.hasConversationStarted.set(true);
    }
  }
}
