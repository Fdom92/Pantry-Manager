# Pantry Modal Services

Specialized services for managing modal state in the pantry feature.

## 📁 Structure

```
modals/
├── pantry-edit-item-modal-state.service.ts       # Full edit/create modal
├── pantry-fast-add-modal-state.service.ts        # Fast add modal
└── pantry-batches-modal-state.service.ts         # Batch viewing modal
```

---

## 🎯 Services

### 1. PantryEditItemModalStateService

**Responsibility**: Complete management of the item edit/create modal

```typescript
@Injectable()
export class PantryEditItemModalStateService {
  // Modal state
  readonly isOpen = signal(false);
  readonly mode = signal<'create' | 'edit'>('create');
  readonly isSaving = signal(false);

  // Reactive form
  readonly form: FormGroup;

  // Dynamic options
  readonly categoryOptions: Signal<SelectOption[]>
  readonly locationOptions: Signal<SelectOption[]>
  readonly supermarketOptions: Signal<SelectOption[]>

  // Main methods
  openForCreate(): void
  openForEdit(item: PantryItem): void
  closeModal(): void
  async save(): Promise<void>
}
```

**Features**:

- ✅ Reactive form with FormBuilder
- ✅ Real-time validation
- ✅ Dynamic catalog management (categories, locations, supermarkets)
- ✅ Create vs edit mode
- ✅ Integration with CatalogOptionsService to add values on-the-fly
- ✅ Event logging in history

**Form fields**:

```typescript
{
  name: string (required)
  categoryId: string | null
  supermarket: string | null
  quantity: number (default: 0)
  expirationDate: string | null
  locationId: string (default: UNASSIGNED_LOCATION_KEY)
  minThreshold: number | null
  isBasic: boolean (default: false)
  opened: boolean (default: false)
}
```

**Save flow**:

```
1. Validate form
   → If invalid, return early

2. Build payload
   → Use buildItemPayload() from domain

3. Persist
   → Create mode: pantryStore.addItem()
   → Edit mode: pantryStore.updateItem()

4. Log event
   → eventManager.logCreate() or logEdit()

5. Close modal
   → closeModal()
   → form.reset()
```

---

### 2. PantryFastAddModalStateService

**Responsibility**: Simplified modal for adding multiple items quickly

```typescript
@Injectable()
export class PantryFastAddModalStateService {
  // Modal state
  readonly fastAddModalOpen = signal(false);
  readonly isFastAdding = signal(false);

  // Search state and entries
  readonly fastAddQuery = signal('');
  readonly fastAddEntries = signal<FastAddEntry[]>([]);

  // Computed
  readonly fastAddOptions: Signal<AutocompleteItem<PantryItem>[]>
  readonly hasFastAddEntries: Signal<boolean>
  readonly showFastAddEmptyAction: Signal<boolean>

  // Main methods
  openFastAddModal(): void
  closeFastAddModal(): void
  async submitFastAdd(): Promise<void>
  addFastAddEntry(option: AutocompleteItem<PantryItem>): void
  adjustFastAddEntry(entry: FastAddEntry, delta: number): void
}
```

**Features**:

- ✅ Autocomplete for fast search
- ✅ Add new or existing items
- ✅ Adjust quantity before saving
- ✅ Batch submit (multiple items at once)
- ✅ Dynamic filtering (excludes already added items)

**FastAddEntry model**:

```typescript
interface FastAddEntry {
  id: string;           // 'fast-add:{itemId}' or 'fast-add:new:{normalized-name}'
  name: string;         // Item name
  quantity: number;     // Quantity to add
  item?: PantryItem;    // Existing item (if not new)
  isNew: boolean;       // true if new item
}
```

**Complete flow**:

```
1. User opens modal
   → openFastAddModal()
   → Reset entries and query

2. User searches items
   → onFastAddQueryChange('milk')
   → fastAddQuery updated
   → fastAddOptions re-computed (autocomplete)

3a. User selects existing item
   → addFastAddEntry(option)
   → Entry added with quantity=1
   → Item excluded from options

3b. User types new name and presses "Add"
   → addFastAddEntryFromQuery()
   → Search for case-insensitive match
   → If exists: add as existing
   → If not exists: add as new (isNew=true)

4. User adjusts quantities
   → adjustFastAddEntry(entry, +1 or -1)
   → If quantity reaches 0, entry is removed

5. User submits
   → submitFastAdd()
   → For each entry:
     - If isNew: buildFastAddItemPayload() + addItem()
     - If exists: addNewLot() with quantity
   → Event logging
   → Modal closure

6. Cleanup
   → dismissFastAddModal()
   → Entries and query reset
```

**Pattern advantages**:

- Very fast for frequent users
- Reduces clicks (multiple items at once)
- Autocomplete speeds up selection
- Allows creating items on-the-fly

---

### 3. PantryBatchesModalStateService

**Responsibility**: Detailed batch viewing modal for an item

```typescript
@Injectable()
export class PantryBatchesModalStateService {
  // Modal state
  readonly showBatchesModal = signal(false);
  readonly selectedBatchesItem = signal<PantryItem | null>(null);

  // Batch summaries (injected from parent)
  batchSummaries!: Signal<Map<string, BatchSummaryMeta>>;

  // Main methods
  openBatchesModal(item: PantryItem, event?: Event): void
  closeBatchesModal(): void
  getTotalBatchCount(item: PantryItem): number
  getSortedBatches(item: PantryItem): BatchEntryMeta[]
  buildItemCardViewModel(item: PantryItem): PantryItemCardViewModel
}
```

**Features**:

- ✅ Read-only view of all batches
- ✅ Sorted by expiration date (FIFO)
- ✅ Shows status of each batch (expired, near-expiry, normal)
- ✅ Date and quantity formatting
- ✅ Delegation to PantryViewModelService for formatting

**BatchEntryMeta model**:

```typescript
interface BatchEntryMeta {
  location: string;        // 'Fridge', 'Pantry', etc.
  batches: ItemBatch[];    // Batches in this location
}
```

**BatchSummaryMeta model**:

```typescript
interface BatchSummaryMeta {
  total: number;                    // Total batches
  sorted: BatchEntryMeta[];         // Batches grouped by location
}
```

**Flow**:

```
1. User clicks on batch badge
   → openBatchesModal(item, event)
   → selectedBatchesItem.set(item)
   → showBatchesModal.set(true)

2. Modal renders
   → getTotalBatchCount() gets total
   → getSortedBatches() gets sorted batches
   → For each batch:
     - formatBatchDate() → 'Feb 15, 2026'
     - formatBatchQuantity() → '2.5 un'
     - getBatchStatus() → { label, color, icon }

3. User views information
   → Card header with item global status
   → List of locations
   → For each location, list of batches
   → Each batch shows: quantity, date, status, opened

4. User closes modal
   → closeBatchesModal()
   → showBatchesModal.set(false)
   → selectedBatchesItem.set(null)
```

**batchSummaries dependencies**:

```typescript
// PantryStateService injects the computed signal
constructor() {
  this.batchesModal.batchSummaries = this.batchSummaries;
}

// Computed in PantryStateService
readonly batchSummaries = computed(() =>
  this.viewModel.computeBatchSummaries(this.pantryItemsState())
);
```

This avoids circular dependency between modal service and view model service.

---

## 🎨 Common Patterns

### 1. Base Modal State Structure

All modal services follow this structure:

```typescript
@Injectable()
export class SomeModalStateService {
  // 1. Modal state
  readonly modalOpen = signal(false);
  readonly isSaving = signal(false);

  // 2. Modal data
  readonly modalData = signal<SomeData | null>(null);

  // 3. Computed signals
  readonly someComputed = computed(() => {
    // Derived logic
  });

  // 4. Opening methods
  openModal(data?: SomeData): void {
    this.modalData.set(data ?? null);
    this.modalOpen.set(true);
  }

  // 5. Close with cleanup
  closeModal(): void {
    if (!this.modalOpen()) return;  // Guard
    this.modalOpen.set(false);
    this.modalData.set(null);
    // More cleanup...
  }

  // 6. Dismiss (without full cleanup)
  dismissModal(): void {
    this.modalOpen.set(false);
  }

  // 7. Main operation
  async save(): Promise<void> {
    if (this.isSaving()) return;  // Prevent double-submit

    await withSignalFlag(this.isSaving, async () => {
      // Save logic
    }).catch(err => {
      console.error('[Service] save error', err);
    });
  }
}
```

### 2. Guard Clauses

```typescript
// ✅ GOOD: Guard clause at the beginning
closeModal(): void {
  if (!this.modalOpen()) {
    return;  // Do nothing if already closed
  }
  this.modalOpen.set(false);
  // Cleanup...
}

// ❌ BAD: Without guard
closeModal(): void {
  this.modalOpen.set(false);  // Always executes
}
```

**Benefits**:

- Avoids unnecessary work
- Prevents bugs from double execution
- Makes code more robust

### 3. Prevent Double-Submit

```typescript
async submitFastAdd(): Promise<void> {
  if (this.isFastAdding()) {
    return;  // Operation already in progress
  }

  await withSignalFlag(this.isFastAdding, async () => {
    // Submit logic
  });
}
```

### 4. Close vs Dismiss

```typescript
// Close: Full cleanup
closeModal(): void {
  this.modalOpen.set(false);
  this.form.reset();
  this.entries.set([]);
  this.query.set('');
}

// Dismiss: Only hide (for backdrop click)
dismissModal(): void {
  this.modalOpen.set(false);
}
```

**When to use each**:

- `close()`: User cancels or completes action (Cancel button, Save button)
- `dismiss()`: Backdrop click, swipe-to-dismiss (may want to reopen)

---

## 🧪 Testing

### Testing Modal State

```typescript
describe('PantryFastAddModalStateService', () => {
  let service: PantryFastAddModalStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PantryFastAddModalStateService]
    });
    service = TestBed.inject(PantryFastAddModalStateService);
  });

  it('should open modal and reset state', () => {
    // Setup: closed modal with previous data
    service.fastAddEntries.set([{ id: '1', name: 'Test', quantity: 1 }]);
    service.fastAddQuery.set('test');

    // Action
    service.openFastAddModal();

    // Assert
    expect(service.fastAddModalOpen()).toBe(true);
    expect(service.fastAddEntries()).toEqual([]);
    expect(service.fastAddQuery()).toBe('');
  });

  it('should add entry and increment quantity if already exists', () => {
    const item = { _id: '1', name: 'Milk' };
    const option = { id: '1', title: 'Milk', raw: item };

    // First time: add entry
    service.addFastAddEntry(option);
    expect(service.fastAddEntries().length).toBe(1);
    expect(service.fastAddEntries()[0].quantity).toBe(1);

    // Second time: increment quantity
    service.addFastAddEntry(option);
    expect(service.fastAddEntries().length).toBe(1);  // Same entry
    expect(service.fastAddEntries()[0].quantity).toBe(2);  // Quantity++
  });

  it('should remove entry when quantity reaches 0', () => {
    const entry = { id: '1', name: 'Test', quantity: 1, isNew: true };
    service.fastAddEntries.set([entry]);

    // Adjust -1
    service.adjustFastAddEntry(entry, -1);

    // Entry removed
    expect(service.fastAddEntries().length).toBe(0);
  });
});
```

### Testing Guard Clauses

```typescript
it('should not close modal if already closed', () => {
  service.fastAddModalOpen.set(false);
  const spy = spyOn(service.fastAddEntries, 'set');

  service.closeFastAddModal();

  // Cleanup NOT executed
  expect(spy).not.toHaveBeenCalled();
});
```

### Testing Prevent Double-Submit

```typescript
it('should prevent double submit', fakeAsync(() => {
  service.isFastAdding.set(true);  // Simulate submit in progress

  const result = service.submitFastAdd();

  // Second call returns immediately
  expect(result).toBeUndefined();
  expect(mockStore.addItem).not.toHaveBeenCalled();
}));
```

---

## 🚫 Anti-Patterns

### ❌ NO: Business logic in modal service

```typescript
// ❌ BAD: Calculations in modal service
export class ModalService {
  calculateTotal(entries: Entry[]): number {
    return entries.reduce((sum, e) => sum + e.price * e.quantity, 0);
  }
}

// ✅ GOOD: Logic in domain
export function calculateTotal(entries: Entry[]): number {
  return entries.reduce((sum, e) => sum + e.price * e.quantity, 0);
}
```

### ❌ NO: Modal service injected in multiple places

```typescript
// ❌ BAD: Modal service used outside its scope
export class OtherComponent {
  private readonly fastAddModal = inject(PantryFastAddModalStateService);
}

// ✅ GOOD: Only the state orchestrator injects it
export class PantryStateService {
  private readonly fastAddModal = inject(PantryFastAddModalStateService);

  // Expose methods if needed
  openFastAddModal = () => this.fastAddModal.openFastAddModal();
}
```

### ❌ NO: Inject modal service as root

```typescript
// ❌ BAD: Modal service as singleton
@Injectable({ providedIn: 'root' })
export class SomeModalStateService {
  // State shared across components = potential bug
}

// ✅ GOOD: Modal service without 'root'
@Injectable()
export class SomeModalStateService {
  // New instance per parent service
}
```

---

## ✅ Checklist for New Modal Services

When creating a new modal service, make sure to include:

- [ ] `readonly modalOpen = signal(false)`
- [ ] `readonly isSaving = signal(false)` (if there's save)
- [ ] `openModal()` with state reset
- [ ] `closeModal()` with guard clause and full cleanup
- [ ] `dismissModal()` only for visual closure
- [ ] Guard in `closeModal()`: `if (!this.modalOpen()) return`
- [ ] Guard in `save()`: `if (this.isSaving()) return`
- [ ] Use `withSignalFlag()` in async operations
- [ ] NO `providedIn: 'root'`
- [ ] Inject in orchestrator service, not in components

---

## 📚 References

- [Pantry Services README](../README.md) - Overview of all services
- [Services Layer](../../README.md) - General services guide
- [State Management](../../../README.md) - Signals architecture

---

**Feature**: Pantry Modals
**Last updated**: 2026-02-12
