import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { InsightPendingReviewProduct, PantryItem } from '@core/models';
import type { QuickEditPatch, UpToDateReason } from '@core/models/up-to-date';
import { applyQuickEdit, getFirstExpiryDateInput, hasAnyExpiryDate } from '@core/domain/up-to-date';
import { formatDateValue, formatQuantity } from '@core/utils/formatting.util';
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { DashboardInsightService } from '../dashboard/dashboard-insight.service';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { SettingsPreferencesService } from '../settings/settings-preferences.service';
import { LanguageService } from '../shared/language.service';
import { ReviewPromptService } from '../shared/review-prompt.service';
import { withSignalFlag } from '../shared';
import { HistoryEventManagerService } from '../history/history-event-manager.service';
import type { AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import { formatFriendlyName, normalizeCategoryId, normalizeLowercase, normalizeTrim } from '@core/utils/normalization.util';
import { hasMeaningfulItemChanges } from '@core/utils';

@Injectable()
export class UpToDateStateService {
  // DI
  private readonly pantryStore = inject(PantryStoreService);
  private readonly insightService = inject(DashboardInsightService);
  private readonly appPreferences = inject(SettingsPreferencesService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly navCtrl = inject(NavController);
  private readonly reviewPrompt = inject(ReviewPromptService);
  private readonly eventManager = inject(HistoryEventManagerService);
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
  readonly editExpiryDate = signal('');
  // COMPUTED SIGNALS
  readonly pending = computed(() => this.insightService.getPendingReviewProducts(this.pantryItems()));
  readonly queue = computed(() => {
    const processed = this.processedIds();
    return this.pending().filter(entry => {
      const id = normalizeTrim(entry.id);
      return id && !processed.has(id);
    });
  });
  readonly pendingCount = computed(() => this.queue().length);
  readonly processedCount = computed(() => this.processedIds().size);
  readonly totalSteps = computed(() => this.processedCount() + this.pendingCount());
  readonly isDone = computed(() => this.hasLoaded() && this.pendingCount() === 0);
  readonly categoryOptions = computed(() => this.appPreferences.preferences().categoryOptions ?? []);
  readonly pantryItemsById = computed(() => {
    const items = this.pantryItems().filter(item => Boolean(item?._id));
    return new Map(items.map(item => [item._id, item] as const));
  });
  readonly currentEntry = computed(() => {
    const entries = this.queue();
    const current = normalizeTrim(this.currentId());
    if (!entries.length) {
      return null;
    }
    if (current) {
      const match = entries.find(entry => normalizeTrim(entry.id) === current);
      if (match) {
        return match;
      }
    }
    return entries[0] ?? null;
  });
  readonly currentItem = computed(() => this.getPantryItem(this.currentEntry()?.id ?? null));
  readonly editTargetItem = computed(() => this.getPantryItem(this.editTargetId()));
  readonly editTargetEntry = computed(() => {
    const targetId = normalizeTrim(this.editTargetId());
    if (!targetId) {
      return null;
    }
    return this.queue().find(entry => normalizeTrim(entry.id) === targetId) ?? null;
  });
  readonly isEditingCurrent = computed(() => {
    if (!this.isEditModalOpen()) {
      return false;
    }
    const currentId = normalizeTrim(this.currentEntry()?.id);
    const editId = normalizeTrim(this.editTargetId());
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
    return Boolean(item) && !Boolean(normalizeTrim(item?.categoryId));
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
    if (this.editNeedsCategory() && !normalizeTrim(this.editCategory())) {
      return false;
    }
    return true;
  });
  // VARIABLES
  readonly pantryItems = this.pantryStore.items;
  private doneRedirectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const entries = this.queue();
      if (!entries.length) {
        this.currentId.set(null);
        return;
      }
      const current = normalizeTrim(this.currentId());
      if (!current) {
        const next = normalizeTrim(entries[0]?.id);
        this.currentId.set(next || null);
        return;
      }
      if (!entries.some(entry => normalizeTrim(entry.id) === current)) {
        const next = normalizeTrim(entries[0]?.id);
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
      this.reviewPrompt.markEngagement();
      this.doneRedirectTimeout = setTimeout(() => {
        void this.navCtrl.navigateRoot('/dashboard');
      }, 1200);
    });
  }

  async ionViewWillEnter(): Promise<void> {
    await withSignalFlag(this.isLoading, async () => {
      await this.pantryStore.loadAll();
      this.hasLoaded.set(true);
    });
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
    const key = normalizeTrim(id);
    if (!key) {
      return null;
    }
    return this.pantryItemsById().get(key) ?? null;
  }

  isBusy(id?: string | null): boolean {
    const key = normalizeTrim(id);
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
    const snapshot = this.queue();
    await this.runWithBusy(item._id, snapshot, async () => {
      const now = new Date().toISOString();
      await this.pantryStore.updateItem({ ...item, updatedAt: now });
      this.completeAndAdvance(id, snapshot);
    });
  }

  async remove(pending: InsightPendingReviewProduct): Promise<void> {
    const id = normalizeTrim(pending?.id);
    if (!id) {
      return;
    }
    const snapshot = this.queue();
    await this.runWithBusy(id, snapshot, async () => {
      await this.pantryStore.deleteItem(id);
      this.completeAndAdvance(id, snapshot);
    });
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
    const categoryId = normalizeTrim(item.categoryId);
    return categoryId || this.translate.instant('pantry.form.uncategorized');
  }

  formatQuantityLabel(item: PantryItem | null): string {
    if (!item) {
      return '';
    }
    const total = this.pantryStore.getItemTotalQuantity(item);
    const formatted = formatQuantity(total, this.languageService.getCurrentLocale());
    return formatted;
  }

  getCategoryAutocompleteOptions(): AutocompleteItem<string>[] {
    return this.mapSelectOptions(this.categoryOptions());
  }

  onEditCategoryValueChange(value: string): void {
    this.editCategory.set((value ?? '').toString());
  }

  onEditCategorySelect(option: AutocompleteItem<string>): void {
    this.applyAutocompleteValue(option, value => this.editCategory.set(value));
  }

  addCategoryOptionFromText(value: string): void {
    this.addOptionFromText(value, formatted => this.addCategoryOption(formatted));
  }

  onEditExpiryChange(event: CustomEvent): void {
    const value = (event.detail as any)?.value ?? '';
    this.editExpiryDate.set(typeof value === 'string' ? value : String(value));
  }

  openEditModal(pending: InsightPendingReviewProduct): void {
    const id = normalizeTrim(pending?.id);
    if (!id) {
      return;
    }
    const item = this.getPantryItem(id);
    this.editTargetId.set(id);
    this.editCategory.set(normalizeTrim(item?.categoryId));
    this.editExpiryDate.set(getFirstExpiryDateInput(item));
    this.isEditModalOpen.set(true);
  }

  closeEditModal(): void {
    this.closeEditModalInternal(false);
  }

  async saveEditModal(): Promise<void> {
    const entry = this.editTargetEntry();
    const item = this.editTargetItem();
    const id = normalizeTrim(entry?.id);
    if (!entry || !item || !id) {
      this.closeEditModalInternal(true);
      return;
    }
    if (!this.canSaveEdit()) {
      return;
    }

    const snapshot = this.queue();
    await withSignalFlag(this.isSavingEdit, async () => {
      const patch: QuickEditPatch = {
        categoryId: normalizeTrim(this.editCategory()),
        expiryDateInput: normalizeTrim(this.editExpiryDate()),
        hasExpiry: Boolean(normalizeTrim(this.editExpiryDate())),
        needsCategory: this.editNeedsCategory(),
        needsExpiry: this.editNeedsExpiry(),
      };

      const updated = applyQuickEdit({
        item,
        patch,
        nowIso: new Date().toISOString(),
      });
      if (!hasMeaningfulItemChanges(item, updated)) {
        this.completeAndAdvance(id, snapshot);
        return;
      }
      await this.pantryStore.updateItem(updated);
      await this.eventManager.logQuickEdit(item, updated);
      this.completeAndAdvance(id, snapshot);
    });
  }

  private closeEditModalInternal(force: boolean): void {
    if (!force && this.isSavingEdit()) {
      return;
    }
    this.isEditModalOpen.set(false);
    this.editTargetId.set(null);
    this.editCategory.set('');
    this.editExpiryDate.set('');
  }

  private markBusy(id: string, busy: boolean): void {
    const key = normalizeTrim(id);
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

  private async runWithBusy(
    id: string | null,
    snapshot: InsightPendingReviewProduct[],
    task: () => Promise<void>
  ): Promise<void> {
    const key = normalizeTrim(id);
    if (!key) {
      return;
    }
    if (this.isBusy(key)) {
      return;
    }
    this.markBusy(key, true);
    try {
      await task();
    } catch (err) {
      console.error('[UpToDate] runWithBusy error', err, { key, snapshotLength: snapshot.length });
      throw err;
    } finally {
      this.markBusy(key, false);
    }
  }

  private async addCategoryOption(value: string): Promise<void> {
    const normalized = normalizeCategoryId(value);
    if (!normalized) {
      return;
    }
    const current = await this.appPreferences.getPreferences();
    const existing = current.categoryOptions ?? [];
    const normalizedKey = normalizeLowercase(normalized);
    const existingMatch = existing.find(option => normalizeLowercase(normalizeCategoryId(option)) === normalizedKey);
    if (existingMatch) {
      this.editCategory.set(existingMatch);
      return;
    }
    const next = [...existing, normalized];
    await this.appPreferences.savePreferences({ ...current, categoryOptions: next });
    this.editCategory.set(normalized);
  }

  private addOptionFromText(value: string, addOption: (formatted: string) => Promise<void>): void {
    const nextValue = normalizeTrim(value);
    if (!nextValue) {
      return;
    }
    const formatted = formatFriendlyName(nextValue, nextValue);
    void addOption(formatted);
  }

  private applyAutocompleteValue(option: AutocompleteItem<string>, setter: (value: string) => void): void {
    const value = normalizeTrim((option?.raw ?? '').toString());
    if (!value) {
      return;
    }
    setter(value);
  }

  private mapSelectOptions(options: string[]): AutocompleteItem<string>[] {
    return options.map(option => ({
      id: option,
      title: option,
      raw: option,
    }));
  }

  private getNextPendingId(currentId: string | null, snapshot: InsightPendingReviewProduct[]): string | null {
    if (!Array.isArray(snapshot) || snapshot.length === 0) {
      return null;
    }
    const key = normalizeTrim(currentId);
    if (!key) {
      const first = normalizeTrim(snapshot[0]?.id);
      return first || null;
    }
    const index = snapshot.findIndex(entry => normalizeTrim(entry.id) === key);
    if (index < 0) {
      const first = normalizeTrim(snapshot[0]?.id);
      return first || null;
    }
    const next = normalizeTrim(snapshot[index + 1]?.id);
    return next || null;
  }

  private completeAndAdvance(currentId: string | null, snapshot: InsightPendingReviewProduct[]): void {
    const key = normalizeTrim(currentId);
    const nextId = this.getNextPendingId(key, snapshot);
    this.closeEditModalInternal(true);
    if (key) {
      this.processedIds.update(current => new Set(current).add(key));
    }
    this.currentId.set(nextId);
  }

}
