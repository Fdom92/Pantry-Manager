# Patterns

Recipes for recurring tasks. When a recipe and the code disagree, the code wins — fix this file.

## Page state (facade)

```ts
// core/services/<area>/<name>-state.service.ts — page-scoped: no providedIn
@Injectable()
export class MyStateService {
  private readonly store = inject(PantryStoreService);   // root services are fine to inject
  readonly open = signal(false);
  readonly visible = computed(() => this.store.loadedProducts().filter(isSomething));
  openSheet(): void { this.open.set(true); }
}

@Component({ providers: [MyStateService] })
export class MyPageComponent { readonly facade = inject(MyStateService); }
```

Root singletons use `@Injectable({ providedIn: 'root' })`. Ionic controllers injected in a root
service come from `@ionic/angular/standalone` (the `@ionic/angular` ones aren't provided in this
standalone app and blank the screen at boot).

## Business rule

```ts
// core/domain/<area>/<name>.domain.ts — pure: no Angular, no inject(), no Date.now() inside
export function myRule(input: Input, now: Date): Output { … }
```

Write `<name>.domain.spec.ts` first and watch it fail. Export from the folder's `index.ts`.
Import from `@core/domain/<area>` in services.

## Sheets and modals

Declared in the template, driven by a signal — no `ModalController.create`:

```html
<ion-modal class="app-sheet-modal" [isOpen]="facade.open()" (willDismiss)="facade.dismiss()">…</ion-modal>
```

`.app-sheet-modal` (global styles) owns radius, background, density and safe-area footer.
Menus that only pick an option use `ActionSheetController` (see `ListStateService.openRowActions`).

## User feedback

```ts
this.toast.success('pantry.toasts.saved');                  // ToastService: i18n key, not text
this.toast.withAction('shopping.toasts.unbasic', 'common.actions.undo', () => undo(), { name });
const ok = await this.confirm.confirm(message, { confirmKey: 'common.actions.delete' });  // ConfirmService
const choice = await this.confirm.choose(message, { choices: [...] });
```

One toast at a time; it moves to the top while a sheet is open. Never inject `ToastController`.

## Errors

```ts
this.logger.error('ListStateService', 'markAsBought failed', err);   // → Sentry event
this.logger.warn('PantryService', 'warmup failed', { err: String(err) }); // → breadcrumb only
```

First argument is the class name (Sentry tag). Plain objects go in the `extra` slot, never as
`err`. Expected, recoverable failures are `warn`; failures the user suffers are `error`.
Consent is already enforced in `main.ts`'s `beforeSend`.

## Analytics event

1. Add the constant to `ANALYTICS_EVENTS` with a comment saying what question it answers.
2. `this.analytics.track(ANALYTICS_EVENTS.X, { flat: 'props' })` — snake_case, string/number/boolean
   only, no names or free text. A list goes as a sorted comma-joined string.
3. The same prop name must mean the same thing across events (PostHog props are global).

## History event

Through `HistoryEventManagerService` only (`logAddNewItem`, `logAddExistingItem`,
`logAdvancedEdit`, `logStockAdjust`, `logExpiredBatches`, `logDeleteFromCard`). Don't inject
`HistoryEventLogService` from features.

## PRO gating

`UpgradeRevenuecatService.isPro()` for a synchronous check, `isPro$` for reactive code
(`toSignal`). Non-production builds behave as PRO; the backend's `verifyPro` also bypasses
outside production.

## Icons

Import the icon from `ionicons/icons` and add it to `APP_ICONS` in `src/app/app-icons.ts`.
`node scripts/check-icons.mjs` verifies template icons; icons passed from TypeScript
(action sheets, dynamic bindings) must be checked by hand.

## Text matching

`core/utils/normalization.util.ts`: `normalizeProductKey` to decide whether two product names are
the same product (case, accents, spacing); `normalizeSearchQuery` for search;
`formatFriendlyName` for display casing.

## Receipt parser rule

1. Reproduce with the real ticket's rows as a fixture in the spec (`row('a | b | c')`).
2. Add the smallest rule that fixes it, with a comment citing the ticket (chain, date, line).
3. All existing receipt specs must pass unchanged. A layout that needs its own logic gets its
   own reader file, dispatched from `parseReceipt` (see `quantity-first-parser.domain.ts`).

## Native plugin

Local Capacitor plugins live next to `MainActivity.java` and are registered in `onCreate`
**before** `super.onCreate`. They never reject: failures resolve with an explicit error flag the
TS side maps to a safe value. Only verifiable on a device.

## Buttons

- `shape="round"` (pill) for primary CTAs that own their space: sheet save/confirm, onboarding,
  empty-state action, PRO hero, plan cards, icon-only circular buttons (shopping `buy-btn`).
- Default rectangle for secondary `size="small"` CTAs inside tonal cards, so they don't look
  like the non-clickable status chips.
- `fill="clear"` and toolbar buttons are never pills.
