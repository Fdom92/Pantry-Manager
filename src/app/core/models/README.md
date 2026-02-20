# Models

Types, interfaces, and data models that define the application's information structure.

## 🎯 Purpose

Models define:

- ✅ Application data structure
- ✅ Contracts between components and services
- ✅ Types for TypeScript type checking
- ✅ Enums and union types

## 📂 Structure by Feature

```
models/
├── agent/          # AgentMessage, ConversationState
├── dashboard/      # Insight, ConsumeTodayEntry
├── events/         # Event, EventParams
├── pantry/         # PantryItem, ItemBatch (main)
├── settings/       # UserPreferences, AppSettings
├── shared/         # BaseDoc, BaseEntity, Enums
├── shopping/       # ShoppingList, ShoppingSuggestion
└── upgrade/        # UpgradePlan, PurchaseInfo
```

## 📚 Main Models

### `PantryItem` - Pantry product

```typescript
interface PantryItem extends BaseDoc {
  readonly type: 'item';
  readonly _id: string;
  readonly householdId: string;
  readonly createdAt: string;
  name: string;
  categoryId: string;
  supermarket?: string;
  batches: ItemBatch[];
  minThreshold?: number;
  isBasic?: boolean;
  noExpiry?: boolean;
  expirationDate?: string;
  expirationStatus?: ExpirationStatus;
  updatedAt: string;
}
```

**Key changes (2026-02-13)**:

- ✅ Added `readonly` modifiers to immutable fields (_id, type, householdId, createdAt)
- ❌ Removed unused `brand` and `barcode` properties

### `ItemBatch` - Individual batch

```typescript
interface ItemBatch {
  batchId: string;
  quantity: number;
  expirationDate?: string;
  locationId: string;
  opened?: boolean;
}
```

### ViewModels for UI

```typescript
interface PantryItemCardViewModel {
  item: PantryItem;
  globalStatus: PantryItemGlobalStatus;
  colorClass: string;
  formattedEarliestExpirationLong: string;
  batchCountsLabel: string;
  batches: PantryItemBatchViewModel[];
}
```

**Key changes (2026-02-13)**:
- ❌ Removed unused properties: `totalQuantity`, `totalQuantityLabel`, `earliestExpirationDate`, `batchCounts`

## 🎨 Conventions

- **Interfaces**: PascalCase
- **Types**: PascalCase
- **Barrel exports** for clean imports
- **Immutable fields**: Use `readonly` modifier (_id, type, createdAt, householdId, etc.)
- **Type discriminators**: Always `readonly type: 'literal'` for proper type narrowing

---

**See also**: [Services](../services/README.md), [Domain](../domain/README.md)
