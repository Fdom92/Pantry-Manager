# Pantry Services

Specialized services for pantry inventory management (main feature of the application).

## 📁 Structure

```
pantry/
├── pantry.service.ts                      # 📦 Data Service (CRUD + persistence)
├── pantry-store.service.ts                # 📦 Reactive store (filtering + pagination)
├── pantry-state.service.ts                # 🎛️ State orchestrator (UI coordination)
├── pantry-view-model.service.ts           # 🎨 ViewModel (transformation for UI)
├── pantry-batch-operations.service.ts     # ⚙️ Batch operations (debounced)
├── pantry-list-ui-state.service.ts        # 🎛️ List state (expand/collapse/delete)
├── modals/
│   ├── pantry-edit-item-modal-state.service.ts       # Full edit modal
│   ├── pantry-fast-add-modal-state.service.ts        # Quick add modal
│   └── pantry-batches-modal-state.service.ts         # View batches modal
└── index.ts
```

## 🎯 Main Services

### 1. PantryService - Data Service

**Responsibility**: CRUD operations + persistence in PouchDB

```typescript
@Injectable({ providedIn: 'root' })
export class PantryService extends StorageService<PantryItem> {
  // Basic CRUD
  async save(item: PantryItem): Promise<PantryItem>
  async get(id: string): Promise<PantryItem | null>
  async remove(id: string): Promise<void>
  async getAll(): Promise<PantryItem[]>

  // Specific operations
  async addNewLot(itemId: string, batch: ItemBatch): Promise<PantryItem | null>
  async updateBatches(itemId: string, batches: ItemBatch[]): Promise<PantryItem | null>
}
```

**Characteristics**:

- ✅ Singleton (`providedIn: 'root'`)
- ✅ Inherits from `StorageService<PantryItem>`
- ✅ Only persistence operations
- ✅ Does not manage reactive state

---

### 2. PantryStoreService - Reactive Store

**Responsibility**: Reactive store with filtering, search and pagination

```typescript
@Injectable({ providedIn: 'root' })
export class PantryStoreService {
  // State signals
  readonly loadedProducts: Signal<PantryItem[]>
  readonly filteredProducts: Signal<PantryItem[]>
  readonly activeProducts: Signal<PantryItem[]>
  readonly loading: Signal<boolean>
  readonly searchQuery: Signal<string>
  readonly activeFilters: Signal<PantryFilterState>

  // Mutations
  async ensureFirstPageLoaded(): Promise<void>
  async addItem(item: PantryItem): Promise<void>
  async updateItem(item: PantryItem): Promise<void>
  async removeItem(id: string): Promise<void>

  // Filtering
  setSearchQuery(query: string): void
  setFilters(filters: PantryFilterState): void

  // Real-time
  watchRealtime(): void
}
```

**Characteristics**:

- ✅ Singleton (`providedIn: 'root'`)
- ✅ Manages reactive filtering pipeline
- ✅ Incremental pagination (300 items per page)
- ✅ Real-time updates from PouchDB changes feed
- ✅ Computed signals for derived data

**Data pipeline**:

```
DB → loadedProducts → (search) → (filters) → filteredProducts → (pagination) → activeProducts
```

---

### 3. PantryStateService - Orchestrator

**Responsibility**: Main orchestrator for pantry page

```typescript
@Injectable()  // NO 'root' - page scope
export class PantryStateService {
  // Injection of specialized services
  private readonly pantryStore = inject(PantryStoreService);
  private readonly batchOps = inject(PantryBatchOperationsService);
  private readonly listUi = inject(PantryListUiStateService);
  private readonly fastAddModal = inject(PantryFastAddModalStateService);
  private readonly batchesModal = inject(PantryBatchesModalStateService);

  // Coordinated signals
  readonly groups: Signal<PantryGroup[]>
  readonly filterChips: Signal<FilterChipViewModel[]>
  readonly summary: Signal<PantrySummaryMeta>

  // Lifecycle
  async ionViewWillEnter(): Promise<void>
  async loadItems(): Promise<void>

  // Delegation to specialized services
  openFastAddModal = () => this.fastAddModal.openFastAddModal();
  deleteItem = (item) => this.listUi.deleteItem(item);
  adjustBatchQuantity = (...args) => this.batchOps.adjustBatchQuantity(...args);
}
```

**Characteristics**:

- ✅ NOT singleton - instance per component
- ✅ Orchestrator pattern - coordinates multiple services
- ✅ Delegates responsibilities to specialized services
- ✅ Only coordination, no specific logic

**Coordinated services**:

1. `PantryStoreService` - Data
2. `PantryBatchOperationsService` - Batch operations
3. `PantryListUiStateService` - List UI
4. `PantryFastAddModalStateService` - Quick add modal
5. `PantryBatchesModalStateService` - View batches modal
6. `PantryViewModelService` - Data transformation

---

### 4. PantryViewModelService - UI Transformation

**Responsibility**: Transforms domain models into ViewModels for UI

```typescript
@Injectable({ providedIn: 'root' })
export class PantryViewModelService {
  // ViewModel construction
  buildItemCardViewModel(config: {
    item: PantryItem;
    summary: BatchSummaryMeta;
    totalQuantity: number;
  }): PantryItemCardViewModel

  buildGroups(items: PantryItem[]): PantryGroup[]
  buildFilterChips(summary: PantrySummaryMeta): FilterChipViewModel[]
  buildSummary(items: PantryItem[]): PantrySummaryMeta

  // Formatting
  formatBatchDate(batch: ItemBatch): string
  formatBatchQuantity(batch: ItemBatch): string
  getBatchStatus(batch: ItemBatch): BatchStatusMeta
}
```

**Characteristics**:

- ✅ Singleton (`providedIn: 'root'`)
- ✅ Transforms data without business logic
- ✅ Uses domain functions when necessary
- ✅ Handles translations and i18n

---

### 5. PantryBatchOperationsService - Batch Operations

**Responsibility**: Quantity adjustments with debouncing and optimistic updates

```typescript
@Injectable()
export class PantryBatchOperationsService {
  async adjustBatchQuantity(
    item: PantryItem,
    locationId: string,
    batch: ItemBatch,
    delta: number,
    event?: Event,
    pantryItemsSignal?: WritableSignal<PantryItem[]>
  ): Promise<void>

  cancelPendingStockSave(itemId: string): void
  clearAll(): void
  mergePendingItems(source: PantryItem[]): PantryItem[]
}
```

**Characteristics**:

- ✅ NOT singleton - PantryStateService scope
- ✅ 500ms debouncing on saves
- ✅ Optimistic updates (UI updates immediately)
- ✅ Manages pendingItems Map for unpersisted changes
- ✅ Logs events to history

**Quantity adjustment flow**:

```
1. User clicks +/-
2. Immediate optimistic update (pendingItems Map)
3. UI updates via signal
4. Debounce timer resets (500ms)
5. After 500ms without changes → persistence
6. Event logged to history
```

---

### 6. PantryListUiStateService - List UI State

**Responsibility**: Management of expansion, collapse and deletion of items

```typescript
@Injectable()
export class PantryListUiStateService {
  // UI signals
  readonly collapsedGroups: WritableSignal<Set<string>>
  readonly deletingItems: WritableSignal<Set<string>>
  readonly skeletonPlaceholders: Signal<number[]>

  // Expand/collapse
  toggleItemExpansion(item: PantryItem, event?: Event): void
  toggleGroupCollapse(groupKey: string, event?: Event): void
  isExpanded(item: PantryItem): boolean
  isGroupCollapsed(groupKey: string): boolean

  // Deletion
  async deleteItem(
    item: PantryItem,
    event?: Event,
    skipConfirm?: boolean,
    onBeforeDelete?: (itemId: string) => void
  ): Promise<void>
  isDeleting(item: PantryItem): boolean
}
```

**Characteristics**:

- ✅ NOT singleton - PantryStateService scope
- ✅ Manages expanded/collapsed state
- ✅ Deletion animations (220ms)
- ✅ Deletion confirmation with dialog
- ✅ Automatic synchronization with visible items

---

### 7. Modal Services (modals/)

Three specialized services for modals:

#### PantryEditItemModalStateService

- Full item edit modal
- Reactive form with validation
- Management of categories, locations, supermarkets

#### PantryFastAddModalStateService

- Simplified quick add modal
- Autocomplete for quick selection
- Support for multiple simultaneous items

#### PantryBatchesModalStateService

- Batch visualization modal
- Shows all batches with states
- Sorted by expiration date

**Common pattern**:

```typescript
@Injectable()
export class SomeModalStateService {
  readonly modalOpen = signal(false);
  readonly isSaving = signal(false);

  openModal(): void { this.modalOpen.set(true); }
  closeModal(): void { this.modalOpen.set(false); }
  dismissModal(): void { this.modalOpen.set(false); }
}
```

---

## 🔄 Complete Flows

### Flow: Quick Add Item

```
1. User clicks "+" FAB button
   → PantryStateService.openFastAddModal()

2. Modal opens
   → PantryFastAddModalStateService.openFastAddModal()
   → fastAddModalOpen.set(true)

3. User searches and selects items
   → addFastAddEntry() adds entry with quantity=1
   → fastAddEntries signal updated
   → autocomplete options re-computed

4. User adjusts quantities
   → adjustFastAddEntry() modifies quantity
   → If quantity=0, entry is removed

5. User submits
   → submitFastAdd() processes entries
   → For new items: pantryStore.addItem()
   → For existing items: pantryStore.addNewLot()
   → Event logging: eventManager.logFastAdd()

6. Modal closes
   → dismissFastAddModal()
   → fastAddModalOpen.set(false)
   → Cleanup of entries and query
```

### Flow: Adjust Batch Quantity

```
1. User clicks +/- on a batch
   → PantryStateService.adjustBatchQuantity()

2. Delegated to operations service
   → PantryBatchOperationsService.adjustBatchQuantity()

3. Optimistic update
   → Updated item saved in pendingItems Map
   → pantryItemsSignal updates immediately
   → UI shows new quantity WITHOUT waiting for DB

4. Debounce timer
   → Previous timer cancelled if exists
   → New timer scheduled (500ms)

5. After 500ms without changes
   → Batch sanitized (remove quantity=0)
   → pantryStore.updateItem() persists
   → eventManager.logStockChange() logs event
   → pendingItems.delete(itemId)

6. Reactive UI
   → Signal change → computed signals updated
   → Card shows persisted quantity
```

### Flow: Delete Item

```
1. User swipes to delete
   → PantryStateService.deleteItem()

2. Delegated to listUi service
   → PantryListUiStateService.deleteItem()

3. Confirmation
   → ConfirmService.showConfirm() shows dialog
   → User confirms or cancels

4. If confirmed
   → deletingItems Set marks item as "deleting"
   → CSS animation (220ms)

5. Pre-delete callback
   → onBeforeDelete(itemId) executed
   → Cancels pending batch operations

6. Persistence
   → pantryStore.removeItem(id)
   → eventManager.logDelete(item)

7. Cleanup
   → deletingItems.delete(itemId)
   → Reactive UI removes item from list
```

---

## 📊 Service Relationships

```
PantryStateService (Orchestrator)
├─→ PantryStoreService (Data)
│   └─→ PantryService (Persistence)
│       └─→ StorageService (PouchDB)
│
├─→ PantryViewModelService (Transformation)
│   └─→ Domain functions
│
├─→ PantryBatchOperationsService
│   ├─→ PantryStoreService
│   ├─→ PantryViewModelService
│   └─→ HistoryEventManagerService
│
├─→ PantryListUiStateService
│   ├─→ PantryStoreService
│   ├─→ ConfirmService
│   └─→ HistoryEventManagerService
│
├─→ PantryFastAddModalStateService
│   ├─→ PantryStoreService
│   ├─→ HistoryEventManagerService
│   └─→ Domain functions (buildFastAddItemPayload)
│
└─→ PantryBatchesModalStateService
    └─→ PantryViewModelService
```

---

## 🧪 Testing

### Testing Store Service

```typescript
describe('PantryStoreService', () => {
  let store: PantryStoreService;
  let mockDataService: jasmine.SpyObj<PantryService>;

  beforeEach(() => {
    mockDataService = jasmine.createSpyObj('PantryService', ['getAll']);
    TestBed.configureTestingModule({
      providers: [
        PantryStoreService,
        { provide: PantryService, useValue: mockDataService }
      ]
    });
    store = TestBed.inject(PantryStoreService);
  });

  it('should filter by search query', async () => {
    const items = [
      { _id: '1', name: 'Leche', batches: [] },
      { _id: '2', name: 'Pan', batches: [] }
    ];
    mockDataService.getAll.and.returnValue(Promise.resolve(items));

    await store.ensureFirstPageLoaded();
    store.setSearchQuery('leche');

    const filtered = store.filteredProducts();
    expect(filtered.length).toBe(1);
    expect(filtered[0].name).toBe('Leche');
  });
});
```

### Testing Batch Operations

```typescript
describe('PantryBatchOperationsService', () => {
  let service: PantryBatchOperationsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PantryBatchOperationsService]
    });
    service = TestBed.inject(PantryBatchOperationsService);
  });

  it('should debounce saves', fakeAsync(() => {
    const item = { _id: '1', batches: [{ quantity: 5 }] };

    service.adjustBatchQuantity(item, 'loc1', item.batches[0], 1);
    service.adjustBatchQuantity(item, 'loc1', item.batches[0], 1);

    // Should not save immediately
    expect(mockStore.updateItem).not.toHaveBeenCalled();

    // After 500ms yes
    tick(500);
    expect(mockStore.updateItem).toHaveBeenCalledTimes(1);
  }));
});
```

---

## ✅ Best Practices

### DO: Use the orchestrator for coordination

```typescript
// ✅ GOOD: Component injects only PantryStateService
export class PantryComponent {
  private readonly state = inject(PantryStateService);

  onDeleteClick(item: PantryItem) {
    this.state.deleteItem(item);  // State coordinates everything
  }
}
```

### DON'T: Inject specialized services directly

```typescript
// ❌ BAD: Component injects multiple services
export class PantryComponent {
  private readonly store = inject(PantryStoreService);
  private readonly listUi = inject(PantryListUiStateService);
  private readonly batchOps = inject(PantryBatchOperationsService);

  // Component has too much logic
}
```

### DO: Use domain functions in services

```typescript
// ✅ GOOD: Service delegates to domain
export class PantryViewModelService {
  buildItemCard(item: PantryItem): CardViewModel {
    const status = getItemStatusState(item, new Date(), 7);  // Domain
    return { ...viewModel, status };
  }
}
```

### DON'T: Duplicate business logic

```typescript
// ❌ BAD: Duplicated logic in service
export class PantryViewModelService {
  getStatus(item: PantryItem): Status {
    // Duplicated logic from domain
    if (item.quantity < item.threshold) return 'low';
  }
}
```

---

## 📚 References

- [Services README](../README.md) - General services guide
- [Domain Pantry](../../domain/pantry/) - Business functions
- [Models Pantry](../../models/pantry/) - Data types

---

**Feature**: Pantry
**Last updated**: 2026-02-12
