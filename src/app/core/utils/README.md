# Utils

Pure and reusable utility functions. Stateless, no dependencies, easy to test.

## 🎯 Principle

**All functions in `utils/` must be pure**:

- No side effects
- No mutable state
- No dependency injection
- Same inputs → same outputs

## 📁 Available Modules

### [batch-id.util.ts](./batch-id.util.ts)
Unique ID generation for batches.

```typescript
import { generateBatchId } from '@core/utils';

const batchId = generateBatchId();
// 'batch:l3k2mn9-a4b7c2'
```

### [date.util.ts](./date.util.ts)
Date manipulation and formatting.

```typescript
import { toDateInputValue, toIsoDate } from '@core/utils';

// Convert to date input format
const inputValue = toDateInputValue('2026-02-12T10:30:00');
// '2026-02-12'

// Convert to ISO date
const isoDate = toIsoDate(new Date());
// '2026-02-12'
```

### [formatting.util.ts](./formatting.util.ts)
Number, quantity, and date formatting.

```typescript
import {
  formatQuantity,
  formatDateValue,
  roundQuantity,
  toNumberOrZero
} from '@core/utils';

// Format quantity with locale
const qty = formatQuantity(42.5, 'es');
// '42,5'

// Format date
const date = formatDateValue('2026-02-12', 'es');
// '12/2/2026'

// Round to 2 decimals
const rounded = roundQuantity(42.5555);
// 42.56

// Convert to number safely
const num = toNumberOrZero('42.5');
// 42.5
const safe = toNumberOrZero('invalid');
// 0
```

### [normalization.util.ts](./normalization.util.ts)
String, ID, and query normalization.

```typescript
import {
  normalizeSearchQuery,
  normalizeSearchField,
  normalizeTrim,
  normalizeLowercase,
  normalizeCategoryId,
  normalizeLocationId,
  normalizeSupermarketValue,
  formatFriendlyName
} from '@core/utils';

// Normalize search query
const query = normalizeSearchQuery('  Search Ñ  ');
// 'searchn'

// Normalize field for search
const field = normalizeSearchField('Skim Milk');
// 'skimmilk'

// Safe trim
const trimmed = normalizeTrim('  text  ');
// 'text'

// Safe lowercase
const lower = normalizeLowercase('TEXT');
// 'text'

// Normalize category ID
const catId = normalizeCategoryId('Dairy');
// 'dairy'

// Format friendly name
const friendly = formatFriendlyName('skim milk', 'Milk');
// 'Skim Milk'
```

### [pantry-autocomplete.util.ts](./pantry-autocomplete.util.ts)
Autocomplete options builder.

```typescript
import { buildPantryItemAutocomplete } from '@core/utils';

const options = buildPantryItemAutocomplete(items, {
  locale: 'es',
  excludeIds: new Set(['id1', 'id2']),
  getQuantity: item => item.totalQuantity,
  getMeta: (item, locale) => item.category
});
```

### [pantry-diff.util.ts](./pantry-diff.util.ts)
Detect significant changes in items.

```typescript
import { hasMeaningfulItemChanges } from '@core/utils';

const hasChanges = hasMeaningfulItemChanges(oldItem, newItem);
// true if there are relevant changes, false for trivial changes
```

### [pantry-selectors.util.ts](./pantry-selectors.util.ts)
Build options for selectors.

```typescript
import { buildUniqueSelectOptions } from '@core/utils';

const options = buildUniqueSelectOptions(
  items.map(i => i.category),
  {
    normalize: normalizeCategoryId,
    exclude: [''],
    includeEmpty: true
  }
);
```

### [pantry-status.util.ts](./pantry-status.util.ts)
Status and classification helpers.

```typescript
import {
  getExpirationSortWeight,
  getStatusSortWeight
} from '@core/utils';

// Sort weight by status
const weight = getExpirationSortWeight(item, new Date());
// 0: expired, 1: near-expiry, 2: low-stock, 3: normal

const statusWeight = getStatusSortWeight('expired');
// 0
```

### [shopping-grouping.util.ts](./shopping-grouping.util.ts)
Shopping suggestions grouping.

```typescript
import { groupSuggestionsBySupermarket } from '@core/utils';

const grouped = groupSuggestionsBySupermarket(suggestions);
// Groups by supermarket and sorts
```

### [signal.util.ts](./signal.util.ts)
Helpers for working with signals.

```typescript
import {
  withSignalFlag,
  createLatestOnlyRunner,
  runIfIdle
} from '@core/utils';

// Execute with loading flag
const saveWithLoading = withSignalFlag(isSaving, async () => {
  await save();
});

// Only executes latest call
const runner = createLatestOnlyRunner(destroyRef);
await runner.run(async () => {
  await expensiveOperation();
});

// Execute only if no other operation is running
await runIfIdle(idleFlag, async () => {
  await operation();
});
```

### [storage-flag.util.ts](./storage-flag.util.ts)
Helpers for localStorage flags.

```typescript
import { getBooleanFlag, setBooleanFlag } from '@core/utils';

// Read flag
const seen = getBooleanFlag('hasSeenOnboarding');

// Write flag
setBooleanFlag('hasSeenOnboarding', true);
```

### [task.util.ts](./task.util.ts)
Async task helpers.

```typescript
import { sleep } from '@core/utils';

// Wait N milliseconds
await sleep(1000);
```

### [uuid.util.ts](./uuid.util.ts)
Unique ID generation.

```typescript
import { createDocumentId } from '@core/utils';

const id = createDocumentId();
// 'doc-l3k2mn9a4b7'
```

## ✅ Best Practices

### ✅ DO: Pure functions

```typescript
// ✅ GOOD: Pure function
export function formatPrice(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR'
  }).format(amount);
}
```

### ❌ DON'T: Side effects

```typescript
// ❌ BAD: Modifies global state
let cache = {};

export function getCached(key: string): any {
  return cache[key]; // ❌ Side effect (reads mutable state)
}
```

### ✅ DO: Immutability

```typescript
// ✅ GOOD: Returns new array
export function addItem<T>(list: T[], item: T): T[] {
  return [...list, item];
}
```

### ❌ DON'T: Mutation

```typescript
// ❌ BAD: Modifies parameter
export function addItem<T>(list: T[], item: T): T[] {
  list.push(item); // ❌ Mutation
  return list;
}
```

### ✅ DO: Type-safe

```typescript
// ✅ GOOD: Complete types
export function sum(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0);
}
```

### ❌ DON'T: any

```typescript
// ❌ BAD: Using any
export function process(data: any): any {
  return data.value;
}
```

## 🧪 Testing

All utils functions are extremely easy to test:

```typescript
import { formatQuantity } from '@core/utils';

describe('formatQuantity', () => {
  it('should format with locale', () => {
    expect(formatQuantity(42.5, 'es')).toBe('42,5');
    expect(formatQuantity(42.5, 'en')).toBe('42.5');
  });

  it('should handle zero', () => {
    expect(formatQuantity(0, 'es')).toBe('0');
  });

  it('should round to 2 decimals', () => {
    expect(formatQuantity(42.555, 'es')).toBe('42,56');
  });
});
```

## 🔄 When to Create a Util

Create a util when:

1. ✅ The function is pure (no side effects)
2. ✅ It's used in 2+ places
3. ✅ It doesn't need dependency injection
4. ✅ It's reusable and generic

DON'T create a util if:

1. ❌ It needs to inject services → Goes in `services/`
2. ❌ It's specific business logic → Goes in `domain/`
3. ❌ It's only used once → Keep it inline
4. ❌ It has mutable state → Use a service

## 📊 Utils vs Domain Comparison

| Criteria | Utils | Domain |
|----------|-------|--------|
| **Purpose** | Generic helpers | Business logic |
| **Examples** | formatQuantity, sleep | getItemStatusState |
| **Specificity** | Generic | Domain-specific |
| **Names** | Technical verbs | Business verbs |

```typescript
// ✅ Utils: Generic, technical
export function formatNumber(n: number, locale: string): string

// ✅ Domain: Specific, business
export function calculateProductDiscount(item: PantryItem): number
```

## 🔗 See Also

- [Domain Layer](../domain/README.md) - Pure business logic
- [Services Layer](../services/README.md) - Services with DI

---

**Key principle**: Utils are generic tools, Domain is specific business logic.
