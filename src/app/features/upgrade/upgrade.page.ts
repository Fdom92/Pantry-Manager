import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { PlanCardComponent } from './components/plan-card/plan-card.component';
import { UpgradeStateService } from '@core/services/upgrade/upgrade-state.service';

@Component({
  selector: 'app-upgrade',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonButton,
    IonNote,
    IonBadge,
    CommonModule,
    TranslateModule,
    PlanCardComponent,
  ],
  templateUrl: './upgrade.page.html',
  styleUrls: ['./upgrade.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [UpgradeStateService],
})
export class UpgradePage {
  readonly facade = inject(UpgradeStateService);

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }
}
