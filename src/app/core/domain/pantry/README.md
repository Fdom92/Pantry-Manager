# Pantry Domain Functions

Pure business logic functions for the pantry feature.

## 📁 Structure

```
pantry/
├── pantry-batch.domain.ts        # Batch operations (normalizeBatches, sumQuantities)
├── pantry-status.domain.ts       # Status classification (getItemStatusState, classifyExpiry)
├── pantry-filtering.domain.ts    # Filtering and sorting (matchesFilters, sortPantryItems)
├── pantry-builder.domain.ts      # Payload construction (buildItemPayload, buildFastAddPayload)
└── index.ts
```

---

## 🎯 Files

### 1. pantry-batch.domain.ts

**Responsibility**: Operations with batch arrays (ItemBatch[])

```typescript
/**
 * Normalizes batches by assigning unique batchIds and validating structure.
 */
export function normalizeBatches(
  batches: ItemBatch[],
  options: { generateBatchId: () => string }
): ItemBatch[]

/**
 * Sums batch quantities, optionally filtering by location.
 */
export function sumQuantities(
  batches: ItemBatch[],
  options?: { locationId?: string }
): number

/**
 * Collects all batches from multiple locations into a single array.
 */
export function collectBatches(batches: ItemBatch[]): ItemBatch[]

/**
 * Sanitizes batches by removing those with quantity <= 0.
 */
export function sanitizeBatches(batches: ItemBatch[]): ItemBatch[]

/**
 * Merges batches from the same locationId without expiration date.
 */
export function mergeBatchesByLocation(batches: ItemBatch[]): ItemBatch[]
```

**Examples**:

```typescript
import { normalizeBatches, sumQuantities } from '@core/domain/pantry';
import { generateBatchId } from '@core/utils';

// Normalize batches without IDs
const rawBatches = [
  { quantity: 5, locationId: 'loc1' },
  { quantity: 10, locationId: 'loc2' }
];

const normalized = normalizeBatches(rawBatches, {
  generateBatchId: () => generateBatchId()
});
// Result: batches with unique batchId

// Sum total quantities
const total = sumQuantities(normalized);
// Result: 15

// Sum only from one location
const totalLoc1 = sumQuantities(normalized, { locationId: 'loc1' });
// Result: 5

// Sanitize (remove quantity <= 0)
const withZeros = [
  { batchId: '1', quantity: 5, locationId: 'loc1' },
  { batchId: '2', quantity: 0, locationId: 'loc2' }
];
const cleaned = sanitizeBatches(withZeros);
// Result: only batch with quantity=5
```

**Tests**:

```typescript
describe('sumQuantities', () => {
  it('should sum all batch quantities', () => {
    const batches = [
      { batchId: '1', quantity: 5, locationId: 'loc1' },
      { batchId: '2', quantity: 10, locationId: 'loc2' }
    ];
    expect(sumQuantities(batches)).toBe(15);
  });

  it('should filter by locationId', () => {
    const batches = [
      { batchId: '1', quantity: 5, locationId: 'loc1' },
      { batchId: '2', quantity: 10, locationId: 'loc2' }
    ];
    expect(sumQuantities(batches, { locationId: 'loc1' })).toBe(5);
  });
});
```

---

### 2. pantry-status.domain.ts

**Responsibility**: Item and batch status classification

```typescript
/**
 * Determines the global status of an item based on its batches.
 * Returns: 'expired' | 'near-expiry' | 'low-stock' | 'normal'
 */
export function getItemStatusState(
  item: PantryItem,
  now: Date,
  nearExpiryWindowDays: number
): ProductStatusState

/**
 * Classifies an individual expiration date.
 * Returns: 'expired' | 'near-expiry' | 'normal' | 'unknown'
 */
export function classifyExpiry(
  expirationDate: string | undefined,
  now: Date,
  windowDays: number
): ExpiryClassification

/**
 * Checks if an item is low on stock.
 */
export function isItemLowStock(
  item: PantryItem,
  context?: { totalQuantity?: number; minThreshold?: number }
): boolean

/**
 * Gets the timestamp of an expiration date for sorting.
 */
export function getExpiryTimestamp(expirationDate?: string): number
```

**Classification logic**:

```typescript
// Global item status (descending priority)
1. EXPIRED: At least one expired batch
2. NEAR_EXPIRY: At least one batch near expiry (≤ windowDays)
3. LOW_STOCK: Total quantity < minThreshold
4. NORMAL: All OK

// Individual date classification
1. EXPIRED: expirationDate < now
2. NEAR_EXPIRY: (expirationDate - now) ≤ windowDays
3. NORMAL: expirationDate > (now + windowDays)
4. UNKNOWN: no date
```

**Examples**:

```typescript
import { getItemStatusState, classifyExpiry, isItemLowStock } from '@core/domain/pantry';

const item: PantryItem = {
  _id: '1',
  name: 'Leche',
  batches: [
    { batchId: '1', quantity: 2, expirationDate: '2026-02-14', locationId: 'loc1' }
  ],
  minThreshold: 5
};

const now = new Date('2026-02-12');
const windowDays = 7;

// Global status
const state = getItemStatusState(item, now, windowDays);
// Result: 'near-expiry' (expires in 2 days)

// Classify individual date
const expiry = classifyExpiry('2026-02-14', now, windowDays);
// Result: 'near-expiry'

// Check low stock
const needsRestock = isItemLowStock(item, {
  totalQuantity: 2,  // sumQuantities(item.batches)
  minThreshold: 5
});
// Result: true (2 < 5)
```

**Tests**:

```typescript
describe('getItemStatusState', () => {
  const now = new Date('2026-02-12');

  it('should return expired for past date', () => {
    const item = {
      batches: [{ expirationDate: '2026-02-10' }],
      minThreshold: 0
    };
    expect(getItemStatusState(item, now, 7)).toBe('expired');
  });

  it('should return near-expiry within window', () => {
    const item = {
      batches: [{ expirationDate: '2026-02-15' }],  // 3 days
      minThreshold: 0
    };
    expect(getItemStatusState(item, now, 7)).toBe('near-expiry');
  });

  it('should return low-stock when below threshold', () => {
    const item = {
      batches: [{ quantity: 2, expirationDate: '2026-03-01' }],
      minThreshold: 5
    };
    expect(getItemStatusState(item, now, 7)).toBe('low-stock');
  });

  it('should return normal otherwise', () => {
    const item = {
      batches: [{ quantity: 10, expirationDate: '2026-03-01' }],
      minThreshold: 5
    };
    expect(getItemStatusState(item, now, 7)).toBe('normal');
  });
});
```

---

### 3. pantry-filtering.domain.ts

**Responsibility**: Item filtering, searching, and sorting

```typescript
/**
 * Checks if an item matches the search query by name.
 */
export function matchesSearchQuery(
  item: PantryItem,
  query: string
): boolean

/**
 * Checks if an item meets the applied filters.
 */
export function matchesFilters(
  item: PantryItem,
  filters: PantryFilterState,
  context?: { now?: Date; nearExpiryWindowDays?: number }
): boolean

/**
 * Sorts items by priority: expired > near-expiry > low-stock > normal,
 * then alphabetically.
 */
export function sortPantryItems(items: PantryItem[]): PantryItem[]

/**
 * Checks if an item was recently added.
 */
export function isRecentlyAdded(
  item: PantryItem,
  windowDays?: number
): boolean
```

**Available filters**:

```typescript
interface PantryFilterState {
  expired: boolean;        // Only expired
  expiring: boolean;       // Only near expiry
  lowStock: boolean;       // Only low stock
  recentlyAdded: boolean;  // Only recently added
  normalOnly: boolean;     // Only in normal state
  basic: boolean;          // Only basic products
}
```

**Examples**:

```typescript
import { matchesSearchQuery, matchesFilters, sortPantryItems } from '@core/domain/pantry';

const item: PantryItem = {
  _id: '1',
  name: 'Leche desnatada',
  batches: [{ quantity: 2, expirationDate: '2026-02-14' }],
  minThreshold: 5,
  isBasic: true,
  createdAt: '2026-02-11T10:00:00Z'
};

// Search by name
const matchesLeche = matchesSearchQuery(item, 'leche');
// Result: true (case-insensitive, normalized)

// Apply filters
const filters: PantryFilterState = {
  expired: false,
  expiring: true,   // Only near-expiry
  lowStock: false,
  recentlyAdded: false,
  normalOnly: false,
  basic: false
};

const passes = matchesFilters(item, filters, {
  now: new Date('2026-02-12'),
  nearExpiryWindowDays: 7
});
// Result: true (item is near-expiry)

// Sort items
const items = [normalItem, expiredItem, nearExpiryItem];
const sorted = sortPantryItems(items);
// Result: [expiredItem, nearExpiryItem, normalItem]
```

**Sorting logic**:

```typescript
1. By status (priority weight):
   - expired: 0 (highest priority)
   - near-expiry: 1
   - low-stock: 2
   - normal: 3

2. If tied on status, alphabetically by name (normalized)
```

**Tests**:

```typescript
describe('matchesSearchQuery', () => {
  it('should match case-insensitive', () => {
    const item = { name: 'Leche Desnatada' };
    expect(matchesSearchQuery(item, 'leche')).toBe(true);
    expect(matchesSearchQuery(item, 'LECHE')).toBe(true);
  });

  it('should normalize accents', () => {
    const item = { name: 'Café' };
    expect(matchesSearchQuery(item, 'cafe')).toBe(true);
  });

  it('should return true for empty query', () => {
    const item = { name: 'Leche' };
    expect(matchesSearchQuery(item, '')).toBe(true);
  });
});

describe('sortPantryItems', () => {
  it('should sort expired first', () => {
    const items = [normalItem, expiredItem];
    const sorted = sortPantryItems(items);
    expect(sorted[0]).toBe(expiredItem);
  });

  it('should sort alphabetically within same status', () => {
    const items = [
      { ...normalItem, name: 'Zanahoria' },
      { ...normalItem, name: 'Arroz' }
    ];
    const sorted = sortPantryItems(items);
    expect(sorted[0].name).toBe('Arroz');
  });
});
```

---

### 4. pantry-builder.domain.ts

**Responsibility**: Payload construction for creating/editing items

```typescript
/**
 * Builds complete payload for creating/editing item.
 */
export function buildItemPayload(config: {
  id: string;
  nowIso: string;
  name: string;
  categoryId?: string | null;
  supermarket?: string | null;
  quantity: number;
  expirationDate?: string | null;
  locationId: string;
  minThreshold?: number | null;
  isBasic: boolean;
  opened: boolean;
  householdId: string;
  existingBatches?: ItemBatch[];
}): PantryItem

/**
 * Builds simplified payload for fast-add.
 */
export function buildFastAddItemPayload(config: {
  id: string;
  nowIso: string;
  name: string;
  quantity: number;
  householdId?: string;
}): PantryItem
```

**Examples**:

```typescript
import { buildItemPayload, buildFastAddItemPayload } from '@core/domain/pantry';
import { createDocumentId } from '@core/utils';
import { DEFAULT_HOUSEHOLD_ID } from '@core/constants';

// Complete payload
const item = buildItemPayload({
  id: createDocumentId('item'),
  nowIso: new Date().toISOString(),
  name: 'Leche',
  categoryId: 'cat:lacteos',
  supermarket: 'Mercadona',
  quantity: 2,
  expirationDate: '2026-02-20',
  locationId: 'loc:nevera',
  minThreshold: 3,
  isBasic: true,
  opened: false,
  householdId: DEFAULT_HOUSEHOLD_ID
});

// Fast-add payload (simplified)
const fastItem = buildFastAddItemPayload({
  id: createDocumentId('item'),
  nowIso: new Date().toISOString(),
  name: 'Pan',
  quantity: 2,
  householdId: DEFAULT_HOUSEHOLD_ID
});
// Result: item with defaults (no category, location='location:none', etc.)
```

---

## 🎨 Design Principles

### 1. Pure Functions

```typescript
// ✅ GOOD: Pure function
export function sumQuantities(batches: ItemBatch[]): number {
  return batches.reduce((sum, b) => sum + b.quantity, 0);
}

// ❌ BAD: Function with side effect
export function sumQuantities(batches: ItemBatch[]): number {
  console.log('Summing...'); // ❌ Side effect
  return batches.reduce((sum, b) => sum + b.quantity, 0);
}
```

### 2. No External Dependencies

```typescript
// ✅ GOOD: Explicit parameters
export function classifyExpiry(
  expirationDate: string,
  now: Date,
  windowDays: number
): string

// ❌ BAD: Service dependency
export function classifyExpiry(
  expirationDate: string,
  dateService: DateService  // ❌ Injected service
): string
```

### 3. Immutability

```typescript
// ✅ GOOD: Does not modify input
export function sortPantryItems(items: PantryItem[]): PantryItem[] {
  return [...items].sort((a, b) => /* ... */);
}

// ❌ BAD: Modifies input
export function sortPantryItems(items: PantryItem[]): PantryItem[] {
  items.sort((a, b) => /* ... */);  // ❌ Mutation
  return items;
}
```

### 4. Composition

```typescript
// ✅ GOOD: Small composable functions
export function getItemStatusState(item: PantryItem, now: Date, windowDays: number): Status {
  const hasExpired = item.batches.some(b => classifyExpiry(b.expirationDate, now, windowDays) === 'expired');
  if (hasExpired) return 'expired';

  const hasNearExpiry = item.batches.some(b => classifyExpiry(b.expirationDate, now, windowDays) === 'near-expiry');
  if (hasNearExpiry) return 'near-expiry';

  const totalQty = sumQuantities(item.batches);
  if (isItemLowStock(item, { totalQuantity: totalQty })) return 'low-stock';

  return 'normal';
}
```

---

## 🧪 Testing

### Easy Tests (Pure Functions)

```typescript
// No need for TestBed, mocks, or DI
describe('sumQuantities', () => {
  it('should sum quantities', () => {
    const batches = [
      { batchId: '1', quantity: 5, locationId: 'loc1' },
      { batchId: '2', quantity: 10, locationId: 'loc2' }
    ];
    expect(sumQuantities(batches)).toBe(15);
  });
});
```

### Testing Advantages

1. **No mocks needed** - Pure functions without dependencies
2. **Fast tests** - No DI or TestBed
3. **Easy debugging** - Predictable Input → Output
4. **100% testable** - Every function is testable

---

## 📚 References

- [Domain Layer README](../README.md) - General domain guide
- [Pantry Models](../../models/pantry/) - Used types
- [Pantry Services](../../services/pantry/) - Services that use these functions

---

**Feature**: Pantry Domain
**Last updated**: 2026-02-12
