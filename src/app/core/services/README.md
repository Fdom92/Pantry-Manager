# Services Layer

The services layer contains **all state management, persistence, and coordination** of the application.

## 🎯 Types of Services

### 1. **Data Services** (`*.service.ts`)

Responsibility: CRUD + persistence

```typescript
@Injectable({ providedIn: 'root' })
export class PantryService {
  async getAll(): Promise<PantryItem[]>
  async save(item: PantryItem): Promise<PantryItem>
  async remove(id: string): Promise<void>
}
```

**Features**:

- Interact with databases (PouchDB)
- Pagination management
- CRUD operations
- Usually `providedIn: 'root'`

### 2. **State Services** (`*-state.service.ts`)

Responsibility: UI coordination + reactive state

```typescript
@Injectable()
export class PantryStateService {
  // Reactive signals
  readonly items = signal<PantryItem[]>([]);
  readonly loading = signal(false);

  // Computed signals
  readonly filteredItems = computed(() => {
    return this.items().filter(item => this.matchesFilters(item));
  });

  // Coordination
  async loadItems(): Promise<void>
  openModal(item: PantryItem): void
}
```

**Features**:

- Coordinate multiple services
- Manage UI state (modals, loading, etc.)
- Use signals for reactivity
- NOT `providedIn: 'root'` (page scope)

### 3. **ViewModel Services** (`*-view-model.service.ts`)

Responsibility: Data transformation for UI

```typescript
@Injectable({ providedIn: 'root' })
export class PantryViewModelService {
  buildItemCard(item: PantryItem): ItemCardViewModel {
    return {
      title: item.name,
      quantity: formatQuantity(item.quantity),
      status: this.getStatusLabel(item)
    };
  }
}
```

**Features**:

- Transform model data to UI format
- Value formatting (numbers, dates)
- ViewModel construction
- Translations

### 4. **Operations Services** (`*-operations.service.ts`)

Responsibility: Specific operations with complex logic

```typescript
@Injectable()
export class PantryBatchOperationsService {
  async adjustBatchQuantity(
    item: PantryItem,
    locationId: string,
    batch: ItemBatch,
    delta: number
  ): Promise<void> {
    // Complex adjustment logic + debouncing
  }
}
```

**Features**:

- Isolated complex operations
- May include debouncing
- Optimistic updates
- Cache management

### 5. **Modal State Services** (`modals/*-modal-state.service.ts`)

Responsibility: Modal and form state

```typescript
@Injectable()
export class PantryEditModalStateService {
  readonly isOpen = signal(false);
  readonly form: FormGroup;
  readonly isSaving = signal(false);

  open(item?: PantryItem): void
  close(): void
  async save(): Promise<void>
}
```

**Features**:

- Modal state management
- Form validation
- Save operations
- Modal scope

## 📁 Structure by Feature

```
services/
├── dashboard/              # Dashboard and insights
│   ├── dashboard-insight.service.ts
│   └── dashboard-state.service.ts
├── history/                # Event history
│   ├── history-event-log.service.ts
│   ├── history-event-manager.service.ts
│   └── history-state.service.ts
├── pantry/                 # ⭐ Main feature
│   ├── modals/
│   │   ├── pantry-edit-item-modal-state.service.ts
│   │   ├── pantry-fast-add-modal-state.service.ts
│   │   └── pantry-batches-modal-state.service.ts
│   ├── pantry.service.ts                      # CRUD + persistence
│   ├── pantry-store.service.ts                # Reactive store
│   ├── pantry-state.service.ts                # UI coordination
│   ├── pantry-view-model.service.ts           # Data transformation
│   ├── pantry-batch-operations.service.ts     # Batch operations
│   └── pantry-list-ui-state.service.ts        # List state
├── settings/               # Settings
│   ├── catalog-options.service.ts
│   ├── settings-preferences.service.ts
│   ├── settings-catalogs-state.service.ts
│   └── settings-state.service.ts
├── shopping/               # Shopping list
│   └── shopping-state.service.ts
└── shared/                 # Shared services
    ├── confirm.service.ts
    ├── download.service.ts
    ├── language.service.ts
    ├── logger.service.ts
    └── storage.service.ts
```

## 🔧 Dependency Injection

### Current Pattern: `inject()`

```typescript
@Injectable()
export class PantryStateService {
  // ✅ GOOD: Use inject()
  private readonly pantryStore = inject(PantryStoreService);
  private readonly viewModel = inject(PantryViewModelService);
  private readonly translate = inject(TranslateService);

  constructor() {
    // Clean constructor, only for effects if needed
    effect(() => {
      // ...
    });
  }
}
```

### ❌ DO NOT use constructor injection

```typescript
// ❌ BAD: Old constructor injection
constructor(
  private pantryStore: PantryStoreService,
  private viewModel: PantryViewModelService
) {}
```

## 📊 Signals and Reactivity

### WritableSignals

```typescript
// Mutable state
readonly items = signal<PantryItem[]>([]);
readonly loading = signal(false);

// Modify
this.items.set([...newItems]);
this.loading.set(true);
```

### Computed Signals

```typescript
// Automatically derived
readonly filteredItems = computed(() => {
  const items = this.items(); // Recalculated when items change
  const query = this.searchQuery();
  return items.filter(item => item.name.includes(query));
});
```

### Effects

```typescript
// Reactive side effects
constructor() {
  effect(() => {
    const items = this.items(); // Tracks dependency
    console.log(`Items count: ${items.length}`);
  });
}
```

## 🎭 Common Patterns

### Orchestrator (State Service)

```typescript
@Injectable()
export class PantryStateService {
  // Inject specialized services
  private readonly pantryStore = inject(PantryStoreService);
  private readonly batchOps = inject(PantryBatchOperationsService);
  private readonly listUi = inject(PantryListUiStateService);

  // Delegated signals
  readonly items = this.pantryStore.filteredProducts;
  readonly deletingItems = this.listUi.deletingItems;

  // Coordination
  async deleteItem(item: PantryItem): Promise<void> {
    await this.listUi.deleteItem(item);
    this.batchOps.cancelPendingStockSave(item._id);
  }
}
```

### Store Pattern

```typescript
@Injectable({ providedIn: 'root' })
export class PantryStoreService {
  // Internal state
  private readonly _items = signal<PantryItem[]>([]);

  // Public API (readonly)
  readonly items = this._items.asReadonly();

  // Derived computed
  readonly activeItems = computed(() =>
    this._items().filter(item => item.quantity > 0)
  );

  // Mutations
  async loadItems(): Promise<void> {
    const items = await this.dataService.getAll();
    this._items.set(items);
  }
}
```

### Debouncing Pattern

```typescript
@Injectable()
export class PantryBatchOperationsService {
  private readonly stockSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly DEBOUNCE_MS = 500;

  adjustQuantity(itemId: string, delta: number): void {
    // Cancel previous timer
    const existingTimer = this.stockSaveTimers.get(itemId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new save
    const timer = setTimeout(() => {
      this.saveChanges(itemId);
      this.stockSaveTimers.delete(itemId);
    }, this.DEBOUNCE_MS);

    this.stockSaveTimers.set(itemId, timer);
  }
}
```

## 🔄 Lifecycle

### State Services (page scope)

```typescript
@Injectable()
export class PantryStateService {
  // Created when navigating to the page
  constructor() {
    console.log('PantryStateService created');
  }

  // Angular calls ngOnDestroy when the component is destroyed
  ngOnDestroy(): void {
    console.log('PantryStateService destroyed');
    // Cleanup
    this.cleanup();
  }
}
```

### Root Services (singleton)

```typescript
@Injectable({ providedIn: 'root' })
export class PantryService {
  // Created once when first injected
  constructor() {
    console.log('PantryService created (singleton)');
  }

  // Never destroyed (lives for the entire session)
}
```

## ✅ Best Practices

### ✅ DO: Clear separation

```typescript
// ✅ Data Service: Only persistence
@Injectable({ providedIn: 'root' })
export class PantryService {
  async getAll(): Promise<PantryItem[]>
  async save(item: PantryItem): Promise<PantryItem>
}

// ✅ State Service: Only UI coordination
@Injectable()
export class PantryStateService {
  readonly isLoading = signal(false);

  async loadItems(): Promise<void> {
    this.isLoading.set(true);
    const items = await this.pantryService.getAll();
    this.items.set(items);
    this.isLoading.set(false);
  }
}
```

### ❌ DON'T: Mix responsibilities

```typescript
// ❌ BAD: Service does everything
@Injectable()
export class PantryService {
  // Persistence
  async getAll(): Promise<PantryItem[]>

  // UI state (❌ shouldn't be here)
  readonly modalOpen = signal(false);

  // Transformation (❌ should be in ViewModel)
  formatQuantity(qty: number): string
}
```

### ✅ DO: Use domain functions

```typescript
// ✅ GOOD: Service delegates to domain
@Injectable()
export class PantryService {
  calculateTotal(item: PantryItem): number {
    return sumQuantities(item.batches); // Domain function
  }
}
```

### ❌ DON'T: Duplicate business logic

```typescript
// ❌ BAD: Duplicated logic in service
@Injectable()
export class PantryService {
  calculateTotal(item: PantryItem): number {
    return item.batches.reduce((sum, b) => sum + b.quantity, 0);
  }
}

// ❌ Same duplicated logic
@Injectable()
export class DashboardService {
  calculateTotal(item: PantryItem): number {
    return item.batches.reduce((sum, b) => sum + b.quantity, 0);
  }
}
```

## 🧪 Testing

### Testing Data Services

```typescript
describe('PantryService', () => {
  let service: PantryService;
  let mockStorage: jasmine.SpyObj<StorageService>;

  beforeEach(() => {
    mockStorage = jasmine.createSpyObj('StorageService', ['getAll', 'save']);

    TestBed.configureTestingModule({
      providers: [
        PantryService,
        { provide: StorageService, useValue: mockStorage }
      ]
    });

    service = TestBed.inject(PantryService);
  });

  it('should load items', async () => {
    const mockItems = [{ _id: '1', name: 'Test' }];
    mockStorage.getAll.and.returnValue(Promise.resolve(mockItems));

    const items = await service.getAll();

    expect(items).toEqual(mockItems);
    expect(mockStorage.getAll).toHaveBeenCalled();
  });
});
```

### Testing State Services with Signals

```typescript
describe('PantryStateService', () => {
  let service: PantryStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PantryStateService,
        { provide: PantryStoreService, useValue: mockStore }
      ]
    });

    service = TestBed.inject(PantryStateService);
  });

  it('should update filtered items when search changes', () => {
    service.items.set([
      { _id: '1', name: 'Leche' },
      { _id: '2', name: 'Pan' }
    ]);

    service.searchQuery.set('le');

    expect(service.filteredItems().length).toBe(1);
    expect(service.filteredItems()[0].name).toBe('Leche');
  });
});
```

## 📚 References

- [Pantry Services](./pantry/) - Main feature
- [Dashboard Services](./dashboard/) - Dashboard and insights
- [Settings Services](./settings/) - Settings
- [Shared Services](./shared/) - Shared services

---

**Key principle**: Services coordinate, domain executes business logic.
