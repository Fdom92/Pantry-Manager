# Core Module

The `core` module contains all the business logic, services, models, and shared utilities of the Pantry Manager application.

## 📁 Structure

```
core/
├── constants/      # Constants and configuration
├── domain/         # Pure business logic (functions)
├── models/         # Types, interfaces, and enums
├── services/       # Services with dependency injection
└── utils/          # Pure utility functions
```

## 🏗️ Architecture

### Dependency Hierarchy

```
┌─────────────────────────────────────┐
│         Components/Features         │  ← Presentation
├─────────────────────────────────────┤
│           State Services            │  ← UI Coordination
├─────────────────────────────────────┤
│      Store/Data Services            │  ← Persistence
├─────────────────────────────────────┤
│     Domain + Utils                  │  ← Business Logic
├─────────────────────────────────────┤
│     Models + Constants              │  ← Types and Configuration
└─────────────────────────────────────┘
```

### Key Principles

1. **Separation of Concerns**: Each layer has a single responsibility
2. **Pure Functions**: Domain and utils without side effects
3. **Dependency Injection**: Services use Angular's `inject()`
4. **Reactive State**: Signals for reactive state
5. **Type Safety**: Strict TypeScript throughout the codebase

## 📚 Detailed Guides

- [Constants](./constants/README.md) - Configuration and constant values
- [Domain](./domain/README.md) - Pure business logic
- [Models](./models/README.md) - Types and interfaces
- [Services](./services/README.md) - Services and state
- [Utils](./utils/README.md) - Utility functions

## 🎯 Common Use Cases

### Adding a New Feature

1. **Create models** in `models/nueva-feature/`
2. **Create business logic** in `domain/nueva-feature/`
3. **Create services** in `services/nueva-feature/`
4. **Add constants** in `constants/nueva-feature/`
5. **Create utils** if you need specific helpers

### Using Existing Services

```typescript
import { PantryStoreService } from '@core/services/pantry';

@Component({...})
export class MiComponente {
  private readonly pantryStore = inject(PantryStoreService);

  ngOnInit() {
    const items = this.pantryStore.activeProducts();
  }
}
```

### Using Domain Functions

```typescript
import { getItemStatusState, isItemLowStock } from '@core/domain/pantry';

// Pure functions without dependencies
const status = getItemStatusState(item, new Date(), 7);
const needsRestock = isItemLowStock(item);
```

### Using Utils

```typescript
import { formatQuantity, normalizeSearchQuery } from '@core/utils';

const formatted = formatQuantity(42.5, 'es');
const normalized = normalizeSearchQuery('  Búsqueda  ');
```

## 🔧 Conventions

### Naming

- **Services**: `*.service.ts` (e.g., `pantry.service.ts`)
- **State Services**: `*-state.service.ts` (e.g., `pantry-state.service.ts`)
- **Domain**: `*.domain.ts` (e.g., `pantry-batch.domain.ts`)
- **Models**: `*.model.ts` or `*.models.ts`
- **Utils**: `*.util.ts` (e.g., `formatting.util.ts`)
- **Constants**: `*.constants.ts`

### Exports

Each folder has an `index.ts` (barrel export):

```typescript
// ❌ NO: Long relative imports
import { PantryService } from '../../services/pantry/pantry.service';

// ✅ YES: Use barrel exports
import { PantryService } from '@core/services/pantry';
```

### Pure Functions vs Services

```typescript
// ✅ Domain: Pure function
export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

// ✅ Service: State management
@Injectable()
export class PantryService {
  private readonly db = inject(StorageService);

  async getItems(): Promise<Item[]> {
    return this.db.getAll();
  }
}
```

## 🧪 Testing

### Domain Functions

```typescript
// Easy to test: pure function without dependencies
describe('calculateTotal', () => {
  it('should sum item quantities', () => {
    const items = [{ quantity: 5 }, { quantity: 10 }];
    expect(calculateTotal(items)).toBe(15);
  });
});
```

### Services

```typescript
// Testable with TestBed and mocks
TestBed.configureTestingModule({
  providers: [
    PantryService,
    { provide: StorageService, useValue: mockStorage }
  ]
});
```

## 📊 Current Metrics

- **Total files**: 143 TypeScript files
- **Services**: 35 services
- **Domain functions**: 50+ pure functions
- **Utils**: 13 utility modules
- **Models**: 30+ types/interfaces
- **Constants**: 15+ constant modules

## 🚀 Performance

### Signals and Reactivity

```typescript
// ✅ Computed signals memoized by Angular
readonly filteredItems = computed(() => {
  const items = this.items();
  const query = this.searchQuery();
  return items.filter(item => item.name.includes(query));
});
```

### Debouncing

```typescript
// ✅ Debouncing in expensive operations
private readonly SAVE_DEBOUNCE_MS = 500;
```

## 📝 Contributing

When modifying or adding code in `core`:

1. **Maintain separation of concerns**: Domain separate from Services
2. **Use strict TypeScript**: No `any`, complete typing
3. **Pure functions in domain/utils**: No side effects
4. **Document complex functions**: JSDoc when necessary
5. **Update barrel exports**: Add exports in `index.ts`
6. **Follow naming conventions**: Consistency in file names

## 🔗 References

- [Angular Signals](https://angular.io/guide/signals)
- [Dependency Injection](https://angular.io/guide/dependency-injection)
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)

---

**Last update**: 2026-02-12
**Status**: ✅ Production
