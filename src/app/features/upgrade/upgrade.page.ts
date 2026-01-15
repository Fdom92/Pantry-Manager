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
import { UpgradeFacade } from './upgrade.facade';
import { UpgradeStateService } from '@core/services/upgrade';

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
  providers: [UpgradeStateService, UpgradeFacade],
})
export class UpgradePage {
  readonly facade = inject(UpgradeFacade);

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }
}
