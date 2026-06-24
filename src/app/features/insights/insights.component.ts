import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  IonButtons,
} from '@ionic/angular/standalone';
import { NavController } from '@ionic/angular';
import { InsightsStateService } from '@core/services/insights/insights-state.service';
import { InsightsTrackingStateService } from '@core/services/insights/insights-tracking-state.service';
import { PantryNavigationPresetService } from '@core/services/pantry/pantry-navigation-preset.service';
import { FoodType } from '@core/models/shared/enums.model';
import { WasteTrackerCardComponent } from '@shared/components/waste-tracker-card/waste-tracker-card.component';
import { ProPaywallCardComponent } from '@shared/components/pro-paywall-card/pro-paywall-card.component';
import { InsightsEmptyStateComponent } from './components/insights-empty-state/insights-empty-state.component';

@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TranslateModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonIcon,
    IonButton,
    IonLabel,
    IonSegment,
    IonSegmentButton,
    IonSkeletonText,
    IonButtons,
    WasteTrackerCardComponent,
    ProPaywallCardComponent,
    InsightsEmptyStateComponent,
  ],
  templateUrl: './insights.component.html',
  styleUrls: ['./insights.component.scss'],
  providers: [InsightsStateService],
})
export class InsightsComponent {
  readonly facade = inject(InsightsStateService);
  private readonly insightsTracking = inject(InsightsTrackingStateService);
  private readonly navigationPreset = inject(PantryNavigationPresetService);
  private readonly navCtrl = inject(NavController);
  readonly FoodType = FoodType;

  goToPendientes(): void {
    this.navigationPreset.setPending({ pendientes: true });
    void this.navCtrl.navigateRoot('/pantry');
  }

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
    this.insightsTracking.trackWasteCardViewed('insights', {
      isPro: this.facade.isPro(),
      count: this.facade.wasteSummary().totalCount,
    });
  }

  formatPercent(ratio: number): string {
    return `${Math.round(ratio * 100)}%`;
  }

  getBarWidth(count: number, maxCount: number): string {
    if (maxCount === 0) return '0%';
    return `${Math.round((count / maxCount) * 100)}%`;
  }

  getQualityBarWidth(count: number, total: number): string {
    if (total === 0) return '0%';
    return `${Math.round((count / total) * 100)}%`;
  }

  getMaxFoodTypeCount(): number {
    const foodTypes = this.facade.distribution().foodTypes;
    if (!foodTypes.length) return 0;
    return Math.max(...foodTypes.map(f => f.count));
  }

  getRotationLabel(ratio: 'high' | 'medium' | 'low' | null): string {
    if (ratio === null) return 'insights.activity.rotationNone';
    return `insights.activity.rotation${ratio.charAt(0).toUpperCase()}${ratio.slice(1)}`;
  }

  getFoodTypeLabel(foodType: FoodType): string {
    return `pantry.form.foodType.${foodType}`;
  }

  readonly householdSizes = [1, 2, 3, 4] as const;

  setHouseholdSize(n: number): void {
    this.facade.setHouseholdSize(n);
  }

  readonly proSections = [
    { key: 'patterns',        icon: 'analytics-outline',  labelKey: 'insights.pro.sections.patterns' },
    { key: 'problems',        icon: 'warning-outline',    labelKey: 'insights.pro.sections.problems' },
    { key: 'recommendations', icon: 'bulb-outline',       labelKey: 'insights.pro.sections.recommendations' },
    { key: 'suggestions',     icon: 'calendar-outline',   labelKey: 'insights.pro.sections.suggestions' },
  ] as const;

  getAnalysisSection(key: string): string[] {
    const a = this.facade.proAnalysis();
    if (!a) return [];
    return (a as unknown as Record<string, string[]>)[key] ?? [];
  }
}
