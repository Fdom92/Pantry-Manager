import { Component, OnDestroy, signal, computed, effect } from '@angular/core';
import { IonicModule, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormArray, FormGroup } from '@angular/forms';
import { SeedService } from '@core/services/seed.service';
import { PantryItem, MeasurementUnit, ItemLocationStock } from '@core/models';
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
    categoryId: this.fb.control(''),
    isBasic: this.fb.control(false),
    notes: this.fb.control(''),
    locations: this.fb.array([
      this.createLocationGroup({
        locationId: '',
        quantity: 1,
        unit: MeasurementUnit.UNIT,
      })
    ])
  });

  get locationsArray(): FormArray<FormGroup> {
    return this.form.get('locations') as FormArray<FormGroup>;
  }
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

  /** Lifecycle hook: ensure the store is primed and real-time updates are wired. */
  async ionViewWillEnter() {
    // await this.seedService.ensureSeedData();
    await this.loadItems();
    if (!this.realtimeSubscribed) {
      this.pantryStore.watchRealtime();
      this.realtimeSubscribed = true;
    }
  }

  /** Convenience wrapper used by multiple entry points to reload the list. */
  async loadItems(): Promise<void> {
    await this.pantryStore.loadAll();
  }

  /** Open the creation modal with blank defaults and a single location row. */
  openNewItemModal(): void {
    this.editingItem = null;
    this.form.reset({
      name: '',
      categoryId: '',
      isBasic: false,
      notes: ''
    });
    this.resetLocationControls([
      {
        locationId: '',
        quantity: 1,
        unit: MeasurementUnit.UNIT,
      }
    ]);
    this.showCreateModal = true;
  }

  openEditItemModal(item: PantryItem, event?: Event): void {
    event?.stopPropagation();
    this.editingItem = item;
    this.form.reset({
      name: item.name ?? '',
      categoryId: item.categoryId ?? '',
      isBasic: Boolean(item.isBasic),
      notes: ''
    });
    const locations = item.locations.length
      ? item.locations
      : [{
          locationId: '',
          quantity: 0,
          unit: this.pantryStore.getItemPrimaryUnit(item),
          minThreshold: undefined,
          expiryDate: undefined,
          opened: false,
        }];
    this.resetLocationControls(locations);
    this.showCreateModal = true;
  }

  /** Append a new empty location group so the user can split stock. */
  addLocationEntry(): void {
    this.locationsArray.push(this.createLocationGroup());
  }

  /** Remove the requested location, keeping at least one so the form stays valid. */
  removeLocationEntry(index: number): void {
    if (this.locationsArray.length <= 1) {
      return;
    }
    this.locationsArray.removeAt(index);
  }

  /** Replace the current form array with normalized groups based on the provided data. */
  private resetLocationControls(locations: Array<Partial<ItemLocationStock>>): void {
    while (this.locationsArray.length) {
      this.locationsArray.removeAt(0);
    }
    for (const location of locations) {
      this.locationsArray.push(this.createLocationGroup(location));
    }
  }

  /** Create a form group for a single location with coercion and sane defaults. */
  private createLocationGroup(initial?: Partial<ItemLocationStock>): FormGroup {
    return this.fb.group({
      locationId: this.fb.control((initial?.locationId ?? '').trim(), { nonNullable: true }),
      quantity: this.fb.control(initial?.quantity != null ? Number(initial.quantity) : 0, {
        validators: [Validators.required, Validators.min(0)],
        nonNullable: true,
      }),
      unit: this.fb.control<MeasurementUnit>(initial?.unit ?? MeasurementUnit.UNIT, {
        validators: [Validators.required],
        nonNullable: true,
      }),
      minThreshold: this.fb.control(
        initial?.minThreshold != null ? Number(initial.minThreshold) : null
      ),
      expiryDate: this.fb.control(initial?.expiryDate ? this.toDateInputValue(initial.expiryDate) : ''),
      opened: this.fb.control(initial?.opened ?? false),
    });
  }

  closeFormModal(): void {
    this.showCreateModal = false;
    this.isSaving = false;
    this.editingItem = null;
  }

  /**
   * Persist the form payload, close the modal, and surface contextual feedback.
   * Handles both creation and update flows through the store.
   */
  async submitItem(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    try {
      const item = this.buildItemPayload(this.editingItem ?? undefined);
      const previous = this.editingItem;
      let successMessage: string;
      if (previous) {
        await this.pantryStore.updateItem(item);
        successMessage = this.buildUpdateSuccessMessage(previous, item);
      } else {
        await this.pantryStore.addItem(item);
        successMessage = this.buildCreateSuccessMessage(item);
      }
      this.closeFormModal();
      await this.presentToast(successMessage, 'success');
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
    await this.presentToast('🗑️ Producto eliminado.', 'medium');
  }

  /**
   * Apply a quantity delta to a specific location, optimistically update the UI,
   * and debounce persistence to avoid spamming storage.
   */
  async adjustLocationQuantity(item: PantryItem, location: ItemLocationStock, delta: number, event?: Event): Promise<void> {
    event?.stopPropagation();
    if (!item?._id || !location?.locationId) {
      return;
    }
    const prevQuantity = Number(location.quantity ?? 0);
    const next = Math.max(0, prevQuantity + delta);
    if (next === prevQuantity) {
      return;
    }

    const updatedLocal = this.updateLocalLocationQuantity(item._id, location.locationId, next);
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

  async discardExpiredItem(item: PantryItem, event?: Event): Promise<void> {
    if (!this.isExpired(item)) {
      return;
    }
    await this.deleteItem(item, event, true);
  }

  getTotalQuantity(item: PantryItem): number {
    return this.pantryStore.getItemTotalQuantity(item);
  }

  getTotalMinThreshold(item: PantryItem): number {
    return this.pantryStore.getItemTotalMinThreshold(item);
  }

  getPrimaryUnit(item: PantryItem): MeasurementUnit {
    return this.pantryStore.getItemPrimaryUnit(item);
  }

  getUnitLabelForItem(item: PantryItem): string {
    return this.pantryStore.getUnitLabel(this.getPrimaryUnit(item));
  }

  getUnitLabel(unit: MeasurementUnit): string {
    return this.pantryStore.getUnitLabel(unit);
  }

  getLocationLabel(locationId: string | undefined): string {
    return this.formatFriendlyName(locationId ?? '', 'Unassigned');
  }

  /** Derive a human-readable status badge for the item card header. */
  getStatus(item: PantryItem): { label: string; color: string } {
    const quantity = this.getTotalQuantity(item);
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

  /** Pair the status with an icon that conveys urgency at a glance. */
  getStatusIcon(item: PantryItem): string {
    const quantity = this.getTotalQuantity(item);
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
    return this.pantryStore.isItemLowStock(item);
  }

  isExpired(item: PantryItem): boolean {
    return this.pantryStore.isItemExpired(item);
  }

  isNearExpiry(item: PantryItem): boolean {
    return this.pantryStore.isItemNearExpiry(item);
  }

  trackByItemId(_: number, item: PantryItem): string {
    return item._id;
  }

  isExpanded(item: PantryItem): boolean {
    return this.expandedItems.has(item._id);
  }

  /** Toggle the expansion panel for a given item without triggering parent handlers. */
  toggleItemExpansion(item: PantryItem, event?: Event): void {
    event?.stopPropagation();
    if (this.expandedItems.has(item._id)) {
      this.expandedItems.delete(item._id);
    } else {
      this.expandedItems.add(item._id);
    }
  }

  /** Apply search, filter, and sorting rules while keeping expansion state in sync. */
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
      if (
        location !== 'all' &&
        !item.locations.some(loc => (loc.locationId ?? '') === location)
      ) {
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

  /** Sort items by urgency (expiry/quantity) and finally by name for stable output. */
  private compareItems(a: PantryItem, b: PantryItem): number {
    const sortOption = this.sortOption();
    const expirationWeightDiff = this.getExpirationWeight(a) - this.getExpirationWeight(b);
    if (expirationWeightDiff !== 0) {
      return expirationWeightDiff;
    }

    switch (sortOption) {
      case 'quantity': {
        const quantityDiff = this.getTotalQuantity(b) - this.getTotalQuantity(a);
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
    const expiry = this.computeEarliestExpiry(item.locations);
    if (!expiry) {
      return Number.MAX_SAFE_INTEGER;
    }
    return new Date(expiry).getTime();
  }

  /** Aggregate counts for the summary bar shown above the list. */
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

  /** Build select options that indicate how many items belong to each location. */
  private computeLocationOptions(items: PantryItem[]): Array<{ id: string; label: string; count: number }> {
    const counts = new Map<string, { label: string; count: number }>();

    for (const item of items) {
      const seen = new Set<string>();
      for (const location of item.locations) {
        const id = (location.locationId ?? '').trim();
        if (seen.has(id)) {
          continue;
        }
        seen.add(id);
        const label = this.formatFriendlyName(id, 'Unassigned');
        const current = counts.get(id);
        if (current) {
          current.count += 1;
        } else {
          counts.set(id, { label, count: 1 });
        }
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

  /** Return the earliest expiry date present in the provided locations array. */
  private computeEarliestExpiry(locations: ItemLocationStock[]): string | undefined {
    const dates = locations
      .map(loc => loc.expiryDate)
      .filter((date): date is string => Boolean(date));
    if (!dates.length) {
      return undefined;
    }
    return dates.reduce((earliest, current) => {
      if (!earliest) {
        return current;
      }
      return new Date(current) < new Date(earliest) ? current : earliest;
    });
  }

  /**
   * Mutate the local signal cache to reflect a quantity change before persistence.
   * Ensures a location entry exists even if the delta introduces a new bucket.
   */
  private updateLocalLocationQuantity(itemId: string, locationId: string, quantity: number): PantryItem | null {
    let updatedItem: PantryItem | null = null;
    this.itemsState.update(items =>
      items.map(item => {
        if (item._id !== itemId) {
          return item;
        }
        let found = false;
        const nextLocations = item.locations.map(loc => {
          if (loc.locationId === locationId) {
            found = true;
            return {
              ...loc,
              quantity,
            };
          }
          return loc;
        });

        if (!found) {
          nextLocations.push({
            locationId,
            quantity,
            unit: item.locations[0]?.unit ?? MeasurementUnit.UNIT,
          });
        }

        const updated: PantryItem = {
          ...item,
          locations: nextLocations,
          expirationDate: this.computeEarliestExpiry(nextLocations),
          updatedAt: new Date().toISOString(),
        };

        updatedItem = updated;
        return updated;
      })
    );

    return updatedItem;
  }

  /** Debounce stock writes so rapid tap interactions batch into fewer saves. */
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
          const message = this.buildStockUpdateMessage(pending);
          if (message) {
            await this.presentToast(message, 'success');
          }
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

  /** Craft a toast message summarizing a newly created item. */
  private buildCreateSuccessMessage(item: PantryItem): string {
    const name = item.name?.trim() || 'Producto';
    const quantityText = this.formatQuantityForMessage(
      this.getTotalQuantity(item),
      this.getPrimaryUnit(item)
    );
    const breakdown = this.formatLocationBreakdown(item.locations);
    const quantitySegment = quantityText ? ` (${quantityText})` : '';
    const breakdownSegment = breakdown ? ` · ${breakdown}` : '';
    return `✅ ${name} añadido${quantitySegment}${breakdownSegment}.`;
  }

  /** Explain what changed during an update so users understand the persisted action. */
  private buildUpdateSuccessMessage(previous: PantryItem, updated: PantryItem): string {
    const previousBreakdown = this.formatLocationBreakdown(previous.locations);
    const nextBreakdown = this.formatLocationBreakdown(updated.locations);
    if (previousBreakdown !== nextBreakdown) {
      return `📦 Ubicaciones actualizadas: ${nextBreakdown || 'sin asignar'}.`;
    }

    const previousQuantity = this.getTotalQuantity(previous);
    const nextQuantity = this.getTotalQuantity(updated);
    if (previousQuantity !== nextQuantity) {
      const quantityText = this.formatQuantityForMessage(nextQuantity, this.getPrimaryUnit(updated));
      if (quantityText) {
        return `💾 Stock actualizado: ${updated.name} (${quantityText}).`;
      }
      return '💾 Stock actualizado.';
    }

    return '💾 Cambios guardados.';
  }

  /** Produce a brief toast summarizing the current stock state. */
  private buildStockUpdateMessage(item: PantryItem): string {
    const quantityText = this.formatQuantityForMessage(
      this.getTotalQuantity(item),
      this.getPrimaryUnit(item)
    );
    if (quantityText) {
      return `💾 Stock actualizado: ${item.name} (${quantityText}).`;
    }
    return '💾 Stock actualizado.';
  }

  /** Human readable breakdown describing how quantities are distributed. */
  private formatLocationBreakdown(locations: ItemLocationStock[]): string {
    if (!locations.length) {
      return '';
    }
    return locations
      .map(location => {
        const quantity = this.roundDisplayQuantity(Number(location.quantity ?? 0));
        const unitLabel = this.getUnitLabel(location.unit ?? MeasurementUnit.UNIT);
        const label = this.formatFriendlyName(location.locationId ?? '', 'Unassigned');
        return `${quantity} ${unitLabel} · ${label}`;
      })
      .join(', ');
  }

  private formatQuantityForMessage(quantity?: number | null, unit?: MeasurementUnit | string | null): string | null {
    if (quantity == null || Number.isNaN(Number(quantity))) {
      return null;
    }
    const formattedNumber = this.roundDisplayQuantity(Number(quantity)).toLocaleString('es-ES', {
      maximumFractionDigits: 2,
    });
    if (typeof unit === 'string' && !(unit in MeasurementUnit)) {
      return `${formattedNumber} ${unit}`.trim();
    }
    const unitLabel = this.getUnitLabel((unit as MeasurementUnit) ?? MeasurementUnit.UNIT);
    return `${formattedNumber} ${unitLabel}`.trim();
  }

  private roundDisplayQuantity(value: number): number {
    const num = Number.isFinite(value) ? value : 0;
    return Math.round(num * 100) / 100;
  }

  /**
   * Transform the reactive form into a normalized PantryItem ready for persistence,
   * handling type conversion, default location creation, and legacy compatibility.
   */
  private buildItemPayload(existing?: PantryItem): PantryItem {
    const { name, categoryId, isBasic } = this.form.value;
    const identifier = existing?._id ?? createDocumentId('item');
    const now = new Date().toISOString();

    const locations: ItemLocationStock[] = this.locationsArray.controls.map(control => {
      const value = control.value as any;
      const rawLocationId = (value?.locationId ?? '').trim();
      const locationId = rawLocationId || 'unassigned';
      const quantity = value?.quantity != null ? Number(value.quantity) : 0;
      const unit = value?.unit ?? MeasurementUnit.UNIT;
      const minThreshold = value?.minThreshold != null && value.minThreshold !== ''
        ? Number(value.minThreshold)
        : undefined;
      const expiryDate = value?.expiryDate ? new Date(value.expiryDate).toISOString() : undefined;
      const opened = value?.opened ? true : undefined;

      return {
        locationId,
        quantity: Number.isFinite(quantity) ? quantity : 0,
        unit,
        minThreshold,
        expiryDate,
        opened,
      };
    });

    const normalizedLocations = locations.length
      ? locations
      : [{ locationId: 'unassigned', quantity: 0, unit: MeasurementUnit.UNIT }];

    const earliestExpiry = this.computeEarliestExpiry(normalizedLocations);

    const base: PantryItem = {
      _id: identifier,
      _rev: existing?._rev,
      type: 'item',
      householdId: existing?.householdId ?? DEFAULT_HOUSEHOLD_ID,
      name: (name ?? '').trim(),
      categoryId: (categoryId ?? '').trim(),
      locations: normalizedLocations,
      isBasic: isBasic ? true : undefined,
      expirationDate: earliestExpiry,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    return base;
  }

  /** Build category filter metadata including how many items are low within each group. */
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

  /** Determine whether the item matches the provided free-text search term. */
  private matchesSearch(item: PantryItem, search: string): boolean {
    const name = item.name?.toLowerCase() ?? '';
    const category = item.categoryId?.toLowerCase() ?? '';
    if (name.includes(search) || category.includes(search)) {
      return true;
    }
    return item.locations.some(loc => {
      const id = loc.locationId?.toLowerCase() ?? '';
      const label = this.formatFriendlyName(loc.locationId ?? '', '').toLowerCase();
      return id.includes(search) || label.includes(search);
    });
  }

}
