import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { UpToDateStateService } from '@core/services/up-to-date/up-to-date-state.service';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { EntityAutocompleteComponent } from '@shared/components/entity-autocomplete/entity-autocomplete.component';

@Component({
  selector: 'app-up-to-date',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    EmptyStateComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonText,
    IonButton,
    IonIcon,
    IonInput,
    IonSpinner,
    EntityAutocompleteComponent,
  ],
  templateUrl: './up-to-date.page.html',
  styleUrls: ['./up-to-date.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [UpToDateStateService],
})
export class UpToDatePage {
  readonly facade = inject(UpToDateStateService);

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }

  ionViewWillLeave(): void {
    this.facade.ionViewWillLeave();
  }
}
