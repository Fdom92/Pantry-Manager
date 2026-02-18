import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, Component, ViewChild, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PlannerStateService } from '@core/services/planner/planner-state.service';
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
import { TranslateModule } from '@ngx-translate/core';
import { ViewWillEnter } from '@ionic/angular';
import { MarkdownToHtmlPipe } from '@core/pipes/markdown-to-html.pipe';

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
    RouterLink,
    ReactiveFormsModule,
    TranslateModule,
    MarkdownToHtmlPipe,
  ],
  templateUrl: './agent.component.html',
  styleUrls: ['./agent.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PlannerStateService],
})
export class AgentComponent implements ViewWillEnter, AfterViewInit {
  @ViewChild(IonContent, { static: false }) private content?: IonContent;
  @ViewChild(IonTextarea, { static: false }) private composerInput?: IonTextarea;

  readonly facade = inject(PlannerStateService);

  ngAfterViewInit(): void {
    this.facade.attachView(this.content, this.composerInput);
  }

  async ionViewWillEnter(): Promise<void> {
    this.facade.attachView(this.content, this.composerInput);
    await this.facade.ionViewWillEnter();
  }
}
