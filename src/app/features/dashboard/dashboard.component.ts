import { CommonModule } from '@angular/common';
import { Component, OnDestroy, ViewChild, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardStateService } from '@core/services/dashboard/dashboard-state.service';
import { InsightsStateService } from '@core/services/insights/insights-state.service';
import type { DashboardOverviewCardId } from '@core/models/dashboard/consume-today.model';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ReconsentSheetComponent } from '@shared/components/reconsent-sheet/reconsent-sheet.component';
import { BatchEditModalComponent } from './components/batch-edit-modal/batch-edit-modal.component';
import { WasteTrackerCardComponent } from '@shared/components/waste-tracker-card/waste-tracker-card.component';
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
    EmptyStateComponent,
    ReconsentSheetComponent,
    WasteTrackerCardComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  providers: [DashboardStateService, InsightsStateService],
})
export class DashboardComponent implements OnDestroy {
  readonly facade = inject(DashboardStateService);
  private readonly insights = inject(InsightsStateService);
  readonly wasteSummary = this.insights.wasteSummary;
  readonly isInsightsPro = this.insights.isPro;
  @ViewChild(ReconsentSheetComponent) private reconsentSheet?: ReconsentSheetComponent;

  /** Guard so the re-consent sheet is evaluated only once per visit session. */
  private reconsentEvaluated = false;
  /** Timer handle so we can cancel if the user navigates away mid-delay. */
  private reconsentTimer: ReturnType<typeof setTimeout> | null = null;
  /** Tracks whether the dashboard is currently the visible page. */
  private isViewActive = false;

  async ionViewWillEnter(): Promise<void> {
    this.isViewActive = true;
    await this.facade.ionViewWillEnter();
    await this.insights.loadEvents();
    this.insights.trackWasteCardViewed('dashboard');
    this.maybePresentReconsentSheet();
  }

  ionViewWillLeave(): void {
    this.isViewActive = false;
    this.cancelReconsentTimer();
  }

  ngOnDestroy(): void {
    this.cancelReconsentTimer();
  }

  /**
   * Defer the prompt by a short delay so the dashboard animates in first.
   * One-shot per visit; deeper protection lives in `ReconsentPromptService`
   * (`RECONSENT_SHOWN` localStorage flag, one-shot per install). The timer is
   * cancelled if the user navigates away before it fires — otherwise the
   * sheet could pop while the user is on a different tab.
   */
  private maybePresentReconsentSheet(): void {
    if (this.reconsentEvaluated) return;
    this.reconsentEvaluated = true;
    this.reconsentTimer = setTimeout(() => {
      this.reconsentTimer = null;
      if (!this.isViewActive) return;
      void this.reconsentSheet?.maybePresent();
    }, 1500);
  }

  private cancelReconsentTimer(): void {
    if (this.reconsentTimer != null) {
      clearTimeout(this.reconsentTimer);
      this.reconsentTimer = null;
    }
  }

  onSummaryCardClick(card: DashboardOverviewCardId): void {
    void this.facade.onOverviewCardSelected(card);
  }

  shouldShowReason(): boolean {
    // Spec invariant: reason is ALWAYS shown when a suggestion is active.
    // The contextual text ("Caduca hoy", "Caduca pronto", "En revisión"…)
    // helps the user understand why this item is being surfaced right now.
    return !!this.facade.todaySuggestion();
  }
}
