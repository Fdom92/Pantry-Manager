import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, ViewChild, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AgentMessage } from '@core/models/agent';
import { AgentService } from '@core/services/agent.service';
import { RevenuecatService } from '@core/services/revenuecat.service';
import { NavController } from '@ionic/angular';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

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
    IonTextarea,
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
  ],
  templateUrl: './agent.component.html',
  styleUrls: ['./agent.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentComponent implements OnDestroy {
  @ViewChild(IonContent, { static: false }) private content?: IonContent;
  // DI
  private readonly agentService = inject(AgentService);
  private readonly revenuecat = inject(RevenuecatService);
  private readonly navCtrl = inject(NavController);
  private readonly destroyRef = inject(DestroyRef);
  // Data
  readonly conversationMessages = this.agentService.messages;
  readonly isAgentProcessing = this.agentService.thinking;
  readonly agentExecutionPhase = this.agentService.agentPhase;
  readonly canRetryLastMessage = this.agentService.canRetry;
  readonly canUseAgent$ = this.revenuecat.canUseAgent$;
  readonly previewMessages: AgentMessage[] = [
    {
      id: 'preview-user',
      role: 'user',
      content: 'Quiero ver los caducados',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'preview-agent',
      role: 'assistant',
      content: 'Respuesta bloqueada · Disponible en PRO',
      createdAt: new Date().toISOString(),
      status: 'error',
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
      .subscribe(isUnlocked => this.updateComposerAccess(isUnlocked));

    effect(() => {
      // react to message updates and thinking indicator
      this.conversationMessages();
      this.isAgentProcessing();
      // keep the chat pinned to the bottom when new messages arrive
      void this.scrollToChatBottom();
    });
  }

  ngOnDestroy(): void {
    this.agentService.resetConversation();
  }

  trackById(_: number, message: AgentMessage): string {
    return message.id;
  }

  resetConversation(): void {
    this.agentService.resetConversation();
    this.composerControl.setValue('');
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
}
