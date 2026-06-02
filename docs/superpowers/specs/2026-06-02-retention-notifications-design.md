# Retention Notifications — v4.5 Design

**Date:** 2026-06-02
**Branch:** `feat/retention-notifs-4.5` (off `release/4.5`)
**Status:** Design approved — ready for implementation plan

## Problem

PantryMind v4.5 ships with strong UI/UX but D7 retention ≈ 0% and zero analytics. Notification subsystem is functional but generic: count-only copy, no item names, no per-item deep link, no resurrection mechanism for lapsed users. Onboarding now opts users into notifications but does not confirm the decision works.

## Goal

Ship three notification-driven retention bets on the `release/4.5` branch before publishing. No analytics dependency (analytics + smart-timing + streaks defer to v4.6).

**Success criteria (qualitative, since no analytics):**
- Users who opt into notifications receive a confirming notification within minutes.
- Users who lapse for 2+ days receive escalating non-spammy nudges.
- Notifications that fire mention specific items by name and open the relevant item on tap.

## Stack

| Bet | Effort | What |
|---|---|---|
| **H — Welcome notification** | ~0.5d | First-impression confirmation +5min after opt-in |
| **B — Recovery push window** | ~3d | D2 / D5 / D10 silent pushes, cancel-on-return |
| **A — Smart copy + deep-link** | ~4-5d | Item names in body, `extra.itemId` payload, `/pantry?focusItem=<id>` deep-link |
| **D — Developer notifications panel** | ~1d | Settings → Advanced → Notifications dev section. Preview, fire-now per definition, cancel-all, view pending, view permission state |

Total: ~2 weeks. Sequence: H → B → A → D (D can ship in parallel with any — pure additive UI).

---

## Bet H — Welcome Notification

### Intent

Reinforce the user's opt-in decision before they forget it. Notification fires ~5 minutes after accepting permission on onboarding slide 1.

### Mechanics

1. `OnboardingStateService.acceptNotifications()` already requests OS permission and flips `notificationsEnabled = true` on grant.
2. **New**: post-grant, call `WelcomeNotificationService.scheduleWelcomeNotification()`.
3. Service schedules a single one-shot notification with `id = NOTIFICATION_IDS.WELCOME = 130`, fires at `now + WELCOME_DELAY_MS` (constant, default `5 * 60 * 1000`).
4. Welcome notification id is **NOT** registered in `NotificationRegistryService` → scheduler's `cancelAll()` skips it, no collision with regular daily picker.
5. Tap → routed by `NotificationSchedulerService.handleNotificationTap` (new case).

### Copy (es; mirror in 5 other langs)

- Title: `PantryMind está listo ✓`
- Body: `Las notificaciones funcionan correctamente. Añade tu primer producto y te avisaremos antes de que caduque.`

### Tap destination guard

If user already added items before the welcome fires, the "add your first product" CTA is stale. Route conditionally:

```ts
// In handleNotificationTap, case WELCOME:
const count = this.pantryStore.loadedProducts().length;
const queryParams = count > 0 ? {} : { openAddModal: 'true' };
await this.navCtrl.navigateRoot('/pantry', { queryParams });
```

### Files touched

| File | Change |
|---|---|
| `core/constants/notifications/notifications.constants.ts` | add `WELCOME: 130` to `NOTIFICATION_IDS`; add `WELCOME_DELAY_MS` |
| `core/services/notifications/welcome-notification.service.ts` (new, root) | `scheduleWelcomeNotification()` calls plugin.schedule directly, **not** via registry/scheduler |
| `core/services/onboarding/onboarding-state.service.ts` | inject `WelcomeNotificationService`; in `acceptNotifications()` post-grant: `await welcome.scheduleWelcomeNotification()` |
| `core/services/notifications/notification-scheduler.service.ts` | `handleNotificationTap`: case `WELCOME` with stock-aware routing |
| `assets/i18n/{es,en,de,fr,it,pt}.json` | `notifications.welcome.{title,body}` |

### Edge cases

| Case | Behavior |
|---|---|
| Permission denied | No-op — `acceptNotifications()` already returns early on deny |
| User re-opens onboarding (rare; `hasSeenOnboarding` flag prevents) | No re-schedule needed (flag short-circuits) |
| User adds products before D0+5min | Tap routes to `/pantry` plain (no add modal) |
| App killed before fire | Capacitor LocalNotifications persists schedule across kills — fires anyway |

### Risk

Low. Single-fire notification, no state machine, no scheduler interaction, id outside registry → no cancellation conflict.

### Test plan

- Unit: `WelcomeNotificationService.scheduleWelcomeNotification()` calls `plugin.schedule` with id=130, `scheduleAt = now + WELCOME_DELAY_MS`.
- Unit: `handleNotificationTap(WELCOME, undefined)` with `loadedProducts.length === 0` → navigates to `/pantry?openAddModal=true`.
- Unit: same with `loadedProducts.length > 0` → navigates to `/pantry` plain.
- Manual: complete onboarding accepting notif → wait 5min → notif appears → tap → opens pantry.

---

## Bet B — Recovery Push Window (D2 / D5 / D10)

### Intent

Re-engage users who go silent after onboarding. Three escalating notifications scheduled at onboarding completion, auto-cancelled when the user returns.

### Mechanics

1. `OnboardingStateService.completeOnboarding()` (post-flag-set, post-permission-granted):
   - Call `RecoveryNotificationsService.scheduleRecoveryWindow()`.
   - Service schedules three notifications with ids `RECOVERY_D2 = 140`, `RECOVERY_D5 = 141`, `RECOVERY_D10 = 142`.
   - Trigger times: `now + Nd`, each at `preferences.notificationHour` (default 9:00 local).
2. `app.component.ts` on bootstrap / resume: `recovery.cancelRecoveryWindow()`. No-op if nothing pending.
3. Tap on any recovery notif → `/dashboard` (user already has seed items from onboarding; no add modal).

### Copy (es; mirror in 5 langs)

| Day | Title | Body |
|---|---|---|
| D2 | `¿Cómo va tu despensa?` | `Revisa qué tienes en casa. Te ayudamos a no olvidar nada.` |
| D5 | `Hace 5 días que no nos vemos` | `Algunos productos podrían estar cerca de caducar. Échales un ojo.` |
| D10 | `Tu despensa te necesita` | `Vuelve y evita tirar comida. Tardas 30 segundos en revisarla.` |

Static copy. No item names (that's bet A — recovery defines its own envelope independent of pantry state at fire time).

### Files touched

| File | Change |
|---|---|
| `core/constants/notifications/notifications.constants.ts` | add `RECOVERY_D2=140, RECOVERY_D5=141, RECOVERY_D10=142`, `RECOVERY_OFFSETS_DAYS = [2,5,10] as const` |
| `core/services/notifications/recovery-notifications.service.ts` (new, root) | `scheduleRecoveryWindow()`, `cancelRecoveryWindow()` — direct plugin calls, outside registry |
| `core/services/onboarding/onboarding-state.service.ts` | inject `RecoveryNotificationsService`; in `completeOnboarding()` post permission check: `if (notifsGranted) await recovery.scheduleRecoveryWindow()` |
| `src/app/app.component.ts` | inject `RecoveryNotificationsService`; in `ngOnInit` (and Capacitor `App.addListener('appStateChange', ...)` on resume): `void recovery.cancelRecoveryWindow()` |
| `core/services/notifications/notification-scheduler.service.ts` | `handleNotificationTap`: cases `RECOVERY_D2/D5/D10 → navigateRoot('/dashboard')` |
| `assets/i18n/{es,en,de,fr,it,pt}.json` | `notifications.recovery.{d2,d5,d10}.{title,body}` |

### Edge cases

| Case | Behavior |
|---|---|
| User skips notif opt-in in onboarding | No schedule (no permission, gate in `completeOnboarding`) |
| User opens app D1 | `cancelRecoveryWindow()` cancels all 3 |
| User opens app D3 (after D2 fired) | Cancels D5 + D10; D2 already shipped |
| User uninstalls | Local notifs die with app — no server, no orphan pushes |
| User changes `notificationHour` after schedule | D2/D5/D10 keep original hour. Acceptable. |
| User re-completes onboarding (re-install) | `scheduleRecoveryWindow` cancels first as safety, then re-schedules |
| Regular scheduler fires on D2 (e.g. `EXPIRED_ITEMS`) before recovery D2 | User receives both. Mitigation deferred — see Out-of-Scope. |

### Risk

Low-medium. Three notifs across 10 days could feel spammy without cancel-on-open. Cancel mechanism + non-aggressive copy mitigate. Worst case: user feels nudged twice on the same day if regular scheduler also fires.

### Test plan

- Unit: `scheduleRecoveryWindow()` calls `plugin.schedule` three times with offsets `[2,5,10]` days at preferences hour.
- Unit: `cancelRecoveryWindow()` calls `plugin.cancel([140,141,142])`.
- Unit: `handleNotificationTap(RECOVERY_D5)` → `navigateRoot('/dashboard')`.
- Manual dev: extend `scheduleNotificationAtTime` to bypass the day offset and force D2 at +2min for QA.

### Out-of-scope (defer to v4.6 or later)

- Coordinated cancellation when regular scheduler fires (avoid double-notif same day).
- LLM-backed dynamic recovery copy.

---

## Bet A — Smart Copy + Deep-Link

### Intent

Replace generic count-only copy (`"3 productos caducan pronto"`) with named item copy (`"Tu yogur caduca mañana"`). Tap opens the specific item via `pantry-detail`.

Rule-based in v4.5. LLM contextual copy defers to v4.6.

### Mechanics

1. **Extend `ScheduledNotification` interface** with `extra?: Record<string, unknown>`.
2. **Plugin wiring**: `CapacitorNotificationPlugin.schedule()` passes `extra` through to Capacitor LocalNotifications native `extra` field. Listener `localNotificationActionPerformed` extracts `action.notification.extra` and passes to callback.
3. **`handleNotificationTap(id, extra)`** new signature: if `extra?.itemId` is present and item exists → `/pantry?focusItem=<id>`. Otherwise fallback to existing id-based routing (preserves H and B behavior).
4. **Each definition `.build()`** picks the highest-priority item from its filtered set, embeds `extra.itemId` and uses `_named` copy variant. Falls back to existing copy if no items (`return null` — already the case).
5. **`pantry-detail` deep-link entry**: `PantryComponent` reads `?focusItem=<id>` queryParam, calls existing pantry-detail open path with that item.

### Definition changes — pattern

```ts
// expired-items.notification.ts (excerpt)
build(context: NotificationContext): ScheduledNotification | null {
  const { items, preferences, t, now } = context;
  const expired = filterExpiredItems(items, now);
  if (!expired.length) return null;

  const winner = pickPriorityItem(expired, 'expired');   // new domain helper
  const count = expired.length;
  const hour = preferences.notificationHour ?? 9;

  const titleKey = count === 1 ? 'notifications.expired.title_one' : 'notifications.expired.title';
  const bodyKey  = count === 1
    ? 'notifications.expired.body_one_named'
    : 'notifications.expired.body_many_named';

  return {
    id: this.id,
    title: t(titleKey),
    body: t(bodyKey, { name: winner.name, others: Math.max(count - 1, 0) }),
    scheduleAt: buildNextTriggerDate(now, hour).toISOString(),
    extra: { itemId: winner._id },
  };
}
```

### Copy templates (es; mirror in 5 langs)

| Definition | Case | Body |
|---|---|---|
| Expired | 1 expired | `Tu {{name}} ya caducó. Decide si conservarlo o tirarlo.` |
| Expired | N expired | `Tu {{name}} y {{others}} más han caducado.` |
| Near-expiry | 1, tomorrow | `Tu {{name}} caduca mañana. Consúmelo hoy.` |
| Near-expiry | 1, N days | `Tu {{name}} caduca en {{days}} días.` |
| Near-expiry | N items | `Tu {{name}} y {{others}} más caducan pronto.` |
| Low-stock | 1 below | `Te queda poco {{name}}. Añádelo a la lista.` |
| Low-stock | N below | `Poco stock de {{name}} y {{others}} más.` |
| Re-engagement | weekly | `Hora de revisar tu despensa.` (no name — agnostic) |

### Deep-link routing

Use query param (mirrors existing `?openAddModal=true` pattern, no router config churn):

`/pantry?focusItem=<id>` → `PantryComponent.ionViewWillEnter` reads the param, looks up the item in `pantryStore.loadedProducts()`, opens the pantry-detail UI for that item, then clears the param via `router.navigate` (so back nav doesn't re-trigger).

### Files touched

| File | Change |
|---|---|
| `core/models/notifications/notification.model.ts` | `ScheduledNotification.extra?: Record<string, unknown>` |
| `core/services/notifications/notification.plugin.ts` | extend `ScheduledNotificationInput` with `extra?`; tap callback signature now `(id: number, extra?: Record<string, unknown>) => void` |
| `core/services/notifications/capacitor-notification.plugin.ts` | `schedule()` passes `extra` to native; listener extracts `action.notification.extra` and forwards |
| `core/services/notifications/notification-scheduler.service.ts` | `handleNotificationTap(id, extra)` — branches on `extra?.itemId`; preserves existing fallback cases |
| `core/services/notifications/definitions/expired-items.notification.ts` | embed `extra.itemId` + named-body copy |
| `core/services/notifications/definitions/near-expiry.notification.ts` | idem (+ days-tomorrow branch) |
| `core/services/notifications/definitions/low-stock.notification.ts` | idem |
| `core/services/notifications/definitions/re-engagement.notification.ts` | no change (agnostic body, no extra) |
| `core/domain/notifications/notification.domain.ts` | new `pickPriorityItem(items, kind: 'expired' | 'near-expiry' | 'low-stock')` — returns the single item that best represents the alert (existing filter results already pre-sorted by urgency where applicable) |
| `features/pantry/pantry.component.ts` | read `?focusItem` queryParam in `ionViewWillEnter`, open pantry-detail for that id, clear the param |
| `assets/i18n/{es,en,de,fr,it,pt}.json` | `*_named` variants under `notifications.expired.*`, `notifications.nearExpiry.*`, `notifications.lowStock.*` |

### Backwards compat

- `extra` is optional on the interface — welcome (H) and recovery (B) keep working unchanged.
- `handleNotificationTap` falls back to existing id-based routing when `extra` is absent.
- New `_named` i18n keys live alongside (do not replace) existing keys. Definitions can fall back to non-named keys if `winner.name` is empty (defensive — shouldn't happen).

### Edge cases

| Case | Behavior |
|---|---|
| Item deleted between schedule and tap | Lookup in `loadedProducts` returns undefined → fall back to `/pantry` plain |
| Item name contains very long string | UI truncates in notification body (OS-level), template handled |
| Definition filter list empty at build time | Returns `null` (existing behavior) — no name to embed |
| `extra` field unsupported by older OS / WebView | Capacitor LocalNotifications handles gracefully — `extra` is documented stable since plugin v5 |
| Multiple items expired with same urgency | `pickPriorityItem` deterministic on name lex sort as tie-break |
| User on language without translation for `*_named` key | i18n loader logs missing key, ngx-translate returns the key itself — defensive: ensure all 6 langs ship together |

### Risk

Medium. Touches shared `ScheduledNotification` interface + Capacitor plugin wiring + three definitions + new route param entry. Surface area is contained: bet A is independent of H and B at the data level.

### Test plan

- Unit per definition: 1-item case → assert `body` interpolates `name`, `extra.itemId` matches winner.
- Unit per definition: N-item case → assert `body` mentions name + `others = N-1`.
- Unit `handleNotificationTap`:
  - `(id, { itemId: 'x' })` with item present → navigates to `/pantry?focusItem=x`.
  - `(id, { itemId: 'x' })` with item missing → falls back to `/pantry`.
  - `(id, undefined)` → existing routing preserved (regression).
- Unit `pickPriorityItem`: deterministic ordering across kinds.
- Manual: dev tool to schedule each definition with seeded pantry → tap → lands on correct pantry-detail.

### Out-of-scope (defer to v4.6)

- LLM-backed `/notification/copy` backend route — contextual creative copy ("Tu queso ideal para una tortilla esta noche"). Rule-based covers ~80% of value.
- Fresh products in smart copy — current definitions are despensa-only (`PantryItem` with batches). Fresh has its own urgency model; bet for v4.6.
- Inline action buttons ("Consumir" / "Ver") on Android notifications.
- Schedule-time `extra` for welcome (H) and recovery (B) — not needed (their routing is id-based).

---

## Bet D — Developer Notifications Panel

### Intent

Settings → Advanced today has zero notification controls. Scheduler already exposes `previewNextNotification()`, `scheduleTestNotification()`, and `scheduleNotificationAtTime()` but no UI calls them — so QA-ing a notification means waiting for the real schedule or hacking a debug build.

Add a dedicated developer notifications section so:
- Each definition (regular + new welcome/recovery) can be fired manually in 5s for verification.
- The currently scheduled pending notifications can be inspected.
- Permission state + preferences are visible at a glance.
- Cancel-all is one tap.

This pays for itself during H/B/A QA and stays useful for v4.6 retention bets.

### Mechanics

New card inside `settings-advanced.component.html` titled "Notificaciones (desarrollador)". Card is **always visible** (no env gating) — the existing data export/reset card already takes the same "advanced user accepts the risk" stance, and dev mode toggles add complexity without payoff at this scale. Optional follow-up: gate the section behind a 5-tap-on-version-number gesture if it leaks.

UI rows:

| Row | Action |
|---|---|
| Permission state | Read-only display: granted / denied / prompt / unknown |
| Notifications enabled (preference) | Read-only display (mirrors Settings → Notifications toggle) |
| Preview next | Calls `scheduler.previewNextNotification()` → alert with `{title, body}` or "Nothing would fire" |
| Fire winning in 5s | Calls `scheduler.scheduleTestNotification()` |
| Fire `EXPIRED_ITEMS` in 5s | Per-definition forced fire (new scheduler method `fireDefinitionInFiveSeconds(id)`) |
| Fire `NEAR_EXPIRY` in 5s | idem |
| Fire `LOW_STOCK` in 5s | idem |
| Fire `RE_ENGAGEMENT` in 5s | idem |
| Fire `WELCOME` in 5s | Calls `welcomeNotif.scheduleWelcomeNotification({ delayMs: 5000 })` (new optional param) |
| Fire `RECOVERY_D2` in 5s | Calls `recoveryNotif.fireRecoveryNotification('d2', { delayMs: 5000 })` (new method) |
| Fire `RECOVERY_D5` in 5s | idem |
| Fire `RECOVERY_D10` in 5s | idem |
| Pending notifications | List from `LocalNotifications.getPending()` — id, title, scheduleAt |
| Cancel all scheduled | Calls `scheduler.cancelAll()` + cancels welcome + recovery ids |
| Refresh pending list | Re-reads `getPending()` |

### Files touched

| File | Change |
|---|---|
| `core/services/notifications/notification-scheduler.service.ts` | new method `fireDefinitionInFiveSeconds(definitionId: number): Promise<boolean>` — looks up the definition in the registry, builds its payload with current context, schedules at `now + 5s` (skips priority gating so even non-winners can be tested) |
| `core/services/notifications/welcome-notification.service.ts` (new in H) | accept optional `{ delayMs?: number }` param on `scheduleWelcomeNotification` for dev override |
| `core/services/notifications/recovery-notifications.service.ts` (new in B) | new method `fireRecoveryNotification(slot: 'd2'\|'d5'\|'d10', opts?: { delayMs?: number })` — fires a single recovery slot now (does not affect the real D2/D5/D10 schedule) |
| `core/services/notifications/capacitor-notification.plugin.ts` | expose `getPending(): Promise<PendingNotification[]>` wrapping Capacitor `LocalNotifications.getPending()` |
| `core/services/notifications/notification.plugin.ts` | extend `INotificationPlugin` with `getPending()` |
| `core/services/settings/settings-notifications-dev-state.service.ts` (new, page-scoped) | facade for the dev panel: `permissionState`, `notificationsEnabled`, `pending` signals; methods `previewNext`, `fireWinning`, `fireDefinition(id)`, `fireWelcome`, `fireRecovery(slot)`, `cancelAll`, `refreshPending` |
| `features/settings/components/settings-advanced/settings-advanced.component.{ts,html}` | inject new state service, add the "Notificaciones (desarrollador)" card after data card |
| `assets/i18n/{es,en,de,fr,it,pt}.json` | add `settings.dev.notifications.*` (title, subtitle, row labels, button labels, empty-pending copy) |

### Why this scope

Existing dev hooks (`scheduleTestNotification`, `scheduleNotificationAtTime`, `previewNextNotification`) cover only the "winning" notification path. Manual QA of bet A needs:
- Forcing a specific definition (e.g. `NEAR_EXPIRY`) when expired-items would otherwise win → `fireDefinitionInFiveSeconds`.
- Verifying that welcome and recovery fire correctly without waiting 5/10 days.
- Confirming `extra.itemId` payload arrives via tap (read from `getPending()` and tap to test).

### Edge cases

| Case | Behavior |
|---|---|
| Definition `.build()` returns `null` (no items match filter) | Show toast: "Nada que disparar — no hay items que cumplan". No crash. |
| Web platform (`!Capacitor.isNativePlatform()`) | Panel still visible; fire buttons short-circuit and toast "Notificaciones sólo en Android". Pending list shows empty. |
| Permission not granted when tapping fire | Request permission first via `scheduler.permission.request()`. If denied, toast. |
| User taps a fired notification that points to a deleted item (A) | Tap handler already has fallback (`/pantry` plain) — verified manually via this panel |
| Pending list stale after fire | `fireDefinitionInFiveSeconds` triggers `refreshPending` automatically |

### Risk

Very low. Pure additive UI + scheduler method that does not interact with the regular scheduling loop. `cancelAll` from the panel uses the same path as the normal cancel — no orphan-id risk.

### Test plan

- Unit: `fireDefinitionInFiveSeconds(NOTIFICATION_IDS.EXPIRED_ITEMS)` calls `plugin.schedule` with the expired definition's payload at `now + 5000`.
- Unit: `fireDefinitionInFiveSeconds` with unregistered id returns `false`.
- Manual: each fire button → wait 5s → notif arrives → tap → correct routing.
- Manual: cancel-all wipes pending list.

### Out-of-scope (defer)

- 5-tap-on-version gate to hide the panel from non-devs.
- Custom payload editor (manually set title/body/extra) — useful but high-effort vs payoff.
- Notification history viewer (which notifs actually fired in last 7 days) — needs persistent log, not built today.

---

## Cross-cutting concerns

### Notification ID map after this work

| ID | Constant | Source | Registered? |
|---|---|---|---|
| 100 | `EXPIRED_ITEMS` | scheduler / registry | Yes |
| 101 | `NEAR_EXPIRY` | scheduler / registry | Yes |
| 110 | `LOW_STOCK` | scheduler / registry | Yes |
| 120 | `RE_ENGAGEMENT` | scheduler / registry | Yes |
| 130 | `WELCOME` (new) | one-shot post-onboarding | No (outside registry) |
| 140 | `RECOVERY_D2` (new) | one-shot post-onboarding | No |
| 141 | `RECOVERY_D5` (new) | one-shot post-onboarding | No |
| 142 | `RECOVERY_D10` (new) | one-shot post-onboarding | No |

Registry-managed scheduler keeps single-winner behavior for 100-120. Welcome and recovery live outside the registry so `cancelAll()` does not nuke them.

### i18n delta summary

New keys (all 6 langs):

```
notifications.welcome.title
notifications.welcome.body
notifications.recovery.d2.title
notifications.recovery.d2.body
notifications.recovery.d5.title
notifications.recovery.d5.body
notifications.recovery.d10.title
notifications.recovery.d10.body
notifications.expired.body_one_named
notifications.expired.body_many_named
notifications.nearExpiry.body_one_named
notifications.nearExpiry.body_one_named_tomorrow
notifications.nearExpiry.body_many_named
notifications.nearExpiry.body_many_named_tomorrow
notifications.lowStock.body_one_named
notifications.lowStock.body_many_named
```

All six language files must ship together (loader is fail-fast; mismatched shape breaks `instant()`).

### Documentation updates after implementation

- `.claude/NOTIFICATIONS.md` — update id map, document welcome + recovery services as outside-registry, document `extra` field, document deep-link routing, document developer panel + new scheduler methods.
- `.claude/STATE.md` — move H/B/A/D from "Retention roadmap reference" pending to "What shipped in v4.5".
- `.claude/I18N.md` — no change (namespace structure unchanged).
- `.claude/FILE-MAP.md` — add new services (`welcome-notification.service`, `recovery-notifications.service`, `settings-notifications-dev-state.service`).

---

## Build sequence

1. **H** first — smallest, no shared interface changes. Validates Capacitor schedule path with new id outside registry.
2. **B** second — same pattern as H (outside-registry one-shots, scheduled at onboarding). Adds the `app.component.ts` cancel-on-resume hook.
3. **A** third — touches shared `ScheduledNotification` interface, plugin wiring, three definitions, plus deep-link param. Most surface area.
4. **D** last (but can shift earlier) — pure additive UI. Implementing D **between H and B** is also valid: it gives a manual QA surface for the rest of the work and pays back via faster iteration. Choose timing once H is implemented and the actual QA pain shows.

Each bet is independently shippable. If A slips, H+B+D still deliver value.

## Success gates

- H: manual QA — opt-in onboarding → notif arrives in ~5min → tap lands appropriately.
- B: manual QA via dev panel (D) forcing recovery → notif arrives → tap → `/dashboard` → cancel on open verified.
- A: per-definition QA with seeded pantry — body shows item name + tap lands on pantry-detail for that item.
- D: every fire button produces a notification within 5 seconds on a real Android device; cancel-all clears the pending list.

Long-term success can only be measured once analytics ships (v4.6). For v4.5 the bar is "ships without regressing existing notification behavior."
