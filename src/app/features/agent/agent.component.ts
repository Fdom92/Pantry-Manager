import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, ViewChild, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AgentMessage } from '@core/models';
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
  readonly messages = this.agentService.messages;
  readonly thinking = this.agentService.thinking;
  readonly agentPhase = this.agentService.agentPhase;
  readonly canRetry = this.agentService.canRetry;
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
  readonly messageControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)],
  });

  constructor() {
    // Keep the composer enabled only for allowed users (PRO or override) to avoid template disabled binding warnings.
    this.canUseAgent$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isUnlocked => {
        if (isUnlocked) {
          this.messageControl.enable({ emitEvent: false });
        } else {
          this.messageControl.disable({ emitEvent: false });
          this.messageControl.setValue('', { emitEvent: false });
        }
      });

    effect(() => {
      // react to message updates and thinking indicator
      this.messages();
      this.thinking();
      // keep the chat pinned to the bottom when new messages arrive
      void this.scrollToBottom();
    });
  }

  ngOnDestroy(): void {
    this.agentService.resetConversation();
  }

  trackById(_: number, message: AgentMessage): string {
    return message.id;
  }

  clearChat(): void {
    this.agentService.resetConversation();
    this.messageControl.setValue('');
  }

  async send(): Promise<void> {
    if (!this.revenuecat.canUseAgent()) {
      await this.goToUpgrade();
      return;
    }
    const text = this.messageControl.value.trim();
    if (!text) {
      return;
    }
    this.messageControl.setValue('');
    await this.agentService.sendMessage(text);
    await this.scrollToBottom();
  }

  async scrollToBottom(): Promise<void> {
    if (!this.content) {
      return;
    }
    try {
      await this.content.scrollToBottom(200);
    } catch {
      // best-effort; ignore
    }
  }

  async goToUpgrade(): Promise<void> {
    await this.navCtrl.navigateForward('/upgrade');
  }

  async retry(): Promise<void> {
    if (!this.canRetry()) {
      return;
    }
    await this.agentService.retryLastUserMessage();
    await this.scrollToBottom();
  }
}
