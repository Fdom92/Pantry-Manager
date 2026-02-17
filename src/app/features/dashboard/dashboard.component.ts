import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { DashboardStateService } from '@core/services/dashboard/dashboard-state.service';
import type { DashboardOverviewCardId } from '@core/models/dashboard/consume-today.model';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonIcon,
    IonSkeletonText,
    IonButton,
    CommonModule,
    TranslateModule,
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
