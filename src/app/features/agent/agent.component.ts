import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, ViewChild, effect, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AgentMessage } from '@core/models';
import { AgentService } from '@core/services/agent.service';
import { RevenuecatService } from '@core/services/revenuecat.service';
import { IonContent, IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-agent',
  standalone: true,
  imports: [CommonModule, IonicModule, ReactiveFormsModule, TranslateModule],
  templateUrl: './agent.component.html',
  styleUrls: ['./agent.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentComponent implements OnDestroy {
  @ViewChild(IonContent, { static: false }) private content?: IonContent;
  private readonly agentService = inject(AgentService);
  private readonly revenuecat = inject(RevenuecatService);

  readonly messages = this.agentService.messages;
  readonly thinking = this.agentService.thinking;
  readonly isPro$ = this.revenuecat.isPro$;

  readonly messageControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)],
  });

  constructor() {
    effect(() => {
      // react to message updates and thinking indicator
      this.messages();
      this.thinking();
      // keep the chat pinned to the bottom when new messages arrive
      void this.scrollToBottom();
    });
  }

  trackById(_: number, message: AgentMessage): string {
    return message.id;
  }

  async send(): Promise<void> {
    const text = this.messageControl.value.trim();
    if (!text) {
      return;
    }
    this.messageControl.setValue('');
    await this.agentService.sendMessage(text);
    await this.scrollToBottom();
  }

  clearChat(): void {
    this.agentService.resetConversation();
    this.messageControl.setValue('');
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

  ngOnDestroy(): void {
    this.agentService.resetConversation();
  }
}
