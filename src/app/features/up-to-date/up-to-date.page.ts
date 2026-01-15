import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { UNASSIGNED_LOCATION_KEY } from '@core/constants';
import { InsightPendingReviewProduct, PantryItem } from '@core/models';
import { QuickEditPatch, UpToDateReason } from '@core/models/up-to-date';
import { AppPreferencesService, InsightService, LanguageService, PantryStoreService } from '@core/services';
import { formatDateValue, formatQuantity } from '@core/utils/formatting.util';
import { NavController } from '@ionic/angular';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonToggle,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';

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
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton,
    IonIcon,
    IonList,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonInput,
    IonToggle,
    IonSpinner,
  ],
  templateUrl: './up-to-date.page.html',
  styleUrls: ['./up-to-date.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpToDatePage {
  // DI
  private readonly pantryStore = inject(PantryStoreService);
  private readonly insightService = inject(InsightService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly navCtrl = inject(NavController);
  private readonly appPreferencesService = inject(AppPreferencesService);

  // Signals
  readonly isLoading = signal(false);
  readonly hasLoaded = signal(false);
  readonly busyIds = signal<Set<string>>(new Set());
  readonly currentId = signal<string | null>(null);
  readonly processedIds = signal<Set<string>>(new Set());
  readonly isEditModalOpen = signal(false);
  readonly isSavingEdit = signal(false);
  readonly editTargetId = signal<string | null>(null);
  readonly editCategory = signal('');
  readonly editLocation = signal('');
  readonly editHasExpiry = signal(false);
  readonly editExpiryDate = signal('');

  // Data
  readonly pantryItems = this.pantryStore.items;

  // Computed
  readonly pending = computed(() => this.insightService.getPendingReviewProducts(this.pantryItems()));
  readonly queue = computed(() => {
    const processed = this.processedIds();
    return this.pending().filter(entry => {
      const id = this.normalizeId(entry.id);
      return id && !processed.has(id);
    });
  });
  readonly pendingCount = computed(() => this.queue().length);
  readonly processedCount = computed(() => this.processedIds().size);
  readonly totalSteps = computed(() => this.processedCount() + this.pendingCount());
  readonly currentStep = computed(() => {
    if (this.pendingCount() <= 0) {
      return this.totalSteps();
    }
    return Math.min(this.processedCount() + 1, this.totalSteps());
  });
  readonly isDone = computed(() => this.hasLoaded() && this.pendingCount() === 0);
  readonly pantryItemsById = computed(() => {
    const map = new Map<string, PantryItem>();
    for (const item of this.pantryItems()) {
      if (item?._id) {
        map.set(item._id, item);
      }
    }
    return map;
  });
  readonly locationOptions = computed(() => this.appPreferencesService.preferences().locationOptions ?? []);
  readonly categoryOptions = computed(() => this.appPreferencesService.preferences().categoryOptions ?? []);
  readonly currentEntry = computed(() => {
    const entries = this.queue();
    const current = this.normalizeId(this.currentId());
    if (!entries.length) {
      return null;
    }
    if (current) {
      const match = entries.find(entry => this.normalizeId(entry.id) === current);
      if (match) {
        return match;
      }
    }
    return entries[0] ?? null;
  });
  readonly currentItem = computed(() => this.getPantryItem(this.currentEntry()?.id ?? null));
  readonly isEditingCurrent = computed(() => {
    if (!this.isEditModalOpen()) {
      return false;
    }
    const currentId = this.normalizeId(this.currentEntry()?.id);
    const editId = this.normalizeId(this.editTargetId());
    return Boolean(currentId) && currentId === editId;
  });
  readonly editTargetEntry = computed(() => {
    const targetId = this.normalizeId(this.editTargetId());
    if (!targetId) {
      return null;
    }
    return this.queue().find(entry => this.normalizeId(entry.id) === targetId) ?? null;
  });
  readonly editTargetItem = computed(() => this.getPantryItem(this.editTargetId()));
  readonly editNeedsCategory = computed(() => {
    const item = this.editTargetItem();
    return Boolean(item) && !Boolean((item?.categoryId ?? '').trim());
  });
  readonly editNeedsLocation = computed(() => {
    const item = this.editTargetItem();
    if (!item) {
      return false;
    }
    return !this.hasRealLocation(item);
  });
  readonly editNeedsExpiry = computed(() => {
    const item = this.editTargetItem();
    if (!item) {
      return false;
    }
    const hasNoExpiryMarker = item.noExpiry === true;
    if (hasNoExpiryMarker) {
      return false;
    }
    return !this.hasAnyExpiryDate(item);
  });
  readonly canSaveEdit = computed(() => {
    if (this.isSavingEdit()) {
      return false;
    }
    const entry = this.editTargetEntry();
    const item = this.editTargetItem();
    if (!entry || !item) {
      return false;
    }
    if (this.editNeedsCategory() && !this.editCategory().trim()) {
      return false;
    }
    if (this.editNeedsLocation() && !this.editLocation().trim()) {
      return false;
    }
    if (this.editNeedsExpiry() && this.editHasExpiry() && !this.editExpiryDate().trim()) {
      return false;
    }
    return true;
  });

  private doneRedirectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const entries = this.queue();
      if (!entries.length) {
        this.currentId.set(null);
        return;
      }
      const current = this.normalizeId(this.currentId());
      if (!current) {
        const next = this.normalizeId(entries[0]?.id);
        this.currentId.set(next || null);
        return;
      }
      if (!entries.some(entry => this.normalizeId(entry.id) === current)) {
        const next = this.normalizeId(entries[0]?.id);
        this.currentId.set(next || null);
      }
    });

    effect(() => {
      if (!this.isDone()) {
        return;
      }
      if (this.doneRedirectTimeout) {
        return;
      }
      this.doneRedirectTimeout = setTimeout(() => {
        void this.navCtrl.navigateRoot('/dashboard');
      }, 1200);
    });
  }

  async ionViewWillEnter(): Promise<void> {
    this.isLoading.set(true);
    try {
      await this.pantryStore.loadAll();
    } finally {
      this.isLoading.set(false);
      this.hasLoaded.set(true);
    }
  }

  async ionViewWillLeave(): Promise<void> {
    if (this.doneRedirectTimeout) {
      clearTimeout(this.doneRedirectTimeout);
      this.doneRedirectTimeout = null;
    }
  }

  hasReason(pending: InsightPendingReviewProduct | null, reason: UpToDateReason): boolean {
    return pending?.reasons?.includes(reason) ?? false;
  }

  getPantryItem(id?: string | null): PantryItem | null {
    const key = this.normalizeId(id);
    if (!key) {
      return null;
    }
    return this.pantryItemsById().get(key) ?? null;
  }

  isBusy(id?: string | null): boolean {
    const key = this.normalizeId(id);
    if (!key) {
      return false;
    }
    return this.busyIds().has(key);
  }

  async keep(pending: InsightPendingReviewProduct): Promise<void> {
    const id = pending?.id ?? null;
    const item = this.getPantryItem(id);
    if (!item) {
      return;
    }
    if (this.isBusy(item._id)) {
      return;
    }
    this.markBusy(item._id, true);
    const snapshot = this.queue();
    try {
      const now = new Date().toISOString();
      await this.pantryStore.updateItem({ ...item, updatedAt: now });
      this.completeAndAdvance(id, snapshot);
    } finally {
      this.markBusy(item._id, false);
    }
  }

  async remove(pending: InsightPendingReviewProduct): Promise<void> {
    const id = this.normalizeId(pending?.id);
    if (!id) {
      return;
    }
    if (this.isBusy(id)) {
      return;
    }
    this.markBusy(id, true);
    const snapshot = this.queue();
    try {
      await this.pantryStore.deleteItem(id);
      this.completeAndAdvance(id, snapshot);
    } finally {
      this.markBusy(id, false);
    }
  }

  skip(pending: InsightPendingReviewProduct): void {
    const snapshot = this.queue();
    this.completeAndAdvance(pending?.id ?? null, snapshot);
  }

  edit(pending: InsightPendingReviewProduct): void {
    if (!this.hasReason(pending, 'missing-info')) {
      console.log('[UpToDate] edit requested (not implemented for non-missing-info)', pending);
      const snapshot = this.queue();
      this.completeAndAdvance(pending?.id ?? null, snapshot);
      return;
    }

    this.openEditModal(pending);
  }

  formatItemDate(value?: string | null): string {
    return formatDateValue(value ?? null, this.languageService.getCurrentLocale(), { year: 'numeric', month: 'short', day: 'numeric' }, {
      fallback: this.translate.instant('common.dates.none'),
    });
  }

  formatCategory(item: PantryItem | null): string {
    if (!item) {
      return '';
    }
    const categoryId = (item.categoryId ?? '').trim();
    return categoryId || this.translate.instant('pantry.form.uncategorized');
  }

  formatQuantityLabel(item: PantryItem | null): string {
    if (!item) {
      return '';
    }
    const total = this.pantryStore.getItemTotalQuantity(item);
    const formatted = formatQuantity(total, this.languageService.getCurrentLocale(), { maximumFractionDigits: 1 });
    const unitLabel = this.pantryStore.getUnitLabel(this.pantryStore.getItemPrimaryUnit(item));
    return `${formatted} ${unitLabel}`.trim();
  }

  onEditCategoryChange(event: CustomEvent): void {
    this.editCategory.set(this.getEventStringValue(event));
  }

  onEditLocationChange(event: CustomEvent): void {
    this.editLocation.set(this.getEventStringValue(event));
  }

  onEditExpiryChange(event: CustomEvent): void {
    this.editExpiryDate.set(this.getEventStringValue(event));
  }

  onEditHasExpiryToggle(event: CustomEvent): void {
    const checked = Boolean((event.detail as any)?.checked);
    this.editHasExpiry.set(checked);
    if (!checked) {
      this.editExpiryDate.set('');
    }
  }

  openEditModal(pending: InsightPendingReviewProduct): void {
    const id = this.normalizeId(pending?.id);
    if (!id) {
      return;
    }
    const item = this.getPantryItem(id);
    this.editTargetId.set(id);
    this.editCategory.set((item?.categoryId ?? '').trim());
    this.editLocation.set(this.getFirstRealLocationId(item));
    this.editExpiryDate.set(this.getFirstExpiryDateInput(item));
    this.editHasExpiry.set(false);
    this.isEditModalOpen.set(true);
  }

  closeEditModal(): void {
    this.closeEditModalInternal(false);
  }

  private closeEditModalInternal(force: boolean): void {
    if (!force && this.isSavingEdit()) {
      return;
    }
    this.isEditModalOpen.set(false);
    this.resetEditState();
  }

  private resetEditState(): void {
    this.editTargetId.set(null);
    this.editCategory.set('');
    this.editLocation.set('');
    this.editHasExpiry.set(false);
    this.editExpiryDate.set('');
  }

  async saveEditModal(): Promise<void> {
    const entry = this.editTargetEntry();
    const item = this.editTargetItem();
    const id = this.normalizeId(entry?.id);
    if (!entry || !item || !id) {
      this.closeEditModalInternal(true);
      return;
    }
    if (this.isSavingEdit()) {
      return;
    }
    if (!this.canSaveEdit()) {
      return;
    }

    this.isSavingEdit.set(true);
    const snapshot = this.queue();
    try {
      const patch: QuickEditPatch = {
        categoryId: this.editCategory().trim(),
        locationId: this.editLocation().trim(),
        expiryDateInput: this.editExpiryDate().trim(),
        hasExpiry: this.editHasExpiry(),
        needsCategory: this.editNeedsCategory(),
        needsLocation: this.editNeedsLocation(),
        needsExpiry: this.editNeedsExpiry(),
      };
      const updated = this.applyQuickEdit(item, patch);
      await this.pantryStore.updateItem(updated);
      this.closeEditModalInternal(true);
      this.completeAndAdvance(id, snapshot);
    } finally {
      this.isSavingEdit.set(false);
    }
  }

  private markBusy(id: string, busy: boolean): void {
    const key = this.normalizeId(id);
    if (!key) {
      return;
    }
    this.busyIds.update(current => {
      const next = new Set(current);
      if (busy) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  private getNextPendingId(currentId: string | null, snapshot: InsightPendingReviewProduct[]): string | null {
    if (!Array.isArray(snapshot) || snapshot.length === 0) {
      return null;
    }
    const key = this.normalizeId(currentId);
    if (!key) {
      const first = this.normalizeId(snapshot[0]?.id);
      return first || null;
    }
    const index = snapshot.findIndex(entry => this.normalizeId(entry.id) === key);
    if (index < 0) {
      const first = this.normalizeId(snapshot[0]?.id);
      return first || null;
    }
    const next = this.normalizeId(snapshot[index + 1]?.id);
    return next || null;
  }

  private completeAndAdvance(currentId: string | null, snapshot: InsightPendingReviewProduct[]): void {
    const key = this.normalizeId(currentId);
    const nextId = this.getNextPendingId(key, snapshot);
    this.closeEditModalInternal(true);
    if (key) {
      this.processedIds.update(current => {
        const next = new Set(current);
        next.add(key);
        return next;
      });
    }
    this.currentId.set(nextId);
  }

  private normalizeId(value?: string | null): string {
    return (value ?? '').trim();
  }

  private isUnassignedLocationId(value?: string | null): boolean {
    const id = this.normalizeId(value).toLowerCase();
    return !id || id === UNASSIGNED_LOCATION_KEY;
  }

  private hasRealLocation(item: PantryItem): boolean {
    return (
      item.locations?.some(location => !this.isUnassignedLocationId(location.locationId)) ??
      false
    );
  }

  private getFirstRealLocationId(item: PantryItem | null): string {
    if (!item) {
      return '';
    }
    const location = item.locations?.find(l => !this.isUnassignedLocationId(l.locationId));
    return this.normalizeId(location?.locationId);
  }

  private hasAnyExpiryDate(item: PantryItem): boolean {
    return (
      item.locations?.some(location => (location.batches ?? []).some(batch => Boolean(batch.expirationDate))) ??
      false
    );
  }

  private getFirstExpiryDateInput(item: PantryItem | null): string {
    if (!item) {
      return '';
    }
    for (const location of item.locations ?? []) {
      for (const batch of location.batches ?? []) {
        const iso = this.normalizeId(batch.expirationDate);
        if (iso) {
          return this.toDateInputValue(iso);
        }
      }
    }
    return '';
  }

  private getEventStringValue(event: CustomEvent): string {
    const value = (event.detail as any)?.value ?? '';
    return typeof value === 'string' ? value : String(value);
  }

  private toDateInputValue(dateIso: string): string {
    try {
      return new Date(dateIso).toISOString().slice(0, 10);
    } catch {
      return '';
    }
  }

  private toIsoDate(dateInput: string): string | null {
    const trimmed = dateInput.trim();
    if (!trimmed) {
      return null;
    }
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString();
  }

  private applyQuickEdit(
    item: PantryItem,
    patch: QuickEditPatch
  ): PantryItem {
    const nextCategory = patch.needsCategory ? patch.categoryId.trim() : (item.categoryId ?? '').trim();
    const nextLocations = Array.isArray(item.locations) ? item.locations.map(location => ({ ...location })) : [];

    if (patch.needsLocation) {
      const normalizedLocation = patch.locationId.trim();
      const index = nextLocations.findIndex(location => this.isUnassignedLocationId(location.locationId));
      if (index >= 0) {
        nextLocations[index].locationId = normalizedLocation;
      } else if (nextLocations.length > 0) {
        nextLocations[0].locationId = normalizedLocation;
      } else {
        nextLocations.push({
          locationId: normalizedLocation,
          unit: String(this.pantryStore.getItemPrimaryUnit(item)),
          batches: [],
        });
      }
    }

    if (patch.needsExpiry) {
      if (!patch.hasExpiry) {
        return {
          ...item,
          categoryId: nextCategory,
          locations: nextLocations,
          noExpiry: true,
          updatedAt: new Date().toISOString(),
        };
      }

      const iso = this.toIsoDate(patch.expiryDateInput);
      if (iso) {
        if (!nextLocations.length) {
          nextLocations.push({
            locationId: UNASSIGNED_LOCATION_KEY,
            unit: String(this.pantryStore.getItemPrimaryUnit(item)),
            batches: [],
          });
        }
        const target = nextLocations[0];
        const batches = Array.isArray(target.batches) ? [...target.batches] : [];
        const batchIndex = batches.findIndex(batch => !batch.expirationDate);
        if (batchIndex >= 0) {
          batches[batchIndex] = { ...batches[batchIndex], expirationDate: iso };
        } else {
          batches.push({
            quantity: 0,
            unit: target.unit,
            expirationDate: iso,
          });
        }
        nextLocations[0] = { ...target, batches };
      }
    }

    return {
      ...item,
      categoryId: nextCategory,
      locations: nextLocations,
      noExpiry: patch.needsExpiry ? false : item.noExpiry,
      updatedAt: new Date().toISOString(),
    };
  }
}
