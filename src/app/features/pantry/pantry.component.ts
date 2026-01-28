import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnDestroy } from '@angular/core';
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
  IonHeader,
  IonIcon,
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
import { EntitySelectorModalComponent } from '@shared/components/entity-selector-modal/entity-selector-modal.component';
import { PantryFiltersModalComponent } from './components/filters-modal/filters-modal.component';
import { PantryMoveModalComponent } from './components/move-modal/move-modal.component';
import { PantryDetailComponent } from './components/pantry-detail/pantry-detail.component';
import { PantryStateService } from '@core/services/pantry/pantry-state.service';

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
    IonFab,
    IonFabButton,
    IonFabList,
    IonChip,
    IonSkeletonText,
    IonText,
    CommonModule,
    PantryDetailComponent,
    TranslateModule,
    EmptyStateComponent,
    EntitySelectorModalComponent,
    PantryBatchesModalComponent,
    PantryMoveModalComponent,
    PantryFiltersModalComponent,
    PantryEditItemModalComponent,
  ],
  templateUrl: './pantry.component.html',
  styleUrls: ['./pantry.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PantryStateService],
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
