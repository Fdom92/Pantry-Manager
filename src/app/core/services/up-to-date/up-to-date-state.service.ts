import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { UNASSIGNED_LOCATION_KEY } from '@core/constants';
import type { InsightPendingReviewProduct, PantryItem } from '@core/models';
import type { QuickEditPatch, UpToDateReason } from '@core/models/up-to-date';
import { applyQuickEdit, getFirstExpiryDateInput, getFirstRealLocationId, hasAnyExpiryDate, hasRealLocation, normalizeId } from '@core/domain/up-to-date';
import { formatDateValue, formatQuantity } from '@core/utils/formatting.util';
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../shared/language.service';
import { UpToDateStoreService } from './up-to-date-store.service';

@Injectable()
export class UpToDateStateService {
  private readonly store = inject(UpToDateStoreService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly navCtrl = inject(NavController);

  // SIGNALS
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

  readonly pantryItems = this.store.pantryItems;
  private doneRedirectTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly pending = computed(() => this.store.getPendingReviewProducts(this.pantryItems()));
  readonly queue = computed(() => {
    const processed = this.processedIds();
    return this.pending().filter(entry => {
      const id = normalizeId(entry.id);
      return id && !processed.has(id);
    });
  });
  readonly pendingCount = computed(() => this.queue().length);
  readonly processedCount = computed(() => this.processedIds().size);
  readonly totalSteps = computed(() => this.processedCount() + this.pendingCount());
  readonly isDone = computed(() => this.hasLoaded() && this.pendingCount() === 0);
  readonly locationOptions = computed(() => this.store.getLocationOptions());
  readonly categoryOptions = computed(() => this.store.getCategoryOptions());
  readonly pantryItemsById = computed(() => {
    const map = new Map<string, PantryItem>();
    for (const item of this.pantryItems()) {
      if (item?._id) {
        map.set(item._id, item);
      }
    }
    return map;
  });
  readonly currentEntry = computed(() => {
    const entries = this.queue();
    const current = normalizeId(this.currentId());
    if (!entries.length) {
      return null;
    }
    if (current) {
      const match = entries.find(entry => normalizeId(entry.id) === current);
      if (match) {
        return match;
      }
    }
    return entries[0] ?? null;
  });
  readonly currentItem = computed(() => this.getPantryItem(this.currentEntry()?.id ?? null));
  readonly editTargetItem = computed(() => this.getPantryItem(this.editTargetId()));
  readonly editTargetEntry = computed(() => {
    const targetId = normalizeId(this.editTargetId());
    if (!targetId) {
      return null;
    }
    return this.queue().find(entry => normalizeId(entry.id) === targetId) ?? null;
  });
  readonly isEditingCurrent = computed(() => {
    if (!this.isEditModalOpen()) {
      return false;
    }
    const currentId = normalizeId(this.currentEntry()?.id);
    const editId = normalizeId(this.editTargetId());
    return Boolean(currentId) && currentId === editId;
  });
  readonly currentStep = computed(() => {
    if (this.pendingCount() <= 0) {
      return this.totalSteps();
    }
    return Math.min(this.processedCount() + 1, this.totalSteps());
  });

  readonly editNeedsCategory = computed(() => {
    const item = this.editTargetItem();
    return Boolean(item) && !Boolean((item?.categoryId ?? '').trim());
  });
  readonly editNeedsLocation = computed(() => {
    const item = this.editTargetItem();
    if (!item) {
      return false;
    }
    return !hasRealLocation(item);
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
    return !hasAnyExpiryDate(item);
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

  constructor() {
    effect(() => {
      const entries = this.queue();
      if (!entries.length) {
        this.currentId.set(null);
        return;
      }
      const current = normalizeId(this.currentId());
      if (!current) {
        const next = normalizeId(entries[0]?.id);
        this.currentId.set(next || null);
        return;
      }
      if (!entries.some(entry => normalizeId(entry.id) === current)) {
        const next = normalizeId(entries[0]?.id);
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
      await this.store.loadAll();
    } finally {
      this.isLoading.set(false);
      this.hasLoaded.set(true);
    }
  }

  ionViewWillLeave(): void {
    if (this.doneRedirectTimeout) {
      clearTimeout(this.doneRedirectTimeout);
      this.doneRedirectTimeout = null;
    }
  }

  hasReason(pending: InsightPendingReviewProduct | null, reason: UpToDateReason): boolean {
    return pending?.reasons?.includes(reason) ?? false;
  }

  getPantryItem(id?: string | null): PantryItem | null {
    const key = normalizeId(id);
    if (!key) {
      return null;
    }
    return this.pantryItemsById().get(key) ?? null;
  }

  isBusy(id?: string | null): boolean {
    const key = normalizeId(id);
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
      await this.store.updateItem({ ...item, updatedAt: now });
      this.completeAndAdvance(id, snapshot);
    } finally {
      this.markBusy(item._id, false);
    }
  }

  async remove(pending: InsightPendingReviewProduct): Promise<void> {
    const id = normalizeId(pending?.id);
    if (!id) {
      return;
    }
    if (this.isBusy(id)) {
      return;
    }
    this.markBusy(id, true);
    const snapshot = this.queue();
    try {
      await this.store.deleteItem(id);
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
    return formatDateValue(
      value ?? null,
      this.languageService.getCurrentLocale(),
      { year: 'numeric', month: 'short', day: 'numeric' },
      { fallback: this.translate.instant('common.dates.none') }
    );
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
    const total = this.store.getItemTotalQuantity(item);
    const formatted = formatQuantity(total, this.languageService.getCurrentLocale(), { maximumFractionDigits: 1 });
    const unitLabel = this.store.getUnitLabel(this.store.getItemPrimaryUnit(item));
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
    const id = normalizeId(pending?.id);
    if (!id) {
      return;
    }
    const item = this.getPantryItem(id);
    this.editTargetId.set(id);
    this.editCategory.set((item?.categoryId ?? '').trim());
    this.editLocation.set(getFirstRealLocationId(item));
    this.editExpiryDate.set(getFirstExpiryDateInput(item));
    this.editHasExpiry.set(false);
    this.isEditModalOpen.set(true);
  }

  closeEditModal(): void {
    this.closeEditModalInternal(false);
  }

  async saveEditModal(): Promise<void> {
    const entry = this.editTargetEntry();
    const item = this.editTargetItem();
    const id = normalizeId(entry?.id);
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

      const updated = applyQuickEdit({
        item,
        patch,
        primaryUnit: this.store.getItemPrimaryUnit(item),
      });
      await this.store.updateItem(updated);
      this.closeEditModalInternal(true);
      this.completeAndAdvance(id, snapshot);
    } finally {
      this.isSavingEdit.set(false);
    }
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

  private markBusy(id: string, busy: boolean): void {
    const key = normalizeId(id);
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
    const key = normalizeId(currentId);
    if (!key) {
      const first = normalizeId(snapshot[0]?.id);
      return first || null;
    }
    const index = snapshot.findIndex(entry => normalizeId(entry.id) === key);
    if (index < 0) {
      const first = normalizeId(snapshot[0]?.id);
      return first || null;
    }
    const next = normalizeId(snapshot[index + 1]?.id);
    return next || null;
  }

  private completeAndAdvance(currentId: string | null, snapshot: InsightPendingReviewProduct[]): void {
    const key = normalizeId(currentId);
    const nextId = this.getNextPendingId(key, snapshot);
    this.closeEditModalInternal(true);
    if (key) {
      this.processedIds.update(current => new Set(current).add(key));
    }
    this.currentId.set(nextId);
  }

  private getEventStringValue(event: CustomEvent): string {
    const value = (event.detail as any)?.value ?? '';
    return typeof value === 'string' ? value : String(value);
  }
}

