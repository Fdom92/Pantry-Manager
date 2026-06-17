import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, Component, computed, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
import { FreshEditItemModalComponent } from './components/fresh-edit-item-modal/fresh-edit-item-modal.component';
import { PantryFreshAddModalStateService } from '@core/services/pantry/modals/pantry-fresh-add-modal-state.service';
import { PantryAddCoachMarkComponent } from './components/add-coach-mark/add-coach-mark.component';
import { CoachMarkService } from '@core/services/retention';
import { LocalStorageService } from '@core/services/shared';

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
    FreshEditItemModalComponent,
    PantryAddCoachMarkComponent,
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
export class PantryComponent implements AfterViewInit, OnDestroy {
  readonly facade = inject(PantryStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly addModalState = inject(PantryAddModalStateService);
  private readonly coachMark = inject(CoachMarkService);
  private readonly localStorage = inject(LocalStorageService);
  @ViewChild(IonContent) private content!: IonContent;
  @ViewChild('despensaAddBtn') private despensaAddBtnRef?: ElementRef<HTMLElement>;

  private readonly coachMarkDismissed = signal(false);
  // Holds the button element once ViewChild is resolved (ngAfterViewInit).
  // Signal makes showCoachMark reactive to the ref becoming available.
  readonly addBtnEl = signal<HTMLElement | null>(null);

  readonly showCoachMark = computed(() =>
    !this.coachMarkDismissed() &&
    this.addBtnEl() !== null &&
    this.localStorage.onboarding.isSeen() &&
    !this.coachMark.isShown('add_first_item') &&
    this.facade.summary().total === 0
  );

  ngAfterViewInit(): void {
    if (this.despensaAddBtnRef) {
      this.addBtnEl.set(this.despensaAddBtnRef.nativeElement);
    }
  }

  onCoachMarkAddRequested(): void {
    this.coachMarkDismissed.set(true);
    this.addModalState.openAddModal();
  }

  onCoachMarkDismissed(): void {
    this.coachMarkDismissed.set(true);
  }

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();

    // Onboarding may request a fresh add-modal open (first engagement).
    // Consume the query param right away so it does not re-trigger on tab switches.
    const shouldOpenModal = this.route.snapshot.queryParams['openAddModal'] === 'true';
    if (shouldOpenModal) {
      this.addModalState.openAddModal();
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { openAddModal: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }

    const focusItemId = this.route.snapshot.queryParams['focusItem'];
    if (focusItemId) {
      this.facade.focusItemById(focusItemId);
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { focusItem: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  onToggleShowAllFresh(): void {
    const wasExpanded = this.facade.showAllFresh();
    this.facade.toggleShowAllFresh();
    if (wasExpanded) {
      this.content.scrollToTop(300);
    }
  }

  ngOnDestroy(): void {
    this.facade.onDestroy();
  }
}
