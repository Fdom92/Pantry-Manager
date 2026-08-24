import { CommonModule } from '@angular/common';
import { Component, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NavController } from '@ionic/angular/standalone';
import { PantryNavigationPresetService } from '@core/services/pantry/pantry-navigation-preset.service';
import { DashboardStateService } from '@core/services/dashboard/dashboard-state.service';
import type { DashboardAction } from '@core/services/dashboard/dashboard-state.service';
import { InsightsStateService } from '@core/services/insights/insights-state.service';
import { InsightsTrackingStateService } from '@core/services/insights/insights-tracking-state.service';
import type { DashboardOverviewCardId } from '@core/models/dashboard/consume-today.model';
import type { RepositionPrediction } from '@core/domain/insights/reposition.domain';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ReconsentSheetComponent } from '@shared/components/reconsent-sheet/reconsent-sheet.component';
import { BatchEditModalComponent } from './components/batch-edit-modal/batch-edit-modal.component';
import { RepositionCardComponent } from '@shared/components/reposition-card/reposition-card.component';
import { ProPaywallCardComponent } from '@shared/components/pro-paywall-card/pro-paywall-card.component';
import { StreakCardComponent } from './components/streak-card/streak-card.component';
import { WasteTeaserCardComponent } from './components/waste-teaser-card/waste-teaser-card.component';
import { ToastService } from '@core/services/shared';
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
    RepositionCardComponent,
    ProPaywallCardComponent,
    StreakCardComponent,
    WasteTeaserCardComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  providers: [DashboardStateService, InsightsStateService],
})
export class DashboardComponent implements OnDestroy {
  readonly facade = inject(DashboardStateService);
  private readonly dismissingIds = signal(new Set<string>());

  isDismissing(id: string): boolean {
    return this.dismissingIds().has(id);
  }

  async onDismissAction(action: DashboardAction): Promise<void> {
    this.dismissingIds.update(s => new Set([...s, action.id]));
    await new Promise<void>(r => setTimeout(r, 280));
    this.facade.dismissAction(action);
    this.dismissingIds.update(s => { const n = new Set(s); n.delete(action.id); return n; });
  }
  private readonly insights = inject(InsightsStateService);
  private readonly insightsTracking = inject(InsightsTrackingStateService);
  private readonly toast = inject(ToastService);
  private readonly navCtrl = inject(NavController);
  private readonly navigationPreset = inject(PantryNavigationPresetService);
  readonly isInsightsPro = this.insights.isPro;
  readonly repositionPredictions = this.insights.repositionPredictions;
  readonly wasteSummary = this.insights.wasteSummary;
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
    this.insightsTracking.trackRepoPredictionViewed('dashboard', {
      isPro: this.isInsightsPro(),
      count: this.repositionPredictions().length,
    });
    this.insightsTracking.trackWasteCardViewed('dashboard', {
      isPro: this.isInsightsPro(),
      count: this.wasteSummary().totalCount,
    });
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

  onAddRepoPredictionToList(p: RepositionPrediction): void {
    this.insights.addRepoPredictionToList(p, 'dashboard');
    this.toast.success('dashboard.reposition.added');
  }

  onSummaryCardClick(card: DashboardOverviewCardId): void {
    void this.facade.onOverviewCardSelected(card);
  }

  shouldShowReason(): boolean {
    const s = this.facade.todaySuggestion();
    if (!s) return false;
    // Hide reason when expiry date is visible — date already communicates urgency
    return !s.protagonist.expirationDate;
  }

  /**
   * Same destination as the Insights quality card: the preset both filters the
   * pantry to pending items and opens the bulk-fix sheet once the list has
   * loaded (see PantryStateService.ionViewWillEnter).
   */
  goToPendientes(): void {
    this.navigationPreset.setPending({ pendientes: true });
    void this.navCtrl.navigateRoot('/pantry');
  }

}
