import { Component, OnDestroy, signal, computed, effect } from '@angular/core';
import { IonicModule, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { SeedService } from '@core/services/seed.service';
import { PantryItem, MeasurementUnit, StockStatus, StockInfo } from '@core/models';
import { createDocumentId } from '@core/utils';
import { DEFAULT_HOUSEHOLD_ID } from '@core/constants';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { PantryStoreService } from '@core/store/pantry-store.service';
interface PantryGroup {
  key: string;
  name: string;
  items: PantryItem[];
  lowStockCount: number;
  expiringCount: number;
  expiredCount: number;
}

interface CategoryState {
  expanded: boolean;
}

@Component({
  selector: 'app-pantry-list',
  standalone: true,
  imports: [IonicModule, CommonModule, ReactiveFormsModule],
  templateUrl: './pantry-list.component.html',
  styleUrls: ['./pantry-list.component.scss'],
  animations: [
    trigger('expandCollapse', [
      state('collapsed', style({ height: '0px', opacity: 0, overflow: 'hidden', marginTop: '0px' })),
      state('expanded', style({ height: '*', opacity: 1, marginTop: '16px' })),
      transition('collapsed <=> expanded', [
        animate('180ms ease-in-out')
      ]),
    ])
  ],
})
export class PantryListComponent implements OnDestroy {
  readonly searchTerm = signal('');
  readonly selectedCategory = signal('all');
  readonly selectedLocation = signal('all');
  readonly sortOption = signal<'name' | 'quantity' | 'expiration'>('name');
  readonly statusFilter = signal<'all' | 'expired' | 'near-expiry'>('all');
  readonly showFilters = signal(false);
  readonly itemsState = signal<PantryItem[]>([]);
  readonly filteredItems = computed(() => this.computeFilteredItems());
  readonly groups = computed(() => this.buildGroups(this.filteredItems()));
  readonly summary = computed(() => this.buildSummary(this.filteredItems()));
  readonly categoryOptions = computed(() => this.computeCategoryOptions(this.itemsState()));
  readonly locationOptions = computed(() => this.computeLocationOptions(this.itemsState()));
  readonly loading = this.pantryStore.loading;
  readonly nearExpiryDays = 3;
  readonly unitOptions = Object.values(MeasurementUnit);
  showCreateModal = false;
  editingItem: PantryItem | null = null;
  isSaving = false;
  private readonly expandedItems = new Set<string>();
  private readonly stockSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingItems = new Map<string, PantryItem>();
  private readonly stockSaveDelay = 500;
  private readonly categoryState = new Map<string, CategoryState>();
  private realtimeSubscribed = false;
  readonly form = this.fb.group({
    name: this.fb.control('', { validators: [Validators.required, Validators.maxLength(120)], nonNullable: true }),
    quantity: this.fb.control(1, { validators: [Validators.required, Validators.min(0)], nonNullable: true }),
    unit: this.fb.control<MeasurementUnit>(MeasurementUnit.UNIT, { validators: [Validators.required], nonNullable: true }),
    categoryId: this.fb.control(''),
    locationId: this.fb.control(''),
    minThreshold: this.fb.control<number | null>(null),
    expirationDate: this.fb.control(''),
    notes: this.fb.control('')
  });
  constructor(
    private readonly pantryStore: PantryStoreService,
    private seedService: SeedService,
    private readonly fb: FormBuilder,
    private readonly toastCtrl: ToastController,
  ) {
    effect(() => {
      this.itemsState.set(this.pantryStore.items());
    });

    effect(() => {
      this.ensureCategoryState(this.groups());
    });

    effect(() => {
      const categories = this.categoryOptions();
      const selected = this.selectedCategory();
      if (selected !== 'all' && !categories.some(option => option.id === selected)) {
        this.selectedCategory.set('all');
      }
    });

    effect(() => {
      const locations = this.locationOptions();
      const selected = this.selectedLocation();
      if (selected !== 'all' && !locations.some(option => option.id === selected)) {
        this.selectedLocation.set('all');
      }
    });
  }

  async ionViewWillEnter() {
    await this.seedService.ensureSeedData();
    await this.loadItems();
    if (!this.realtimeSubscribed) {
      this.pantryStore.watchRealtime();
      this.realtimeSubscribed = true;
    }
  }

  async loadItems(): Promise<void> {
    await this.pantryStore.loadAll();
  }

  openNewItemModal(): void {
    this.editingItem = null;
    this.form.reset({
      name: '',
      quantity: 1,
      unit: MeasurementUnit.UNIT,
      categoryId: '',
      locationId: '',
      minThreshold: null,
      expirationDate: '',
      notes: ''
    });
    this.showCreateModal = true;
  }

  openEditItemModal(item: PantryItem, event?: Event): void {
    event?.stopPropagation();
    this.editingItem = item;
    this.form.reset({
      name: item.name ?? '',
      quantity: item.stock?.quantity ?? 0,
      unit: item.stock?.unit ?? MeasurementUnit.UNIT,
      categoryId: item.categoryId ?? '',
      locationId: item.locationId ?? '',
      minThreshold: item.stock?.minThreshold ?? null,
      expirationDate: item.expirationDate ? this.toDateInputValue(item.expirationDate) : '',
      notes: ''
    });
    this.showCreateModal = true;
  }

  closeFormModal(): void {
    this.showCreateModal = false;
    this.isSaving = false;
    this.editingItem = null;
  }

  async submitItem(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    try {
      const item = this.buildItemPayload(this.editingItem ?? undefined);
      if (this.editingItem) {
        await this.pantryStore.updateItem(item);
      } else {
        await this.pantryStore.addItem(item);
      }
      this.closeFormModal();
      await this.presentToast(`Saved "${item.name}"`, 'success');
    } catch (err) {
      console.error('[PantryListComponent] submitItem error', err);
      this.isSaving = false;
      await this.presentToast('Error saving item', 'danger');
    }
  }

  async deleteItem(item: PantryItem, event?: Event, skipConfirm = false): Promise<void> {
    event?.stopPropagation();
    if (!item?._id) {
      return;
    }
    const shouldConfirm = !skipConfirm && typeof window !== 'undefined';
    if (shouldConfirm) {
      const confirmed = window.confirm(`Delete "${item.name}"?`);
      if (!confirmed) {
        return;
      }
    }

    await this.pantryStore.deleteItem(item._id);
    this.expandedItems.delete(item._id);
    await this.presentToast(`Removed "${item.name}"`, 'medium');
  }

  async adjustQuantity(item: PantryItem, delta: number, event?: Event): Promise<void> {
    event?.stopPropagation();
    if (!item?._id) {
      return;
    }
    const prevQuantity = this.getQuantity(item);
    const next = Math.max(0, prevQuantity + delta);
    if (next === prevQuantity) {
      return;
    }

    const updatedLocal = this.updateLocalQuantity(item._id, next);
    await this.provideQuantityFeedback(prevQuantity, next);
    if (updatedLocal) {
      this.triggerStockSave(item._id, updatedLocal);
    }

    if (updatedLocal && next === 0) {
      await this.presentToast(`"${updatedLocal.name}" added to shopping list suggestions`, 'success');
    }
  }

  onSearchTermChange(ev: CustomEvent): void {
    this.searchTerm.set((ev.detail?.value ?? '').trim());
  }

  onCategoryChange(ev: CustomEvent): void {
    this.selectedCategory.set(ev.detail?.value ?? 'all');
  }

  onLocationChange(ev: CustomEvent): void {
    this.selectedLocation.set(ev.detail?.value ?? 'all');
  }

  onStatusFilterChange(ev: CustomEvent): void {
    this.statusFilter.set(ev.detail?.value ?? 'all');
  }

  onSortChange(ev: CustomEvent): void {
    this.sortOption.set(ev.detail?.value ?? 'name');
  }

  openFilters(event?: Event): void {
    event?.preventDefault();
    this.showFilters.set(true);
  }

  closeFilters(): void {
    this.showFilters.set(false);
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.selectedCategory.set('all');
    this.selectedLocation.set('all');
    this.statusFilter.set('all');
    this.sortOption.set('name');
    this.showFilters.set(false);
  }

  async refreshItems(event?: Event): Promise<void> {
    event?.preventDefault();
    await this.pantryStore.refresh();
  }

  async discardExpiredItem(item: PantryItem, event?: Event): Promise<void> {
    if (!this.isExpired(item)) {
      return;
    }
    await this.deleteItem(item, event, true);
  }

  getUnit(item: PantryItem): string {
    return item.stock?.unit ?? MeasurementUnit.UNIT;
  }

  getLocationName(item: PantryItem): string {
    return this.formatFriendlyName(item.locationId, 'Unassigned');
  }

  getQuantity(item: PantryItem): number {
    return item.stock?.quantity ?? 0;
  }

  getStatus(item: PantryItem): { label: string; color: string } {
    const quantity = item.stock?.quantity ?? 0;
    if (this.isExpired(item)) {
      return { label: 'Expired', color: 'danger' };
    }
    if (this.isNearExpiry(item)) {
      return { label: 'Expiring soon', color: 'warning' };
    }
    if (quantity === 0) {
      return { label: 'Empty', color: 'danger' };
    }
    if (this.isLowStock(item)) {
      return { label: 'Low stock', color: 'warning' };
    }
    return { label: 'Normal', color: 'success' };
  }

  getStatusIcon(item: PantryItem): string {
    const quantity = this.getQuantity(item);
    if (this.isExpired(item)) {
      return 'alert-circle-outline';
    }
    if (this.isNearExpiry(item)) {
      return 'hourglass-outline';
    }
    if (quantity === 0) {
      return 'alert-circle-outline';
    }
    if (this.isLowStock(item)) {
      return 'trending-down-outline';
    }
    return 'checkmark-circle-outline';
  }

  isLowStock(item: PantryItem): boolean {
    const stock = item.stock;
    if (!stock) {
      return true;
    }
    if (stock.minThreshold == null) {
      return false;
    }
    return stock.quantity <= stock.minThreshold;
  }

  isExpired(item: PantryItem): boolean {
    if (!item.expirationDate) {
      return false;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiration = new Date(item.expirationDate);
    expiration.setHours(0, 0, 0, 0);
    return expiration < today;
  }

  isNearExpiry(item: PantryItem): boolean {
    if (!item.expirationDate) {
      return false;
    }
    if (this.isExpired(item)) {
      return false;
    }
    const today = new Date();
    const target = new Date(item.expirationDate);
    const diff = (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= this.nearExpiryDays;
  }

  trackByItemId(_: number, item: PantryItem): string {
    return item._id;
  }

  isExpanded(item: PantryItem): boolean {
    return this.expandedItems.has(item._id);
  }

  toggleItemExpansion(item: PantryItem, event?: Event): void {
    event?.stopPropagation();
    if (this.expandedItems.has(item._id)) {
      this.expandedItems.delete(item._id);
    } else {
      this.expandedItems.add(item._id);
    }
  }

  private computeFilteredItems(): PantryItem[] {
    const items = this.itemsState();
    const search = this.searchTerm().trim().toLowerCase();
    const category = this.selectedCategory();
    const location = this.selectedLocation();
    const status = this.statusFilter();

    let filtered = items.filter(item => {
      if (search && !this.matchesSearch(item, search)) {
        return false;
      }
      if (category !== 'all' && (item.categoryId ?? '') !== category) {
        return false;
      }
      if (location !== 'all' && (item.locationId ?? '') !== location) {
        return false;
      }
      switch (status) {
        case 'expired':
          return this.isExpired(item);
        case 'near-expiry':
          return this.isNearExpiry(item) && !this.isExpired(item);
        default:
          return true;
      }
    });

    filtered = [...filtered].sort((a, b) => this.compareItems(a, b));
    this.syncExpandedItems(filtered);
    return filtered;
  }

  private compareItems(a: PantryItem, b: PantryItem): number {
    const sortOption = this.sortOption();
    const expirationWeightDiff = this.getExpirationWeight(a) - this.getExpirationWeight(b);
    if (expirationWeightDiff !== 0) {
      return expirationWeightDiff;
    }

    switch (sortOption) {
      case 'quantity': {
        const quantityDiff = (b.stock?.quantity ?? 0) - (a.stock?.quantity ?? 0);
        if (quantityDiff !== 0) {
          return quantityDiff;
        }
        break;
      }
      case 'expiration': {
        const timeDiff = this.getExpirationTime(a) - this.getExpirationTime(b);
        if (timeDiff !== 0) {
          return timeDiff;
        }
        break;
      }
      default:
        break;
    }

    return (a.name ?? '').localeCompare(b.name ?? '');
  }

  private getExpirationWeight(item: PantryItem): number {
    if (this.isExpired(item)) {
      return 0;
    }
    if (this.isNearExpiry(item)) {
      return 1;
    }
    return 2;
  }

  private getExpirationTime(item: PantryItem): number {
    if (!item.expirationDate) {
      return Number.MAX_SAFE_INTEGER;
    }
    return new Date(item.expirationDate).getTime();
  }

  private buildSummary(items: PantryItem[]) {
    let low = 0;
    let expiring = 0;
    let expired = 0;

    for (const item of items) {
      if (this.isExpired(item)) {
        expired += 1;
      } else if (this.isNearExpiry(item)) {
        expiring += 1;
      }
      if (this.isLowStock(item)) {
        low += 1;
      }
    }

    return {
      total: items.length,
      low,
      expiring,
      expired
    };
  }

  private computeLocationOptions(items: PantryItem[]): Array<{ id: string; label: string; count: number }> {
    const counts = new Map<string, { label: string; count: number }>();

    for (const item of items) {
      const id = (item.locationId ?? '').trim();
      const label = this.formatFriendlyName(id, 'Unassigned');
      const current = counts.get(id);
      if (current) {
        current.count += 1;
      } else {
        counts.set(id, { label, count: 1 });
      }
    }

    const mapped = Array.from(counts.entries())
      .map(([id, meta]) => ({ id, label: meta.label, count: meta.count }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return [
      { id: 'all', label: `All (${items.length})`, count: items.length },
      ...mapped
    ];
  }

  private updateLocalQuantity(itemId: string, quantity: number): PantryItem | null {
    let updatedItem: PantryItem | null = null;
    this.itemsState.update(items =>
      items.map(item => {
        if (item._id !== itemId) {
          return item;
        }
        const minThreshold = item.stock?.minThreshold ?? null;
        const unit = item.stock?.unit ?? MeasurementUnit.UNIT;
        const baseStock: StockInfo = {
          ...(item.stock ?? { quantity: 0, unit }),
          quantity,
          unit,
          status: this.computeStockStatus(quantity, minThreshold),
        };

        if (minThreshold != null) {
          baseStock.minThreshold = minThreshold;
        } else {
          baseStock.minThreshold = undefined;
        }

        updatedItem = {
          ...item,
          stock: baseStock,
          updatedAt: new Date().toISOString(),
        };
        return updatedItem;
      })
    );

    return updatedItem;
  }

  private triggerStockSave(itemId: string, updated: PantryItem): void {
    this.pendingItems.set(itemId, updated);
    const existingTimer = this.stockSaveTimers.get(itemId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      const pending = this.pendingItems.get(itemId);
      if (pending) {
        try {
          await this.pantryStore.updateItem(pending);
        } catch (err) {
          console.error('[PantryListComponent] updateItem error', err);
          await this.presentToast('Error updating quantity', 'danger');
        } finally {
          this.pendingItems.delete(itemId);
        }
      }
      this.stockSaveTimers.delete(itemId);
    }, this.stockSaveDelay);

    this.stockSaveTimers.set(itemId, timer);
  }

  private async provideQuantityFeedback(prev: number, next: number): Promise<void> {
    const style = next > prev ? ImpactStyle.Light : ImpactStyle.Medium;
    await this.hapticImpact(style);
  }

  private async hapticImpact(style: ImpactStyle): Promise<void> {
    try {
      await Haptics.impact({ style });
    } catch {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(20);
      }
    }
  }

  private async presentToast(message: string, color: string = 'medium'): Promise<void> {
    if (!message) {
      return;
    }
    const toast = await this.toastCtrl.create({
      message,
      color,
      duration: 1600,
      position: 'bottom',
    });
    await toast.present();
  }

  ngOnDestroy(): void {
    this.clearStockSaveTimers();
  }

  private clearStockSaveTimers(): void {
    for (const timer of this.stockSaveTimers.values()) {
      clearTimeout(timer);
    }
    this.stockSaveTimers.clear();
    this.pendingItems.clear();
  }

  private buildItemPayload(existing?: PantryItem): PantryItem {
    const {
      name,
      quantity,
      unit,
      categoryId,
      locationId,
      minThreshold,
      expirationDate
    } = this.form.value;

    const {
      now,
      normalizedExpiration,
      normalizedQuantity,
      normalizedMinThreshold,
      normalizedUnit
    } = this.normalizeFormValues(quantity, minThreshold, unit, expirationDate);

    const identifier = existing?._id ?? createDocumentId('item');
    const base: PantryItem = {
      _id: identifier,
      _rev: existing?._rev,
      type: 'item',
      householdId: existing?.householdId ?? DEFAULT_HOUSEHOLD_ID,
      name: (name ?? '').trim(),
      categoryId: (categoryId ?? '').trim(),
      locationId: (locationId ?? '').trim(),
      stock: {
        quantity: normalizedQuantity,
        unit: normalizedUnit,
        minThreshold: normalizedMinThreshold ?? undefined,
        status: this.computeStockStatus(normalizedQuantity, normalizedMinThreshold),
        isBasic: existing?.stock?.isBasic
      },
      expirationDate: normalizedExpiration,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    if (base.stock) {
      if (base.stock.minThreshold == null) {
        base.stock.minThreshold = undefined;
      }
      if (!base.stock.isBasic) {
        base.stock.isBasic = undefined;
      }
    }

    if (existing && !normalizedExpiration) {
      base.expirationDate = undefined;
    }

    return base;
  }

  private normalizeFormValues(
    quantity: number | null | undefined,
    minThreshold: number | null | undefined,
    unit: MeasurementUnit | null | undefined,
    expirationDate: string | null | undefined
  ): {
    now: string;
    normalizedQuantity: number;
    normalizedMinThreshold: number | null;
    normalizedUnit: MeasurementUnit;
    normalizedExpiration?: string;
  } {
    const quantityValue = quantity == null ? 0 : Number(quantity);
    const minThresholdValue = minThreshold == null
      ? null
      : Number(minThreshold);
    const normalizedExpiration = expirationDate
      ? new Date(expirationDate as string).toISOString()
      : undefined;

    return {
      now: new Date().toISOString(),
      normalizedExpiration,
      normalizedQuantity: quantityValue,
      normalizedMinThreshold: minThresholdValue,
      normalizedUnit: (unit ?? MeasurementUnit.UNIT) as MeasurementUnit
    };
  }

  private computeStockStatus(quantity: number, minThreshold: number | null): StockStatus {
    if (quantity <= 0) {
      return StockStatus.EMPTY;
    }
    if (minThreshold != null && quantity <= minThreshold) {
      return StockStatus.LOW;
    }
    return StockStatus.NORMAL;
  }

  private computeCategoryOptions(items: PantryItem[]): Array<{ id: string; label: string; count: number; lowCount: number }> {
    const counts = new Map<string, { label: string; count: number; lowCount: number }>();
    for (const item of items) {
      const id = (item.categoryId ?? '').trim();
      const label = this.formatCategoryName(id);
      const current = counts.get(id);
      if (current) {
        current.count += 1;
        if (this.isLowStock(item)) {
          current.lowCount += 1;
        }
      } else {
        counts.set(id, {
          label,
          count: 1,
          lowCount: this.isLowStock(item) ? 1 : 0,
        });
      }
    }

    const mapped = Array.from(counts.entries())
      .map(([id, meta]) => ({ id, label: meta.label, count: meta.count, lowCount: meta.lowCount }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const lowTotal = mapped.reduce((acc, option) => acc + option.lowCount, 0);
    return [
      { id: 'all', label: `All (${items.length})`, count: items.length, lowCount: lowTotal },
      ...mapped
    ];
  }

  private buildGroups(items: PantryItem[]): PantryGroup[] {
    const map = new Map<string, PantryGroup>();

    for (const item of items) {
      const key = item.categoryId?.trim() || 'uncategorized';
      const name = this.formatCategoryName(key);
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          name,
          items: [],
          lowStockCount: 0,
          expiringCount: 0,
          expiredCount: 0,
        };
        map.set(key, group);
      }

      group.items.push(item);
      if (this.isLowStock(item)) {
        group.lowStockCount += 1;
      }
      if (this.isExpired(item)) {
        group.expiredCount += 1;
      } else if (this.isNearExpiry(item)) {
        group.expiringCount += 1;
      }
    }

    const groups = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    for (const group of groups) {
      group.items = group.items.sort((a, b) => this.compareItems(a, b));
    }
    return groups;
  }

  isCategoryExpanded(key: string): boolean {
    return this.categoryState.get(key)?.expanded ?? true;
  }

  toggleCategory(key: string, event?: Event): void {
    event?.stopPropagation();
    const current = this.categoryState.get(key)?.expanded ?? true;
    this.categoryState.set(key, { expanded: !current });
  }

  private ensureCategoryState(groups: PantryGroup[]): void {
    const keys = new Set(groups.map(group => group.key));
    for (const group of groups) {
      if (!this.categoryState.has(group.key)) {
        this.categoryState.set(group.key, { expanded: true });
      }
    }
    for (const key of Array.from(this.categoryState.keys())) {
      if (!keys.has(key)) {
        this.categoryState.delete(key);
      }
    }
  }

  formatCategoryName(key: string): string {
    return this.formatFriendlyName(key, 'Uncategorized');
  }

  private formatFriendlyName(value: string, fallback: string): string {
    const key = value?.trim();
    if (!key) {
      return fallback;
    }
    const plain = key.replace(/^(category:|location:)/i, '');
    return plain
      .split(/[-_:]/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private toDateInputValue(dateIso: string): string {
    try {
      return new Date(dateIso).toISOString().slice(0, 10);
    } catch {
      return '';
    }
  }

  private syncExpandedItems(source: PantryItem[] = this.itemsState()): void {
    const validIds = new Set(source.map(item => item._id));
    for (const id of Array.from(this.expandedItems)) {
      if (!validIds.has(id)) {
        this.expandedItems.delete(id);
      }
    }
  }

  private matchesSearch(item: PantryItem, search: string): boolean {
    const name = item.name?.toLowerCase() ?? '';
    const category = item.categoryId?.toLowerCase() ?? '';
    const location = item.locationId?.toLowerCase() ?? '';
    return name.includes(search) || category.includes(search) || location.includes(search);
  }

}
