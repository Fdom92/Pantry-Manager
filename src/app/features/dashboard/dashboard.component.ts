import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { DashboardStateService, type DashboardOverviewCardId } from '@core/services/dashboard/dashboard-state.service';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { InsightCardComponent } from '@shared/components/insight-card/insight-card.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonIcon,
    CommonModule,
    TranslateModule,
    InsightCardComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  providers: [DashboardStateService],
})
export class DashboardComponent {
  readonly facade = inject(DashboardStateService);

  /** Lifecycle hook: populate dashboard data and stamp the refresh time. */
  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }

  onSummaryCardClick(card: DashboardOverviewCardId): void {
    void this.facade.onOverviewCardSelected(card);
  }
}
