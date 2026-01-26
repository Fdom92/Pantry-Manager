import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SetupStateService } from '@core/services/setup/setup-state.service';
import { IonButton, IonChip, IonContent, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule, TranslateModule, IonContent, IonButton, IonIcon, IonChip, IonLabel],
  templateUrl: './setup.page.html',
  styleUrls: ['./setup.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SetupStateService],
})
export class SetupPage {
  readonly facade = inject(SetupStateService);

  toggleOption(optionId: string): void {
    this.facade.toggleOption(optionId);
  }

  async skipStep(): Promise<void> {
    await this.facade.skipStep();
  }

  async continueStep(): Promise<void> {
    await this.facade.continueStep();
  }
}
