import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, Component, ViewChild, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { AgentStateService } from '@core/services/agent';
import { IonBadge, IonButton, IonButtons, IonChip, IonContent, IonFooter, IonHeader, IonIcon, IonSpinner, IonTextarea, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { ViewWillEnter } from '@ionic/angular';

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
  providers: [AgentStateService],
})
export class AgentComponent implements ViewWillEnter, AfterViewInit {
  @ViewChild(IonContent, { static: false }) private content?: IonContent;
  @ViewChild(IonTextarea, { static: false }) private composerInput?: IonTextarea;

  readonly facade = inject(AgentStateService);

  ngAfterViewInit(): void {
    this.facade.attachView(this.content, this.composerInput);
  }

  async ionViewWillEnter(): Promise<void> {
    this.facade.attachView(this.content, this.composerInput);
    await this.facade.ionViewWillEnter();
  }
}
