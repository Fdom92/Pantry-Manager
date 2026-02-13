# Core Architecture

Complete documentation of the Pantry Manager core module architecture.

## 📋 Table of Contents

1. [Overview](#overview)
2. [Layered Architecture](#layered-architecture)
3. [Data Flow](#data-flow)
4. [Design Patterns](#design-patterns)
5. [Separation of Responsibilities](#separation-of-responsibilities)
6. [Directory Structure](#directory-structure)
7. [Implementation Guides](#implementation-guides)

---

## Overview

The `core` module implements a **clean layered architecture** with strict separation of responsibilities. Each layer has a specific purpose and communicates with others in a controlled manner.

### Fundamental Principles

1. **Single Responsibility Principle (SRP)**
   - Each class/function has a single responsibility
   - Services focused on a specific task

2. **Dependency Inversion Principle (DIP)**
   - Dependencies point towards abstractions
   - Domain does not depend on services

3. **Separation of Concerns**
   - Business logic in domain
   - Coordination in services
   - Transformations in utils

4. **Pure Functions First**
   - Prefer pure functions when possible
   - Facilitates testing and reusability

---

## Layered Architecture

```
┌─────────────────────-──────────────────────────┐
│         PRESENTATION LAYER                     │
│         (Components + Templates)               │
│                                                │
│  - Visual presentation                         │
│  - User event handling                         │
│  - UI rendering                                │
└─────────────────────-──────────────────────────┘
                    ↓ ↑
┌───────────────────────────────────-────────────┐
│         STATE MANAGEMENT LAYER                 │
│         (*-state.service.ts)                   │
│                                                │
│  - Subsystem coordination                      │
│  - Reactive signals management                 │
│  - Flow orchestration                          │
└──────────────────────────────────────-─────────┘
                    ↓ ↑
┌───────────────────────────────────────-────────┐
│         APPLICATION SERVICES LAYER             │
│         (*.service.ts, *-operations.service.ts)│
│                                                │
│  - Persistence (CRUD)                          │
│  - Specific operations                         │
│  - UI transformations (ViewModel)              │
└─────────────────────────────────────────-──────┘
                    ↓ ↑
┌─────────────────────────────────────────-──────┐
│         DOMAIN LAYER                           │
│         (domain/*.domain.ts)                   │
│                                                │
│  - Pure business logic                         │
│  - Pure functions (no side effects)            │
│  - Business rules                              │
└──────────────────────────────────────────--────┘
                    ↓
┌──────────────────────────────────────────-─────┐
│         FOUNDATION LAYER                       │
│         (models, utils, constants)             │
│                                                │
│  - Types and interfaces                        │
│  - Generic utility functions                   │
│  - Configuration constants                     │
└───────────────────────────────────────-────────┘
```

### Dependency Rules

```typescript
// ✅ ALLOWED
Components → State Services → App Services → Domain → Models/Utils
                                              ↓
                                         Models/Utils

// ❌ NOT ALLOWED
Domain → Services  // Domain must not depend on services
Utils → Domain     // Utils do not know specific domain
Models → Services  // Models do not depend on services
```

---

## Data Flow

### Complete Flow: User Action → Persistence → UI Update

```
┌─────────────┐
│    User     │
│   (click)   │
└──────┬──────┘
       │
       ↓
┌──────────────────┐
│   Component      │
│  onConsumeClick()│  ← Capture event
└──────┬───────────┘
       │
       ↓
┌──────────────────────┐
│  State Service       │
│  consumeToday()      │  ← Coordination
└──────┬───────────────┘
       │
       ├─→ Domain Function         ← Pure FIFO logic
       │   applyConsumeTodayToBatches()
       │
       ├─→ Store Service           ← Persistence
       │   pantryStore.updateItem()
       │
       └─→ Event Manager           ← Event logging
           eventManager.logConsume()

       ↓ (reactive signals)

┌──────────────────────┐
│  ViewModel Service   │
│  buildCardViewModel()│  ← Transformation
└──────┬───────────────┘
       │
       ↓
┌──────────────────┐
│   Component      │
│   (template)     │  ← Rendering
└──────────────────┘
```

### Code Example

```typescript
// 1️⃣ Component captures event
export class DashboardComponent {
  private readonly state = inject(DashboardStateService);

  onConsumeClick(item: PantryItem, amount: number) {
    this.state.consumeToday(item, amount);
  }
}

// 2️⃣ State Service coordinates
@Injectable()
export class DashboardStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly eventManager = inject(HistoryEventManagerService);

  async consumeToday(item: PantryItem, amount: number) {
    // 3️⃣ Domain function calculates new state
    const result = applyConsumeTodayToBatches(item, amount);
    if (!result) return;

    // 4️⃣ Store service persists
    await this.pantryStore.updateItem(result.updatedItem);

    // 5️⃣ Event manager logs
    await this.eventManager.logConsume(item, result.consumedAmount);
  }
}

// 3️⃣ Domain Function (pure, testable)
export function applyConsumeTodayToBatches(
  item: PantryItem,
  amount: number
): ConsumeResult | null {
  // Pure FIFO logic
  const batches = [...item.batches].sort((a, b) => {
    const aTime = getExpiryTimestamp(a.expirationDate);
    const bTime = getExpiryTimestamp(b.expirationDate);
    return aTime - bTime;
  });

  // Consume from first batches...
  return { updatedItem, consumedAmount };
}
```

---

## Design Patterns

### 1. Service Composition

State Services orchestrate multiple specialized services.

```typescript
@Injectable()
export class PantryStateService {
  // Composition of specialized services
  private readonly pantryStore = inject(PantryStoreService);
  private readonly viewModel = inject(PantryViewModelService);
  private readonly batchOps = inject(PantryBatchOperationsService);
  private readonly listUi = inject(PantryListUiStateService);

  // Coordination
  async deleteItem(item: PantryItem) {
    // 1. Animation (listUi)
    this.listUi.startDeleteAnimation(item);

    // 2. Cancel pending operations (batchOps)
    this.batchOps.cancelPendingStockSave(item._id);

    // 3. Persistence (pantryStore)
    await this.pantryStore.remove(item._id);

    // 4. Event (eventManager)
    await this.eventManager.logDelete(item);
  }
}
```

### 2. Orchestrator Pattern

State Services act as orchestrators of complex flows.

```typescript
@Injectable()
export class PantryStateService {
  // Delegates signals from specialized services
  readonly collapsedGroups = this.listUi.collapsedGroups;
  readonly deletingItems = this.listUi.deletingItems;

  // Delegates methods
  deleteItem = (item: PantryItem) => this.listUi.deleteItem(item);
  toggleGroup = (groupId: string) => this.listUi.toggleGroup(groupId);
}
```

### 3. Pure Domain Functions

Business logic in pure functions without dependencies.

```typescript
// ✅ Pure function - easy to test
export function classifyExpiry(
  expirationDate: string,
  now: Date,
  windowDays: number
): ExpiryClassification {
  if (!expirationDate) return 'unknown';

  const expiryTime = new Date(expirationDate).getTime();
  const nowTime = now.getTime();

  if (expiryTime < nowTime) return 'expired';

  const daysUntilExpiry = (expiryTime - nowTime) / (1000 * 60 * 60 * 24);
  if (daysUntilExpiry <= windowDays) return 'near-expiry';

  return 'normal';
}

// ❌ DO NOT do this (coupled to service)
export function classifyExpiry(service: DateService, item: Item) {
  // Not testable without mocking service
}
```

### 4. Optimistic Updates

Immediate UI update + deferred persistence.

```typescript
@Injectable()
export class PantryBatchOperationsService {
  private readonly pendingItems = new Map<string, PantryItem>();

  async adjustQuantity(item: PantryItem, delta: number) {
    // 1. Immediate optimistic update
    const updated = { ...item, quantity: item.quantity + delta };
    this.pendingItems.set(item._id, updated);

    // Signal updates immediately
    this.items.update(items =>
      items.map(i => i._id === item._id ? updated : i)
    );

    // 2. Deferred save with debounce
    this.debouncedSave(item._id);
  }

  private debouncedSave(itemId: string) {
    clearTimeout(this.timers.get(itemId));
    this.timers.set(itemId, setTimeout(() => {
      this.persistItem(itemId);
    }, 500));
  }
}
```

### 5. Signal-Based Reactivity

Reactive state with Angular signals.

```typescript
@Injectable()
export class PantryStateService {
  // Writable signals for mutable state
  readonly items = signal<PantryItem[]>([]);
  readonly loading = signal(false);

  // Computed signals for derived values
  readonly expiredItems = computed(() => {
    const items = this.items();
    const now = new Date();
    return items.filter(item =>
      getItemStatusState(item, now, 7) === 'expired'
    );
  });

  readonly itemCount = computed(() => this.items().length);
  readonly hasExpiredItems = computed(() => this.expiredItems().length > 0);

  // Effects for synchronization
  constructor() {
    effect(() => {
      const items = this.items();
      // Auto-save to localStorage
      localStorage.setItem('items-cache', JSON.stringify(items));
    });
  }
}
```

---

## Separation of Responsibilities

### Domain vs Utils vs Services

```typescript
// 🟦 DOMAIN: Specific business logic
export function isItemLowStock(item: PantryItem, context?: Context): boolean {
  const total = sumQuantities(item.batches);
  const threshold = item.minThreshold ?? context?.minThreshold ?? 0;
  return total < threshold;
}

// 🟩 UTILS: Generic reusable function
export function formatQuantity(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

// 🟨 SERVICES: Coordination with dependencies
@Injectable()
export class PantryService {
  private readonly storage = inject(StorageService);

  async save(item: PantryItem): Promise<PantryItem> {
    return await this.storage.save(item);
  }
}
```

### Store vs State vs ViewModel Services

```typescript
// 📦 STORE: Persistence and CRUD
@Injectable({ providedIn: 'root' })
export class PantryStoreService {
  async save(item: PantryItem): Promise<PantryItem> { }
  async get(id: string): Promise<PantryItem | null> { }
  async remove(id: string): Promise<void> { }
  async getAllActive(): Promise<PantryItem[]> { }
}

// 🎛️ STATE: Page coordination
@Injectable()
export class PantryStateService {
  private readonly store = inject(PantryStoreService);
  private readonly viewModel = inject(PantryViewModelService);

  readonly items = signal<PantryItem[]>([]);
  readonly loading = signal(false);

  async loadItems() {
    this.loading.set(true);
    const items = await this.store.getAllActive();
    this.items.set(items);
    this.loading.set(false);
  }
}

// 🎨 VIEWMODEL: Transformation for UI
@Injectable({ providedIn: 'root' })
export class PantryViewModelService {
  private readonly translate = inject(TranslateService);

  buildItemCardViewModel(item: PantryItem): PantryItemCardViewModel {
    return {
      id: item._id,
      title: item.name,
      quantity: formatQuantity(sumQuantities(item.batches), 'es-ES'),
      status: this.getStatusMeta(item),
      // ... more UI transformations
    };
  }
}
```

---

## Directory Structure

```
core/
│
├── constants/              # Configuration and fixed values
│   ├── pantry/
│   │   ├── pantry.constants.ts    # DEFAULT_PAGE_SIZE, NEAR_EXPIRY_DAYS
│   │   └── index.ts
│   ├── shared/
│   │   ├── storage.constants.ts   # STORAGE_KEYS, DB_NAME
│   │   ├── i18n.constants.ts      # SUPPORTED_LANGUAGES
│   │   └── index.ts
│   └── index.ts           # Barrel export
│
├── domain/                # Pure business logic
│   ├── pantry/
│   │   ├── pantry-batch.domain.ts      # sumQuantities, mergeBatches
│   │   ├── pantry-status.domain.ts     # getItemStatusState, classifyExpiry
│   │   ├── pantry-filtering.domain.ts  # matchesFilters, sortItems
│   │   └── index.ts
│   ├── dashboard/
│   │   ├── consume-today.domain.ts     # applyConsumeTodayToBatches (FIFO)
│   │   └── index.ts
│   └── index.ts
│
├── models/                # Types and interfaces
│   ├── pantry/
│   │   ├── item.model.ts               # PantryItem
│   │   ├── item-batch.model.ts         # ItemBatch
│   │   ├── pantry-list.model.ts        # ViewModels
│   │   └── index.ts
│   ├── shared/
│   │   ├── base-entity.model.ts        # BaseDoc, BaseEntity
│   │   └── index.ts
│   └── index.ts
│
├── services/              # Services with DI
│   ├── pantry/
│   │   ├── pantry.service.ts                    # 📦 Store (CRUD)
│   │   ├── pantry-store.service.ts              # 📦 Reactive store
│   │   ├── pantry-state.service.ts              # 🎛️ State (coordination)
│   │   ├── pantry-view-model.service.ts         # 🎨 ViewModel (transformation)
│   │   ├── pantry-batch-operations.service.ts   # ⚙️ Operations
│   │   ├── pantry-list-ui-state.service.ts      # 🎛️ List UI state
│   │   ├── modals/
│   │   │   ├── pantry-edit-item-modal-state.service.ts
│   │   │   ├── pantry-fast-add-modal-state.service.ts
│   │   │   └── pantry-batches-modal-state.service.ts
│   │   └── index.ts
│   ├── shared/
│   │   ├── storage.service.ts          # Base for PouchDB
│   │   ├── logger.service.ts           # Centralized logging
│   │   └── index.ts
│   └── index.ts
│
└── utils/                 # Pure utility functions
    ├── formatting.util.ts      # formatQuantity, formatDateValue
    ├── normalization.util.ts   # normalizeTrim, normalizeSearchField
    ├── date.util.ts            # toIsoDate, getExpiryTimestamp
    ├── batch-id.util.ts        # generateBatchId
    ├── signal.util.ts          # withSignalFlag, createLatestOnlyRunner
    └── index.ts
```

---

## Implementation Guides

### Adding a New Feature

```typescript
// 1️⃣ Define models
// src/app/core/models/myfeature/my-entity.model.ts
export interface MyEntity extends BaseEntity {
  _id: string;
  name: string;
  // ...
}

// 2️⃣ Define constants
// src/app/core/constants/myfeature/myfeature.constants.ts
export const MY_FEATURE_CONFIG = {
  defaultValue: 100,
  timeout: 5000
} as const;

// 3️⃣ Implement domain functions
// src/app/core/domain/myfeature/myfeature.domain.ts
export function calculateSomething(entity: MyEntity): number {
  // Pure logic
  return entity.value * 2;
}

// 4️⃣ Create store service
// src/app/core/services/myfeature/myfeature.service.ts
@Injectable({ providedIn: 'root' })
export class MyFeatureService extends StorageService<MyEntity> {
  async save(entity: MyEntity): Promise<MyEntity> { }
  async getAll(): Promise<MyEntity[]> { }
}

// 5️⃣ Create state service
// src/app/core/services/myfeature/myfeature-state.service.ts
@Injectable()
export class MyFeatureStateService {
  private readonly store = inject(MyFeatureService);

  readonly entities = signal<MyEntity[]>([]);

  async load() {
    const entities = await this.store.getAll();
    this.entities.set(entities);
  }
}

// 6️⃣ Use in component
export class MyFeatureComponent {
  private readonly state = inject(MyFeatureStateService);

  readonly entities = this.state.entities;

  ngOnInit() {
    this.state.load();
  }
}
```

### Refactoring Existing Code

```typescript
// ❌ BEFORE: Logic in service
@Injectable()
export class ItemService {
  calculateDiscount(item: Item): number {
    if (item.price > 100) {
      return item.price * 0.2;
    } else if (item.price > 50) {
      return item.price * 0.1;
    }
    return 0;
  }
}

// ✅ AFTER: Extract to domain
// domain/item/item-pricing.domain.ts
export function calculateDiscount(price: number): number {
  if (price > 100) return price * 0.2;
  if (price > 50) return price * 0.1;
  return 0;
}

// service uses domain
@Injectable()
export class ItemService {
  calculateDiscount(item: Item): number {
    return calculateDiscount(item.price);
  }
}
```

---

## 📊 Architecture Metrics

| Metric | Target | Status |
|---------|----------|--------|
| Services with SRP | 100% | ✅ 100% |
| Pure domain functions | 100% | ✅ 100% |
| Circular dependencies | 0 | ✅ 0 |
| Utils without dependencies | 100% | ✅ 100% |
| Complete barrel exports | 100% | ✅ 100% |

---

## 📚 References

- [Main README](./README.md) - Module overview
- [Domain Layer](./domain/README.md) - Pure business functions
- [Services Layer](./services/README.md) - Services with DI
- [Models](./models/README.md) - Types and interfaces
- [Utils](./utils/README.md) - Utility functions
- [Constants](./constants/README.md) - Configuration

---

**Maintained by**: PantryMind development team
**Last updated**: 2026-02-12
