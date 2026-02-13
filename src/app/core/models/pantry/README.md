# Pantry Models

Types, interfaces and enums for the pantry feature.

## 📁 Structure

```
pantry/
├── item.model.ts                # PantryItem (main model)
├── item-batch.model.ts          # ItemBatch (individual batch)
├── category.model.ts            # Category model
├── supermarket.model.ts         # Supermarket model
├── pantry-list.model.ts         # ViewModels for UI
└── index.ts
```

---

## 🎯 Main Models

### 1. PantryItem - Pantry Product

**The central model of the application**: represents a product with its batches.

```typescript
interface PantryItem extends BaseDoc {
  readonly type: 'item';          // Type discriminator (immutable)
  readonly _id: string;            // 'item:{uuid}' (immutable)
  readonly householdId: string;    // 'household:default' (immutable)
  readonly createdAt: string;      // ISO timestamp (immutable)
  name: string;                    // 'Leche desnatada'
  categoryId: string;              // 'category:lacteos'
  supermarket?: string;            // 'Mercadona' (optional)
  batches: ItemBatch[];            // Array of batches
  minThreshold?: number;           // Replenishment threshold (optional)
  isBasic?: boolean;               // Is it a basic product? (default: false)
  noExpiry?: boolean;              // Product doesn't expire (default: false)
  expirationDate?: string;         // ISO date string (optional)
  expirationStatus?: ExpirationStatus;  // Cached status (optional)
  updatedAt: string;               // ISO timestamp
}
```

**Features**:

- ✅ Inherits from `BaseDoc` with readonly immutable fields (_id, type, createdAt, householdId)
- ✅ Supports multiple batches per item
- ✅ Optional metadata (category, supermarket, threshold)
- ✅ Basic product flag for quick filtering
- ✅ Multi-household ready (householdId)

**Recent changes (2026-02-13)**:

- ✅ Added `readonly` modifiers to immutable fields for better type safety
- ❌ Removed unused `brand` and `barcode` properties

**Example**:

```typescript
const item: PantryItem = {
  type: 'item',
  _id: 'item:abc123',
  householdId: 'household:default',
  name: 'Leche desnatada',
  categoryId: 'category:lacteos',
  supermarket: 'Mercadona',
  batches: [
    {
      batchId: 'batch:xyz789',
      quantity: 2,
      expirationDate: '2026-02-20',
      locationId: 'location:nevera',
      opened: false
    },
    {
      batchId: 'batch:def456',
      quantity: 1,
      expirationDate: '2026-02-25',
      locationId: 'location:nevera',
      opened: true
    }
  ],
  minThreshold: 3,
  isBasic: true,
  createdAt: '2026-01-15T10:30:00Z',
  updatedAt: '2026-02-12T15:45:00Z'
};
```

---

### 2. ItemBatch - Individual Batch

**Represents a specific batch** within an item (a purchase/entry).

```typescript
interface ItemBatch {
  batchId: string;          // 'batch:{timestamp-base36}-{random}'
  quantity: number;         // 2.5 (supports decimals)
  expirationDate?: string;  // '2026-02-20' (ISO date string, optional)
  locationId: string;       // 'location:nevera' or 'location:none'
  opened?: boolean;         // Is batch opened? (default: false)
}
```

**Features**:

- ✅ Quantity with decimals (e.g.: 2.5 liters)
- ✅ Optional expiration date
- ✅ Mandatory location (default: 'location:none')
- ✅ "Opened" flag for FIFO management
- ✅ Unique ID generated with `generateBatchId()`

**Example**:

```typescript
const batch: ItemBatch = {
  batchId: 'batch:lz8k3x-a4f9g2',
  quantity: 2,
  expirationDate: '2026-02-20',
  locationId: 'location:nevera',
  opened: false
};
```

**Special locations**:

```typescript
const UNASSIGNED_LOCATION_KEY = 'location:none';  // No assigned location
```

---

### 3. BaseDoc

**Base interface** for all documents with immutable fields.

```typescript
interface BaseDoc {
  readonly _id: string;        // Immutable ID
  readonly type: string;       // Immutable type discriminator
  readonly createdAt: string;  // Immutable creation timestamp (ISO 8601)
  updatedAt: string;           // Last update timestamp (ISO 8601)
  _rev?: string;               // PouchDB revision (optional)
}
```

All main entities inherit from `BaseDoc` for consistent structure.

**Key feature**: `readonly` modifiers prevent accidental modifications to immutable fields.

---

## 🎨 ViewModels for UI

### PantryItemCardViewModel

**Transformed model** for rendering cards in the UI.

```typescript
interface PantryItemCardViewModel {
  item: PantryItem;                      // Original item
  globalStatus: PantryItemGlobalStatus;  // Global status with label and color
  colorClass: string;                    // CSS class for status color
  formattedEarliestExpirationLong: string;  // Formatted expiration date
  batchCountsLabel: string;              // Summary label (e.g., "3 lotes: 1 caducado, 2 normales")
  batches: PantryItemBatchViewModel[];   // Array of batch view models
}
```

**Construction**:

```typescript
import { PantryViewModelService } from '@core/services/pantry';

const viewModel = pantryViewModelService.buildItemCardViewModel({
  item,
  summary: batchSummary,
});
```

**Recent changes (2026-02-13)**:

- ❌ Removed unused properties: `totalQuantity`, `totalQuantityLabel`, `earliestExpirationDate`, `batchCounts`
- ✅ Simplified to only include properties actually used in UI

---

### PantryGroup

**Item grouping** by status for collapsible UI.

```typescript
interface PantryGroup {
  key: string;              // 'expired' | 'near-expiry' | 'low-stock' | 'normal'
  label: string;            // 'Caducados' (translated)
  count: number;            // Number of items in group
  items: PantryItem[];      // Items in the group
  color: string;            // 'danger' | 'warning' | 'primary'
  icon: string;             // 'alert-circle' | 'time' | 'arrow-down'
}
```

**Group order**:

```
1. expired (red)
2. near-expiry (yellow)
3. low-stock (blue)
4. normal (gray)
```

---

### BatchEntryMeta

**Batch grouping** by location for modal.

```typescript
interface BatchEntryMeta {
  location: string;         // 'Nevera', 'Despensa'
  batches: ItemBatch[];     // Batches in this location
}
```

### BatchSummaryMeta

**Batch summary** of an item.

```typescript
interface BatchSummaryMeta {
  total: number;                    // Total batches
  sorted: BatchEntryMeta[];         // Batches grouped by location
}
```

---

### BatchStatusMeta

**Status metadata** for UI (color, icon, label).

```typescript
interface BatchStatusMeta {
  label: string;                    // 'Caducado', 'Por caducar', 'Normal'
  icon: string;                     // 'alert-circle', 'time', 'checkmark-circle'
  state: ExpiryClassification;      // 'expired' | 'near-expiry' | 'normal' | 'unknown'
  color: StatusColor;               // 'danger' | 'warning' | 'success' | 'medium'
}
```

**Recent changes (2026-02-13)**:

- ✅ Now uses shared `StatusColor` type for better consistency
- ✅ Uses `ExpiryClassification` instead of removed `BatchStatusState`

---

## 📊 Enums and Types

### PantryItemGlobalStatus

**Global status** of an item (calculated from batches).

```typescript
type PantryItemGlobalStatus =
  | 'expired'       // At least one expired batch
  | 'near-expiry'   // At least one batch near expiry
  | 'low-stock'     // Total quantity < minThreshold
  | 'normal';       // Everything OK
```

**Priority** (from highest to lowest):

```
expired > near-expiry > low-stock > normal
```

---

### ExpiryClassification

**Expiration date classification** for batches and items.

```typescript
type ExpiryClassification =
  | 'expired'       // expirationDate < now
  | 'near-expiry'   // (expirationDate - now) ≤ windowDays
  | 'normal'        // expirationDate > (now + windowDays)
  | 'unknown';      // no expirationDate
```

**Recent changes (2026-02-13)**:

- ✅ Now the single source of truth for expiry classification (removed duplicate `BatchStatusState`)

---

### StatusColor

**Shared type** for UI status colors across the app.

```typescript
type StatusColor = 'danger' | 'warning' | 'success' | 'medium';
```

Used in badges, chips, and status indicators.

---

### PantryStatusFilterValue

**Filter values** for search bar.

```typescript
type PantryStatusFilterValue =
  | 'all'           // No filter
  | 'expired'       // Only expired
  | 'near-expiry'   // Only near expiry
  | 'low-stock'     // Only low stock
  | 'normal';       // Only normal
```

---

### PantryFilterState

**Complete filter state**.

```typescript
interface PantryFilterState {
  expired: boolean;        // Show only expired
  expiring: boolean;       // Show only near expiry
  lowStock: boolean;       // Show only low stock
  recentlyAdded: boolean;  // Show only recently added
  normalOnly: boolean;     // Show only normal
  basic: boolean;          // Show only basic products
}
```

**Usage example**:

```typescript
const filters: PantryFilterState = {
  expired: true,
  expiring: false,
  lowStock: false,
  recentlyAdded: false,
  normalOnly: false,
  basic: false
};
// Result: Only expired items
```

---

### FilterChipViewModel

**Filter chip model** for UI.

```typescript
interface FilterChipViewModel {
  kind: 'status' | 'basic';     // Filter type
  label: string;                // 'Caducados (3)', 'Básicos (15)'
  value?: PantryStatusFilterValue;  // 'expired', 'near-expiry', etc.
  isActive: boolean;            // Is filter active?
  count: number;                // Number of matching items
  color?: string;               // 'danger', 'warning', etc.
}
```

---

### PantrySummaryMeta

**Statistical summary** of the pantry.

```typescript
interface PantrySummaryMeta {
  total: number;                // Total items
  visible: number;              // Visible items (after filters)
  basicCount: number;           // Items marked as basic
  statusCounts: {
    expired: number;            // Expired
    expiring: number;           // Near expiry
    lowStock: number;           // Low stock
    normal: number;             // Normal
  };
}
```

**Example**:

```typescript
const summary: PantrySummaryMeta = {
  total: 50,
  visible: 50,
  basicCount: 20,
  statusCounts: {
    expired: 3,
    expiring: 5,
    lowStock: 8,
    normal: 34
  }
};
```

---

## 🔄 Data Flow

### Model → ViewModel

```
PantryItem (DB)
  ↓
[Domain Functions]  ← Status calculation, quantity sum
  ↓
[ViewModel Service] ← Transformation + formatting + i18n
  ↓
PantryItemCardViewModel (UI)
```

**Example**:

```typescript
// 1. Item from DB
const item: PantryItem = await pantryService.get('item:123');

// 2. Calculations with domain
const totalQty = sumQuantities(item.batches);
const status = getItemStatusState(item, new Date(), 7);

// 3. Transformation to ViewModel
const viewModel = pantryViewModelService.buildItemCardViewModel({
  item,
  summary: batchSummary,
  totalQuantity: totalQty
});

// 4. Rendering in template
<ion-card>
  <ion-card-header>
    <ion-card-title>{{ viewModel.title }}</ion-card-title>
    <ion-badge [color]="viewModel.statusMeta.color">
      {{ viewModel.statusMeta.label }}
    </ion-badge>
  </ion-card-header>
  <ion-card-content>
    <p>{{ viewModel.quantity }}</p>
  </ion-card-content>
</ion-card>
```

---

## 🎨 Type Guards

### isValidPantryItem

```typescript
export function isValidPantryItem(value: any): value is PantryItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value._id === 'string' &&
    typeof value.name === 'string' &&
    Array.isArray(value.batches)
  );
}
```

### isValidItemBatch

```typescript
export function isValidItemBatch(value: any): value is ItemBatch {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.batchId === 'string' &&
    typeof value.quantity === 'number' &&
    typeof value.locationId === 'string'
  );
}
```

---

## 🧩 Model Extensions

### PantryItem with computed properties

```typescript
// ❌ DO NOT add methods to interfaces
interface PantryItem {
  getTotalQuantity(): number;  // ❌ BAD
}

// ✅ Use domain functions
import { sumQuantities } from '@core/domain/pantry';

const totalQuantity = sumQuantities(item.batches);
```

### Custom ViewModels

If you need a specific ViewModel, create it in the services layer:

```typescript
// services/pantry/pantry-view-model.service.ts
export class PantryViewModelService {
  buildCustomViewModel(item: PantryItem): CustomViewModel {
    return {
      // Specific transformations
    };
  }
}
```

---

## 📚 Related Constants

```typescript
// constants/pantry/pantry.constants.ts
export const DEFAULT_PANTRY_PAGE_SIZE = 300;
export const NEAR_EXPIRY_WINDOW_DAYS = 7;
export const RECENTLY_ADDED_WINDOW_DAYS = 7;
export const UNASSIGNED_LOCATION_KEY = 'location:none';
export const DEFAULT_HOUSEHOLD_ID = 'household:default';
```

---

## 🧪 Testing

### PantryItem Mock

```typescript
const mockItem: PantryItem = {
  _id: 'item:test123',
  name: 'Test Item',
  categoryId: 'category:test',
  supermarket: 'Test Market',
  batches: [
    {
      batchId: 'batch:test789',
      quantity: 5,
      expirationDate: '2026-12-31',
      locationId: 'location:test',
      opened: false
    }
  ],
  minThreshold: 3,
  isBasic: true,
  householdId: 'household:default',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
};
```

### Factory Functions for Tests

```typescript
// test/factories/pantry-item.factory.ts
export function createTestPantryItem(overrides?: Partial<PantryItem>): PantryItem {
  return {
    _id: 'item:test',
    name: 'Test Item',
    batches: [],
    householdId: 'household:default',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

export function createTestBatch(overrides?: Partial<ItemBatch>): ItemBatch {
  return {
    batchId: 'batch:test',
    quantity: 1,
    locationId: 'location:none',
    ...overrides
  };
}
```

---

## ✅ Best Practices

### DO: Use strict types

```typescript
// ✅ GOOD: Specific type
function processItem(item: PantryItem): void

// ❌ BAD: any
function processItem(item: any): void
```

### DO: Validate at boundaries

```typescript
// ✅ GOOD: Validate user/API data
const rawData = await api.getItem(id);
if (!isValidPantryItem(rawData)) {
  throw new Error('Invalid item data');
}
```

### DON'T: Modify base interfaces

```typescript
// ❌ BAD: Extend PantryItem in multiple places
interface PantryItemWithExtra extends PantryItem {
  extraField: string;
}

// ✅ GOOD: Create specific ViewModel
interface CustomViewModel {
  item: PantryItem;
  extraField: string;
}
```

### DON'T: Logic in models

```typescript
// ❌ BAD: Methods in interface
interface PantryItem {
  calculateTotal(): number;
}

// ✅ GOOD: Domain functions
import { sumQuantities } from '@core/domain/pantry';
const total = sumQuantities(item.batches);
```

---

## 📚 References

- [Models README](../README.md) - General models guide
- [Pantry Domain](../../domain/pantry/) - Business functions
- [Pantry Services](../../services/pantry/) - Services that use these models

---

**Feature**: Pantry Models
**Last updated**: 2026-02-13

---

## 📝 Changelog

### 2026-02-13 - Type Safety & Cleanup

**Added**:

- ✅ `readonly` modifiers to immutable fields (_id, type, createdAt, householdId)
- ✅ New `StatusColor` shared type for UI consistency

**Removed**:

- ❌ `PantryItem.brand` and `PantryItem.barcode` (unused properties)
- ❌ `PantryItemCardViewModel.totalQuantity`, `totalQuantityLabel`, `earliestExpirationDate`, `batchCounts` (unused)
- ❌ `PantryItemGlobalStatus.chipColor`, `chipTextColor` (unused)
- ❌ `BatchStatusState` type (duplicate of `ExpiryClassification`)
- ❌ `MoveBatchesResult` interface (unused)

**Changed**:

- ✅ `BatchStatusMeta.state` now uses `ExpiryClassification` instead of `BatchStatusState`
- ✅ `BatchStatusMeta.color` now uses shared `StatusColor` type
- ✅ `buildItemCardViewModel` no longer requires `totalQuantity` parameter

**Impact**: Better type safety, cleaner codebase, no breaking changes for existing databases
