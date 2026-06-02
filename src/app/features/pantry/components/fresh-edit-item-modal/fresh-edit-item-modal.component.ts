import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import {
  IonButton, IonContent, IonIcon, IonInput, IonItem, IonModal, IonSpinner,
} from '@ionic/angular/standalone';
import { ExpiryPickerComponent } from '@shared/components/expiry-picker/expiry-picker.component';
import { EntitySelectorFieldComponent } from '@shared/components/entity-selector-field/entity-selector-field.component';
import { PantryFreshEditModalStateService } from '@core/services/pantry/modals/pantry-fresh-edit-modal-state.service';
import type { FreshState } from '@core/domain/pantry';

@Component({
  selector: 'app-fresh-edit-item-modal',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, TranslateModule,
    IonModal, IonButton, IonContent, IonItem, IonInput, IonIcon, IonSpinner,
    ExpiryPickerComponent, EntitySelectorFieldComponent,
  ],
  templateUrl: './fresh-edit-item-modal.component.html',
  styleUrls: ['./fresh-edit-item-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PantryFreshEditModalStateService],
})
export class FreshEditItemModalComponent {
  readonly state = inject(PantryFreshEditModalStateService);

  labelKey(state: FreshState): string {
    return `pantry.fresh.state.${state}`;
  }

  get currentExpirationDate(): string | null {
    return this.state.form.get('expirationDate')?.value ?? null;
  }

  onStateClick(state: FreshState): void {
    this.state.setState(state);
  }

  onDateSelected(date: string | undefined): void {
    this.state.setExpirationDate(date || null);
  }
}
