import { ChangeDetectionStrategy, Component, inject, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonButtons, IonContent, IonFooter, IonHeader,
  IonInput, IonItem, IonLabel, IonModal,
  IonTitle, IonToggle, IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { QuickDateChipsComponent } from '@shared/components/quick-date-chips/quick-date-chips.component';
import { PantryFreshAddModalStateService } from '@core/services/pantry/modals/pantry-fresh-add-modal-state.service';

@Component({
  selector: 'app-fresh-add-modal',
  standalone: true,
  imports: [
    IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonFooter, IonItem, IonLabel, IonInput, IonToggle,
    FormsModule, TranslateModule, QuickDateChipsComponent,
  ],
  templateUrl: './fresh-add-modal.component.html',
  styleUrls: ['./fresh-add-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreshAddModalComponent {
  readonly state = inject(PantryFreshAddModalStateService);
  private readonly translate = inject(TranslateService);
  @ViewChild(QuickDateChipsComponent) readonly dateChips?: QuickDateChipsComponent;

  readonly basicKeys = [
    'pantry.fresh.basics.yogurt',
    'pantry.fresh.basics.milk',
    'pantry.fresh.basics.eggs',
    'pantry.fresh.basics.tomatoes',
    'pantry.fresh.basics.fruit',
  ] as const;

  onBasicChipSelected(key: string): void {
    this.state.setNameIfEmpty(this.translate.instant(key));
  }

  onDateSelected(date: string | null): void {
    this.state.setExpirationDate(date);
  }

  onNameChange(event: CustomEvent): void {
    this.state.setName(event.detail.value ?? '');
  }

  async onSubmit(): Promise<void> {
    await this.state.submit();
  }
}
