import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonChip,
  IonContent,
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
import { PantryAddModalComponent } from './components/add-modal/add-modal.component';
import { PantryConsumeModalComponent } from './components/consume-modal/consume-modal.component';
import { PantryDetailComponent } from './components/pantry-detail/pantry-detail.component';
import { PantryStateService } from '@core/services/pantry/pantry-state.service';
import { PantryBatchOperationsService } from '@core/services/pantry/pantry-batch-operations.service';
import { PantryListUiStateService } from '@core/services/pantry/pantry-list-ui-state.service';
import { PantryAddModalStateService } from '@core/services/pantry/modals/pantry-add-modal-state.service';
import { PantryConsumeModalStateService } from '@core/services/pantry/modals/pantry-consume-modal-state.service';
import { PantryBatchesModalStateService } from '@core/services/pantry/modals/pantry-batches-modal-state.service';
import { PantryEditItemModalStateService } from '@core/services/pantry/modals/pantry-edit-item-modal-state.service';
import { PantryQuantitySheetStateService } from '@core/services/pantry/modals/pantry-quantity-sheet-state.service';
import { FreshItemCardComponent } from './components/fresh-item-card/fresh-item-card.component';
import { FreshAddModalComponent } from './components/fresh-add-modal/fresh-add-modal.component';
import { PantryFreshAddModalStateService } from '@core/services/pantry/modals/pantry-fresh-add-modal-state.service';

@Component({
  selector: 'app-pantry',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonSearchbar,
    IonIcon,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonChip,
    IonModal,
    IonSkeletonText,
    IonText,
    CommonModule,
    RouterLink,
    PantryDetailComponent,
    TranslateModule,
    EmptyStateComponent,
    PantryAddModalComponent,
    PantryConsumeModalComponent,
    PantryBatchesModalComponent,
    PantryEditItemModalComponent,
    PantryQuantitySheetComponent,
    FreshItemCardComponent,
    FreshAddModalComponent,
  ],
  templateUrl: './pantry.component.html',
  styleUrls: ['./pantry.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    PantryStateService,
    PantryBatchOperationsService,
    PantryListUiStateService,
    PantryAddModalStateService,
    PantryConsumeModalStateService,
    PantryBatchesModalStateService,
    PantryEditItemModalStateService,
    PantryQuantitySheetStateService,
    PantryFreshAddModalStateService,
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
