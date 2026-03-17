import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { EntitySelectorFieldComponent } from '@shared/components/entity-selector-field/entity-selector-field.component';
import { BatchEditStateService } from '@core/services/dashboard/batch-edit-state.service';

@Component({
  selector: 'app-batch-edit-modal',
  standalone: true,
  imports: [
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonCheckbox,
    IonFooter,
    IonSpinner,
    TranslateModule,
    EntitySelectorFieldComponent,
  ],
  templateUrl: './batch-edit-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BatchEditModalComponent {
  readonly state = inject(BatchEditStateService);

  stepTitleKey(): string {
    switch (this.state.step()) {
      case 'items': return 'batchEdit.steps.items.title';
      case 'action': return 'batchEdit.steps.action.title';
      case 'value': return 'batchEdit.steps.value.title';
      case 'confirm': return 'batchEdit.steps.confirm.title';
    }
  }

  applyButtonKey(): string {
    const count = this.state.selectedCount();
    return count === 1 ? 'batchEdit.confirm.apply_one' : 'batchEdit.confirm.apply_other';
  }

  selectedCountKey(): string {
    return this.state.selectedCount() === 1
      ? 'batchEdit.items.selectedCount_one'
      : 'batchEdit.items.selectedCount_other';
  }
}
