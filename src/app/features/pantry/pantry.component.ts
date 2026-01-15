import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnDestroy } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonChip,
  IonContent,
  IonFab,
  IonFabButton,
  IonFabList,
  IonFooter,
  IonHeader,
  IonIcon,
  IonModal,
  IonSearchbar,
  IonSkeletonText,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { PantryBatchesModalComponent } from './components/batches-modal/batches-modal.component';
import { PantryEditItemModalComponent } from './components/edit-item-modal/edit-item-modal.component';
import { PantryFiltersModalComponent } from './components/filters-modal/filters-modal.component';
import { PantryMoveModalComponent } from './components/move-modal/move-modal.component';
import { PantryDetailComponent } from './components/pantry-detail/pantry-detail.component';
import { PantryFacade } from './facade/pantry.facade';
import { PantryStateService } from '@core/services/pantry';

@Component({
  selector: 'app-pantry',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonSearchbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonModal,
    IonTextarea,
    IonFab,
    IonFabButton,
    IonFabList,
    IonSpinner,
    IonChip,
    IonSkeletonText,
    IonText,
    IonFooter,
    CommonModule,
    ReactiveFormsModule,
    PantryDetailComponent,
    TranslateModule,
    EmptyStateComponent,
    PantryBatchesModalComponent,
    PantryMoveModalComponent,
    PantryFiltersModalComponent,
    PantryEditItemModalComponent,
  ],
  templateUrl: './pantry.component.html',
  styleUrls: ['./pantry.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PantryStateService, PantryFacade],
})
export class PantryComponent implements OnDestroy {
  readonly facade = inject(PantryFacade);

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }

  ngOnDestroy(): void {
    this.facade.onDestroy();
  }
}
