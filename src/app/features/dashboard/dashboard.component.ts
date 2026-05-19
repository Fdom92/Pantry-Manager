import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardStateService } from '@core/services/dashboard/dashboard-state.service';
import type { DashboardOverviewCardId } from '@core/models/dashboard/consume-today.model';
import { BatchEditModalComponent } from './components/batch-edit-modal/batch-edit-modal.component';
import {
  IonButton,
  IonButtons,
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
    IonButtons,
    IonContent,
    IonIcon,
    IonSkeletonText,
    IonButton,
    CommonModule,
    RouterLink,
    TranslateModule,
    BatchEditModalComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  providers: [DashboardStateService],
})
export class DashboardComponent {
  readonly facade = inject(DashboardStateService);

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }

  onSummaryCardClick(card: DashboardOverviewCardId): void {
    void this.facade.onOverviewCardSelected(card);
  }

  shouldShowReason(): boolean {
    const s = this.facade.todaySuggestion();
    if (!s) return false;
    const { daysToExpiry, expirationDate } = s.protagonist;
    const timeOnlyReasons = new Set([
      'dashboard.today.reason.expiringsoon',
      'dashboard.today.reason.expirestoday',
    ]);
    if (expirationDate && timeOnlyReasons.has(s.reasonKey)) return false;
    return daysToExpiry === null || daysToExpiry <= 5;
  }
}
