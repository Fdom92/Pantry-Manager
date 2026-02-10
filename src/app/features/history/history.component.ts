import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  IonCard,
  IonCardContent,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonSkeletonText,
  IonLabel,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { HistoryStateService } from '@core/services/history/history-state.service';
import { NavController } from '@ionic/angular';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonIcon,
    IonChip,
    IonLabel,
    IonCard,
    IonCardContent,
    IonSkeletonText,
    CommonModule,
    TranslateModule,
    EmptyStateComponent,
  ],
  templateUrl: './history.component.html',
  styleUrls: ['./history.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [HistoryStateService],
})
export class HistoryComponent {
  readonly facade = inject(HistoryStateService);
  private readonly navCtrl = inject(NavController);

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }

  goToUpgrade(): void {
    void this.navCtrl.navigateForward('/upgrade');
  }
}
