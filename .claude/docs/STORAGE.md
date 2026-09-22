# Storage

Offline-first, no cloud sync. Two backends; the rule for choosing between them is in the
docblock of `STORAGE_KEYS` (`core/constants/shared/storage.constants.ts`):
*"Should the user see this restored on a fresh install + import?"* yes → PouchDB, no → `localStorage`.

## PouchDB

- One database, `APP_DB_NAME = 'pantry-db'`, `pouchdb-browser` + `pouchdb-find`, auto-compaction.
- Generic wrapper: `StorageService` (`core/services/shared/storage.service.ts`) — upsert with
  timestamps and `_rev` handling, `watchChanges` live feed. Domain services inject it and filter
  by their `type` discriminator.
- Document ids are `{type}:{uuid}` via `createDocumentId(type)` (`core/utils/uuid.util.ts`):

| Document | `_id` | Owner |
|---|---|---|
| Pantry product | `item:{uuid}` | `PantryService` |
| History event | `event:{uuid}` | `HistoryEventLogService` |
| Preferences (singleton) | `STORAGE_KEYS.PREFERENCES` = `app:preferences` | `SettingsPreferencesService` |
| Streak (singleton) | `streak:current` | `StreakStateService` |
| AI insights cache (singleton) | `insights-analysis-cache` | `InsightsCacheStorageService` |

- `PantryService.applyDerivedFields()` recomputes `expirationDate` (earliest lot expiry) and
  `expirationStatus` on every save and read. Never trust them on write.
- Backup/restore is a JSON export/import (`SyncService`); restore goes through normal saves.

## localStorage

Per-device state, lost on reinstall on purpose. **All access goes through `LocalStorageService`**
(`core/services/shared/local-storage.service.ts`), grouped by domain (`onboarding`, `pro`,
`review`, `manualList`, `coachMark`, `householdSize`…). Every key is declared in `STORAGE_KEYS`;
read that file for the current list rather than copying it here.

Examples: onboarding done flag, cached PRO status, review-prompt counters, pending manual
shopping items, one-shot coach marks, the error-reporting consent mirror read by Sentry in
`main.ts` before Angular boots.

## Gotchas

- `_rev` is owned by `StorageService`; don't carry a stale `_rev` into a save. Re-creating a
  deleted document needs a save without its old `_rev`.
- `allDocs` returns singletons too; use type-scoped queries for collections.
- Screen state (filters, view toggles) is not an app preference: changes to
  `AppPreferences` re-run the notification scheduler.
