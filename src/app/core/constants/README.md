# Constants

Configuration constants and fixed values organized by feature.

## 🎯 Purpose

- ✅ Centralized configuration values
- ✅ Eliminated magic numbers
- ✅ Consistent storage keys
- ✅ Default configuration

## 📂 Structure

```text
constants/
├── agent/          # AI agent config
├── dashboard/      # Dashboard and insights
├── pantry/         # Pantry config
├── settings/       # Settings defaults
├── shared/         # Shared constants
└── shopping/       # Shopping config
```

## 📚 Main Constants

### Pantry

```typescript
export const DEFAULT_PANTRY_PAGE_SIZE = 300;
export const BATCH_STOCK_SAVE_DELAY_MS = 500;
export const NEAR_EXPIRY_WINDOW_DAYS = 7;
export const UNASSIGNED_LOCATION_KEY = 'location:none';
```

### Shared Storage

```typescript
export const STORAGE_KEYS = {
  PREFERENCES: 'app:preferences',
  PRO_STATUS: 'revenuecat:isPro',
  ONBOARDING_FLAG: 'hasSeenOnboarding',
  REVIEW_FIRST_USE_AT: 'review:firstUseAt',
  REVIEW_LAUNCH_COUNT: 'review:launchCount',
  REVIEW_LAST_PROMPT_AT: 'review:lastPromptAt',
  REVIEW_COMPLETED_AT: 'review:completedAt',
  REVIEW_PRODUCT_ADD_COUNT: 'review:productAddCount',
  REVIEW_CONSUME_COUNT: 'review:consumeCount',
  REVIEW_PENDING: 'review:pending',
} as const;

export const APP_DB_NAME = 'pantry-db';
export const DEFAULT_HOUSEHOLD_ID = 'household:default';
```

### i18n

```typescript
export const SUPPORTED_LANGUAGES = ['es', 'en'] as const;
export const DEFAULT_LANGUAGE = 'es';
```

## 🎨 Conventions

- **UPPER_SNAKE_CASE** for primitives
- **as const** for readonly
- Group related constants in objects

---

**See also**: [Services](../services/README.md), [Utils](../utils/README.md)
