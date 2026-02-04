import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { DashboardStateService } from '@core/services/dashboard/dashboard-state.service';
import type { DashboardOverviewCardId } from '@core/models/dashboard/consume-today.model';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { InsightCardComponent } from '@shared/components/insight-card/insight-card.component';
import { EntitySelectorModalComponent } from '@shared/components/entity-selector-modal/entity-selector-modal.component';

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
    IonSkeletonText,
    CommonModule,
    TranslateModule,
    InsightCardComponent,
    EntitySelectorModalComponent,
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
