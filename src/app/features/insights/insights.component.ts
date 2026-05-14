import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { InsightsStateService } from '@core/services/insights/insights-state.service';
import { FoodType } from '@core/models/shared/enums.model';

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
    IonSkeletonText,
  ],
  templateUrl: './insights.component.html',
  styleUrls: ['./insights.component.scss'],
  providers: [InsightsStateService],
})
export class InsightsComponent {
  readonly facade = inject(InsightsStateService);
  readonly FoodType = FoodType;

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }

  formatPercent(ratio: number): string {
    return `${Math.round(ratio * 100)}%`;
  }

  getWasteRatioColor(ratio: number | null): string {
    if (ratio === null) return '';
    if (ratio === 0) return 'waste-none';
    if (ratio <= 0.2) return 'waste-low';
    if (ratio <= 0.4) return 'waste-medium';
    return 'waste-high';
  }

  getBarWidth(count: number, maxCount: number): string {
    if (maxCount === 0) return '0%';
    return `${Math.round((count / maxCount) * 100)}%`;
  }

  getFoodTypeKey(foodType: FoodType): string {
    const map: Record<FoodType, string> = {
      [FoodType.PROTEIN]: 'Proteínas',
      [FoodType.CARB]: 'Carbohidratos',
      [FoodType.VEGETABLE]: 'Verduras',
      [FoodType.FRUIT]: 'Fruta',
      [FoodType.DAIRY]: 'Lácteos',
      [FoodType.HOUSEHOLD]: 'Hogar',
      [FoodType.OTHER]: 'Otros',
    };
    return map[foodType] ?? foodType;
  }
}
