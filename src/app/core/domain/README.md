# Domain Layer

The domain layer contains **all pure business logic** of the application. All functions here are pure (without side effects) and easily testable.

## 🎯 Principles

1. **Pure Functions**: No side effects, no mutable state
2. **No Dependencies**: Do not inject Angular services
3. **Testable**: Can be tested without TestBed or mocks
4. **Reusable**: Can be used from anywhere

## 📁 Structure

```
domain/
├── dashboard/       # Consume today and insights logic
├── events/          # Event processing
├── pantry/          # ⭐ Main pantry logic
├── settings/        # Configuration operations
├── shopping/        # Shopping list logic
├── up-to-date/      # Bulk update logic
└── upgrade/         # PRO plan logic
```

## 🔍 Use Cases

### Pantry Domain

#### Batch Operations

```typescript
import {
  normalizeBatches,
  sumQuantities,
  collectBatches
} from '@core/domain/pantry';

// Normalize batches with unique IDs
const batches = normalizeBatches(rawBatches, {
  generateBatchId: () => generateBatchId()
});

// Calculate total quantity
const total = sumQuantities(batches);

// Collect batches from multiple locations
const allBatches = collectBatches(item.batches);
```

#### Status Classification

```typescript
import {
  getItemStatusState,
  isItemLowStock,
  classifyExpiry
} from '@core/domain/pantry';

// Get product status
const state = getItemStatusState(
  item,
  new Date(),
  NEAR_EXPIRY_WINDOW_DAYS
);
// Returns: 'expired' | 'near-expiry' | 'low-stock' | 'normal'

// Check if needs restocking
const needsRestock = isItemLowStock(item, {
  totalQuantity: sumQuantities(item.batches),
  minThreshold: item.minThreshold
});

// Classify expiry date
const expiry = classifyExpiry(
  '2026-02-20',
  new Date(),
  7 // window days
);
// Returns: 'expired' | 'near-expiry' | 'normal' | 'unknown'
```

#### Filtering and Search

```typescript
import {
  matchesSearchQuery,
  matchesFilters,
  sortPantryItems
} from '@core/domain/pantry';

// Search by query
const matches = matchesSearchQuery(item, 'leche');

// Apply filters
const passesFilters = matchesFilters(item, {
  basic: true,
  expired: false,
  lowStock: true
});

// Sort items
const sorted = sortPantryItems(items, 'expiry');
// Order: expired > near-expiry > low-stock > normal, then alphabetical
```

### Dashboard Domain

#### Consume Today

```typescript
import { applyConsumeTodayToBatches } from '@core/domain/dashboard';

// Consume quantity from batches (FIFO: first expiring first)
const result = applyConsumeTodayToBatches(item, 2.5);

if (result) {
  console.log('Consumed:', result.consumedAmount);
  console.log('Updated item:', result.updatedItem);
}
```

### Settings Domain

#### Catalog Operations

```typescript
import {
  isDuplicateCatalogValue,
  getCatalogUsage,
  normalizeCatalogOptions
} from '@core/domain/settings';

// Check if value already exists (case-insensitive)
const isDupe = isDuplicateCatalogValue(
  'Lácteos',
  ['lácteos', 'Carnes', 'Verduras'],
  normalizeCategoryId
);

// Get usage of a catalog value
const usage = getCatalogUsage(
  allItems,
  'Lácteos',
  (item, normalized) => item.category === normalized,
  normalizeCategoryId
);
console.log(`Used in ${usage.count} products`);

// Normalize options (trim + filter empty)
const options = normalizeCatalogOptions([
  ' Lácteos  ',
  '',
  'Carnes',
  '  '
]);
// Returns: ['Lácteos', 'Carnes']
```

## 📖 Functions by Feature

### Pantry (8 main functions)

| Function | Description | Return |
|---------|-------------|---------|
| `normalizeBatches` | Normalizes batches with unique IDs | `ItemBatch[]` |
| `sumQuantities` | Sums batch quantities | `number` |
| `getItemStatusState` | Classifies product status | `ProductStatusState` |
| `isItemLowStock` | Checks if needs restocking | `boolean` |
| `classifyExpiry` | Classifies expiry date | `ExpiryClassification` |
| `matchesSearchQuery` | Checks if matches search | `boolean` |
| `matchesFilters` | Applies filters to item | `boolean` |
| `sortPantryItems` | Sorts by expiry (default) or name | `PantryItem[]`, `PantrySortMode` |

### Dashboard (2 main functions)

| Function | Description | Return |
|---------|-------------|---------|
| `applyConsumeTodayToBatches` | Consumes quantity (FIFO) | `ConsumeResult \| null` |
| `getRecentItemsByUpdatedAt` | Gets recent items | `PantryItem[]` |

### Settings (4 main functions)

| Function | Description | Return |
|---------|-------------|---------|
| `isDuplicateCatalogValue` | Checks duplicate (case-insensitive) | `boolean` |
| `getCatalogUsage` | Counts value usage | `{ count, items }` |
| `normalizeCatalogOptions` | Cleans options list | `string[]` |
| `clearCatalogFromItems` | Clears value from items | `Promise<void>` |

## 🧪 Testing

Domain functions are **extremely easy to test** because they have no dependencies:

```typescript
import { sumQuantities } from '@core/domain/pantry';

describe('sumQuantities', () => {
  it('should sum batch quantities', () => {
    const batches = [
      { quantity: 5, locationId: 'loc1' },
      { quantity: 10, locationId: 'loc2' }
    ];

    expect(sumQuantities(batches)).toBe(15);
  });

  it('should filter by location', () => {
    const batches = [
      { quantity: 5, locationId: 'loc1' },
      { quantity: 10, locationId: 'loc2' }
    ];

    expect(sumQuantities(batches, { locationId: 'loc1' })).toBe(5);
  });
});
```

## ✅ Best Practices

### ✅ DO: Pure functions

```typescript
// ✅ GOOD: Pure function, no side effects
export function calculateDiscount(price: number, percentage: number): number {
  return price * (1 - percentage / 100);
}
```

### ❌ DON'T: Side effects

```typescript
// ❌ BAD: Side effect (modifies parameter)
export function addItem(list: Item[], item: Item): Item[] {
  list.push(item); // ❌ Mutation
  return list;
}

// ✅ GOOD: Immutable
export function addItem(list: Item[], item: Item): Item[] {
  return [...list, item]; // ✅ New array
}
```

### ✅ DO: Parameters by value

```typescript
// ✅ GOOD: Receives values, returns result
export function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency
  }).format(amount);
}
```

### ❌ DON'T: Injected dependencies

```typescript
// ❌ BAD: Injection in domain
export function getItems(service: ItemService): Item[] {
  return service.getAll(); // ❌ Service dependency
}

// ✅ GOOD: Receives data directly
export function filterItems(items: Item[], query: string): Item[] {
  return items.filter(item => item.name.includes(query));
}
```

## 🔄 Migration to Domain

If you find business logic in services, extract it to domain:

### Before (in service)

```typescript
@Injectable()
export class PantryService {
  calculateTotal(item: PantryItem): number {
    return item.batches.reduce((sum, b) => sum + b.quantity, 0);
  }
}
```

### After (in domain)

```typescript
// domain/pantry/pantry-batch.domain.ts
export function sumQuantities(batches: ItemBatch[]): number {
  return batches.reduce((sum, b) => sum + b.quantity, 0);
}

// service uses domain
@Injectable()
export class PantryService {
  calculateTotal(item: PantryItem): number {
    return sumQuantities(item.batches);
  }
}
```

## 📚 Internal References

- [pantry-batch.domain.ts](./pantry/pantry-batch.domain.ts) - Batch operations
- [pantry-status.domain.ts](./pantry/pantry-status.domain.ts) - Status classification
- [pantry-filtering.domain.ts](./pantry/pantry-filtering.domain.ts) - Filtering and search
- [catalog-operations.domain.ts](./settings/catalog-operations.domain.ts) - Catalog management
- [consume-today.domain.ts](./dashboard/consume-today.domain.ts) - FIFO consumption

---

**Key principle**: If it has business logic and does NOT need dependency injection, it goes in domain.
