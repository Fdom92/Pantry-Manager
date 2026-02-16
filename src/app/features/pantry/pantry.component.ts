import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnDestroy } from '@angular/core';
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonChip,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonModal,
  IonSearchbar,
  IonSkeletonText,
  IonText,
  IonTitle,
  IonToolbar
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { PantryBatchesModalComponent } from './components/batches-modal/batches-modal.component';
import { PantryEditItemModalComponent } from './components/edit-item-modal/edit-item-modal.component';
import { PantryQuantitySheetComponent } from './components/pantry-quantity-sheet/pantry-quantity-sheet.component';
import { EntitySelectorModalComponent } from '@shared/components/entity-selector-modal/entity-selector-modal.component';
import { PantryDetailComponent } from './components/pantry-detail/pantry-detail.component';
import { PantryStateService } from '@core/services/pantry/pantry-state.service';
import { PantryBatchOperationsService } from '@core/services/pantry/pantry-batch-operations.service';
import { PantryListUiStateService } from '@core/services/pantry/pantry-list-ui-state.service';
import { PantryFastAddModalStateService } from '@core/services/pantry/modals/pantry-fast-add-modal-state.service';
import { PantryBatchesModalStateService } from '@core/services/pantry/modals/pantry-batches-modal-state.service';
import { PantryEditItemModalStateService } from '@core/services/pantry/modals/pantry-edit-item-modal-state.service';
import { PantryQuantitySheetStateService } from '@core/services/pantry/modals/pantry-quantity-sheet-state.service';

@Component({
  selector: 'app-pantry',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonSearchbar,
    IonIcon,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonFab,
    IonFabButton,
    IonChip,
    IonModal,
    IonSkeletonText,
    IonText,
    CommonModule,
    PantryDetailComponent,
    TranslateModule,
    EmptyStateComponent,
    EntitySelectorModalComponent,
    PantryBatchesModalComponent,
    PantryEditItemModalComponent,
    PantryQuantitySheetComponent,
  ],
  templateUrl: './pantry.component.html',
  styleUrls: ['./pantry.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    PantryStateService,
    PantryBatchOperationsService,
    PantryListUiStateService,
    PantryFastAddModalStateService,
    PantryBatchesModalStateService,
    PantryEditItemModalStateService,
    PantryQuantitySheetStateService,
  ],
})
export class PantryComponent implements OnDestroy {
  readonly facade = inject(PantryStateService);

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }

  ngOnDestroy(): void {
    this.facade.onDestroy();
  }
}
