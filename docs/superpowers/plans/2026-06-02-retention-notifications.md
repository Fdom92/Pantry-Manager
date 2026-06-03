# Retention Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three retention bets (welcome notification, recovery push window, smart-copy + deep-link) plus a developer notifications panel on the `feat/retention-notifs-4.5` branch.

**Architecture:** Three new outside-of-registry notification flows (welcome, recovery) live in dedicated root-scoped services. Existing four definitions extend with `extra.itemId` payload and named-item body copy. `ScheduledNotification` interface gains an optional `extra` field; `CapacitorNotificationPlugin` threads it through Capacitor `LocalNotifications`. Tap handler in `NotificationSchedulerService` branches on `extra.itemId` for per-item deep-link via `/pantry?focusItem=<id>`. A developer card inside Settings → Advanced exposes fire-now buttons + pending-list viewer.

**Tech Stack:** Angular 20 Signals, Ionic 8, Capacitor 7 `@capacitor/local-notifications`, ngx-translate, Karma + Jasmine.

**Spec:** `docs/superpowers/specs/2026-06-02-retention-notifications-design.md`.

**Conventions:**
- Path aliases: `@core/*`, `@features/*`, `@shared/*`.
- Page-scoped services use `@Injectable()` and live in `providers: [...]`. Root-scoped use `@Injectable({ providedIn: 'root' })`.
- All i18n changes touch 6 files at once: `es | en | de | fr | it | pt`. Spanish is source-of-truth.
- Run tests: `ng test --watch=false --browsers=ChromeHeadless --include='<glob>'` for fast iteration.
- Commit after every passing task. Prefix: `feat(retention):`, `feat(notif):`, `feat(settings):`, `test(...):` matching existing style.

---

## Bet H — Welcome Notification

### Task H1: Add WELCOME constant and delay

**Files:**
- Modify: `src/app/core/constants/notifications/notifications.constants.ts`

- [ ] **Step 1: Modify the constants file**

Replace the file contents:

```ts
export const NOTIFICATION_IDS = {
  EXPIRED_ITEMS: 100,
  NEAR_EXPIRY: 101,
  LOW_STOCK: 110,
  RE_ENGAGEMENT: 120,
  WELCOME: 130,
} as const;

export const NOTIFICATION_CHANNEL_ID = 'pantry-alerts';
export const NOTIFICATION_CHANNEL_NAME = 'Pantry Alerts';
export const DEFAULT_NOTIFICATION_HOUR = 9;

/** Welcome notification fires this long after a user accepts notifs in onboarding. */
export const WELCOME_DELAY_MS = 5 * 60 * 1000;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/constants/notifications/notifications.constants.ts
git commit -m "feat(notif): reserve WELCOME id 130 + WELCOME_DELAY_MS"
```

---

### Task H2: WelcomeNotificationService (TDD)

**Files:**
- Create: `src/app/core/services/notifications/welcome-notification.service.ts`
- Create: `src/app/core/services/notifications/welcome-notification.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/notifications/welcome-notification.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { NOTIFICATION_IDS, WELCOME_DELAY_MS } from '@core/constants';
import { CapacitorNotificationPlugin } from './capacitor-notification.plugin';
import { WelcomeNotificationService } from './welcome-notification.service';

class FakePlugin {
  scheduled: Array<{ id: number; title: string; body: string; scheduleAt: Date }> = [];
  schedule = jasmine.createSpy('schedule').and.callFake(async (notifs: any[]) => {
    this.scheduled.push(...notifs);
  });
}

class FakeTranslate {
  instant(key: string): string {
    return `[${key}]`;
  }
}

describe('WelcomeNotificationService', () => {
  let service: WelcomeNotificationService;
  let plugin: FakePlugin;

  beforeEach(() => {
    plugin = new FakePlugin();
    TestBed.configureTestingModule({
      providers: [
        WelcomeNotificationService,
        { provide: CapacitorNotificationPlugin, useValue: plugin },
        { provide: TranslateService, useClass: FakeTranslate },
      ],
    });
    service = TestBed.inject(WelcomeNotificationService);
  });

  it('schedules a welcome notification with id WELCOME at now + WELCOME_DELAY_MS', async () => {
    const before = Date.now();
    await service.scheduleWelcomeNotification();
    const after = Date.now();
    expect(plugin.scheduled.length).toBe(1);
    const n = plugin.scheduled[0];
    expect(n.id).toBe(NOTIFICATION_IDS.WELCOME);
    expect(n.title).toBe('[notifications.welcome.title]');
    expect(n.body).toBe('[notifications.welcome.body]');
    const ts = n.scheduleAt.getTime();
    expect(ts).toBeGreaterThanOrEqual(before + WELCOME_DELAY_MS - 50);
    expect(ts).toBeLessThanOrEqual(after + WELCOME_DELAY_MS + 50);
  });

  it('respects an override delayMs param (used by dev panel)', async () => {
    const before = Date.now();
    await service.scheduleWelcomeNotification({ delayMs: 5_000 });
    const ts = plugin.scheduled[0].scheduleAt.getTime();
    expect(ts).toBeGreaterThanOrEqual(before + 5_000 - 50);
    expect(ts).toBeLessThanOrEqual(before + 5_000 + 200);
  });
});
```

- [ ] **Step 2: Run the test — it should fail with "module not found"**

Run: `ng test --watch=false --browsers=ChromeHeadless --include='**/welcome-notification.service.spec.ts'`
Expected: FAIL — `Cannot find module './welcome-notification.service'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/app/core/services/notifications/welcome-notification.service.ts`:

```ts
import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { NOTIFICATION_IDS, WELCOME_DELAY_MS } from '@core/constants';
import { CapacitorNotificationPlugin } from './capacitor-notification.plugin';

@Injectable({ providedIn: 'root' })
export class WelcomeNotificationService {
  private readonly plugin = inject(CapacitorNotificationPlugin);
  private readonly translate = inject(TranslateService);

  /**
   * Schedule the post-onboarding welcome notification.
   * Default delay is WELCOME_DELAY_MS; tests / dev panel may override.
   */
  async scheduleWelcomeNotification(opts?: { delayMs?: number }): Promise<void> {
    const delay = opts?.delayMs ?? WELCOME_DELAY_MS;
    await this.plugin.schedule([
      {
        id: NOTIFICATION_IDS.WELCOME,
        title: this.translate.instant('notifications.welcome.title'),
        body: this.translate.instant('notifications.welcome.body'),
        scheduleAt: new Date(Date.now() + delay),
      },
    ]);
  }
}
```

- [ ] **Step 4: Run the test — should pass**

Run: `ng test --watch=false --browsers=ChromeHeadless --include='**/welcome-notification.service.spec.ts'`
Expected: PASS (2 specs).

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/notifications/welcome-notification.service.ts src/app/core/services/notifications/welcome-notification.service.spec.ts
git commit -m "feat(notif): WelcomeNotificationService — schedule post-opt-in confirmation"
```

---

### Task H3: i18n keys for welcome

**Files:**
- Modify: `src/assets/i18n/es.json`
- Modify: `src/assets/i18n/en.json`
- Modify: `src/assets/i18n/de.json`
- Modify: `src/assets/i18n/fr.json`
- Modify: `src/assets/i18n/it.json`
- Modify: `src/assets/i18n/pt.json`

- [ ] **Step 1: Add keys to es.json**

Locate the `"notifications": { ... }` block. Inside it, after the existing entries, add:

```json
"welcome": {
  "title": "PantryMind está listo ✓",
  "body": "Las notificaciones funcionan correctamente. Añade tu primer producto y te avisaremos antes de que caduque."
},
```

- [ ] **Step 2: Mirror into en.json**

Same location, equivalent strings:

```json
"welcome": {
  "title": "PantryMind is ready ✓",
  "body": "Notifications are working. Add your first product and we'll alert you before it expires."
},
```

- [ ] **Step 3: Mirror into de.json**

```json
"welcome": {
  "title": "PantryMind ist bereit ✓",
  "body": "Benachrichtigungen funktionieren. Füge dein erstes Produkt hinzu — wir melden uns, bevor es abläuft."
},
```

- [ ] **Step 4: Mirror into fr.json**

```json
"welcome": {
  "title": "PantryMind est prêt ✓",
  "body": "Les notifications fonctionnent. Ajoute ton premier produit et on te préviendra avant qu'il n'expire."
},
```

- [ ] **Step 5: Mirror into it.json**

```json
"welcome": {
  "title": "PantryMind è pronto ✓",
  "body": "Le notifiche funzionano. Aggiungi il tuo primo prodotto e ti avviseremo prima che scada."
},
```

- [ ] **Step 6: Mirror into pt.json**

```json
"welcome": {
  "title": "PantryMind está pronto ✓",
  "body": "As notificações funcionam. Adiciona o teu primeiro produto e avisamos-te antes de caducar."
},
```

- [ ] **Step 7: Verify each file is valid JSON**

Run: `node -e "for (const f of ['es','en','de','fr','it','pt']) JSON.parse(require('fs').readFileSync('src/assets/i18n/'+f+'.json','utf8'));"`
Expected: no output (no parse errors).

- [ ] **Step 8: Commit**

```bash
git add src/assets/i18n/*.json
git commit -m "feat(notif): i18n welcome notification copy (6 langs)"
```

---

### Task H4: Wire welcome into onboarding

**Files:**
- Modify: `src/app/core/services/onboarding/onboarding-state.service.ts`

- [ ] **Step 1: Add the WelcomeNotificationService import and inject**

In `src/app/core/services/onboarding/onboarding-state.service.ts`, add this import near the others:

```ts
import { WelcomeNotificationService } from '../notifications/welcome-notification.service';
```

Inside the class, after the existing `private readonly preferences = inject(SettingsPreferencesService);` line, add:

```ts
private readonly welcomeNotif = inject(WelcomeNotificationService);
```

- [ ] **Step 2: Call scheduleWelcomeNotification on successful opt-in**

Inside `acceptNotifications`, locate the `if (granted) {` block. After the existing `await this.preferences.savePreferences({ ... })` call but **before** the closing `}` of the `if (granted)` block, add:

```ts
await this.welcomeNotif.scheduleWelcomeNotification();
```

The full block should read:

```ts
if (granted) {
  const current = await this.preferences.getPreferences();
  await this.preferences.savePreferences({
    ...current,
    notificationsEnabled: true,
    notifyOnExpired: true,
    notifyOnNearExpiry: true,
    notifyOnLowStock: true,
  });
  await this.welcomeNotif.scheduleWelcomeNotification();
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/services/onboarding/onboarding-state.service.ts
git commit -m "feat(retention): fire welcome notification on onboarding opt-in"
```

---

### Task H5: Tap handler for WELCOME with stock-aware routing

**Files:**
- Modify: `src/app/core/services/notifications/notification-scheduler.service.ts`

- [ ] **Step 1: Update handleNotificationTap to add the WELCOME case**

Locate the `handleNotificationTap` method. The current `switch (id)` block ends before falling through to `await this.navCtrl.navigateRoot('/pantry');`. Add the WELCOME case **at the end of the switch** (before the `}` that closes the switch):

```ts
case NOTIFICATION_IDS.WELCOME: {
  const count = this.pantryStore.loadedProducts().length;
  const queryParams = count > 0 ? {} : { openAddModal: 'true' };
  await this.navCtrl.navigateRoot('/pantry', { queryParams });
  return;
}
```

The `return;` is important — it skips the trailing default `navigateRoot('/pantry')`.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/services/notifications/notification-scheduler.service.ts
git commit -m "feat(notif): WELCOME tap routes to /pantry, opens add modal only when empty"
```

---

### Task H6: Manual QA for bet H

- [ ] **Step 1: Build and install on device**

```bash
npm run prepare:build
npx cap run android
```

- [ ] **Step 2: Reset onboarding flag in DevTools**

In Chrome DevTools → Application → Local Storage → device origin, run:

```js
localStorage.removeItem('hasSeenOnboarding');
```

Then refresh the app.

- [ ] **Step 3: Complete the notification opt-in flow**

- Reach onboarding slide 1.
- Tap "Notificarme" / "Notify me".
- Accept the OS permission dialog.

- [ ] **Step 4: Wait ~5 minutes**

- [ ] **Step 5: Verify the notification arrives with the new copy**

Expected title: "PantryMind está listo ✓" (or device language equivalent).
Expected body: starts with "Las notificaciones funcionan correctamente." or its translation.

- [ ] **Step 6: Tap the notification**

Expected:
- If pantry is empty (skipped seed): opens `/pantry` with the add modal.
- If pantry has items: opens `/pantry` plain, no modal.

---

## Bet B — Recovery Push Window

### Task B1: Recovery constants

**Files:**
- Modify: `src/app/core/constants/notifications/notifications.constants.ts`

- [ ] **Step 1: Extend NOTIFICATION_IDS and add RECOVERY_OFFSETS_DAYS**

Update the file:

```ts
export const NOTIFICATION_IDS = {
  EXPIRED_ITEMS: 100,
  NEAR_EXPIRY: 101,
  LOW_STOCK: 110,
  RE_ENGAGEMENT: 120,
  WELCOME: 130,
  RECOVERY_D2: 140,
  RECOVERY_D5: 141,
  RECOVERY_D10: 142,
} as const;

export const NOTIFICATION_CHANNEL_ID = 'pantry-alerts';
export const NOTIFICATION_CHANNEL_NAME = 'Pantry Alerts';
export const DEFAULT_NOTIFICATION_HOUR = 9;

/** Welcome notification fires this long after a user accepts notifs in onboarding. */
export const WELCOME_DELAY_MS = 5 * 60 * 1000;

/** Recovery push window — silent escalating nudges after onboarding. */
export const RECOVERY_OFFSETS_DAYS = [2, 5, 10] as const;
export const RECOVERY_NOTIFICATION_IDS = [
  NOTIFICATION_IDS.RECOVERY_D2,
  NOTIFICATION_IDS.RECOVERY_D5,
  NOTIFICATION_IDS.RECOVERY_D10,
] as const;

export type RecoverySlot = 'd2' | 'd5' | 'd10';
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/constants/notifications/notifications.constants.ts
git commit -m "feat(notif): reserve RECOVERY_D2/D5/D10 ids + offsets constants"
```

---

### Task B2: RecoveryNotificationsService (TDD)

**Files:**
- Create: `src/app/core/services/notifications/recovery-notifications.service.ts`
- Create: `src/app/core/services/notifications/recovery-notifications.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/notifications/recovery-notifications.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import {
  DEFAULT_NOTIFICATION_HOUR,
  NOTIFICATION_IDS,
  RECOVERY_NOTIFICATION_IDS,
  RECOVERY_OFFSETS_DAYS,
} from '@core/constants';
import { CapacitorNotificationPlugin } from './capacitor-notification.plugin';
import { RecoveryNotificationsService } from './recovery-notifications.service';
import { SettingsPreferencesService } from '../settings/settings-preferences.service';

class FakePlugin {
  scheduled: Array<{ id: number; title: string; body: string; scheduleAt: Date }> = [];
  cancelled: number[][] = [];
  schedule = jasmine.createSpy('schedule').and.callFake(async (notifs: any[]) => {
    this.scheduled.push(...notifs);
  });
  cancel = jasmine.createSpy('cancel').and.callFake(async (ids: number[]) => {
    this.cancelled.push(ids);
  });
}

class FakeTranslate {
  instant(key: string): string { return `[${key}]`; }
}

class FakePrefs {
  preferences = () => ({ notificationHour: DEFAULT_NOTIFICATION_HOUR });
}

describe('RecoveryNotificationsService', () => {
  let service: RecoveryNotificationsService;
  let plugin: FakePlugin;

  beforeEach(() => {
    plugin = new FakePlugin();
    TestBed.configureTestingModule({
      providers: [
        RecoveryNotificationsService,
        { provide: CapacitorNotificationPlugin, useValue: plugin },
        { provide: TranslateService, useClass: FakeTranslate },
        { provide: SettingsPreferencesService, useClass: FakePrefs },
      ],
    });
    service = TestBed.inject(RecoveryNotificationsService);
  });

  it('schedules three notifs at D2 / D5 / D10 with the configured hour', async () => {
    const now = new Date('2026-06-02T08:00:00.000Z');
    jasmine.clock().install();
    jasmine.clock().mockDate(now);

    await service.scheduleRecoveryWindow();

    expect(plugin.scheduled.length).toBe(3);
    const ids = plugin.scheduled.map(n => n.id).sort();
    expect(ids).toEqual([...RECOVERY_NOTIFICATION_IDS].sort());

    plugin.scheduled.forEach(n => {
      expect(n.scheduleAt.getHours()).toBe(DEFAULT_NOTIFICATION_HOUR);
    });

    const dayOffsets = plugin.scheduled
      .map(n => Math.round((n.scheduleAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
      .sort((a, b) => a - b);
    expect(dayOffsets).toEqual([...RECOVERY_OFFSETS_DAYS]);

    jasmine.clock().uninstall();
  });

  it('cancels all three ids on cancelRecoveryWindow', async () => {
    await service.cancelRecoveryWindow();
    expect(plugin.cancel).toHaveBeenCalledWith([...RECOVERY_NOTIFICATION_IDS]);
  });

  it('cancels before re-scheduling to keep slots idempotent', async () => {
    await service.scheduleRecoveryWindow();
    expect(plugin.cancel).toHaveBeenCalledWith([...RECOVERY_NOTIFICATION_IDS]);
    expect(plugin.cancel.calls.count()).toBeGreaterThanOrEqual(1);
  });

  it('fireRecoveryNotification fires a single slot at now + delayMs', async () => {
    const before = Date.now();
    await service.fireRecoveryNotification('d5', { delayMs: 5_000 });
    expect(plugin.scheduled.length).toBe(1);
    const n = plugin.scheduled[0];
    expect(n.id).toBe(NOTIFICATION_IDS.RECOVERY_D5);
    const ts = n.scheduleAt.getTime();
    expect(ts).toBeGreaterThanOrEqual(before + 5_000 - 50);
    expect(ts).toBeLessThanOrEqual(before + 5_000 + 200);
  });
});
```

- [ ] **Step 2: Run the test — fails**

Run: `ng test --watch=false --browsers=ChromeHeadless --include='**/recovery-notifications.service.spec.ts'`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/app/core/services/notifications/recovery-notifications.service.ts`:

```ts
import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  DEFAULT_NOTIFICATION_HOUR,
  NOTIFICATION_IDS,
  RECOVERY_NOTIFICATION_IDS,
  RECOVERY_OFFSETS_DAYS,
  type RecoverySlot,
} from '@core/constants';
import { CapacitorNotificationPlugin } from './capacitor-notification.plugin';
import { SettingsPreferencesService } from '../settings/settings-preferences.service';

const SLOT_ID: Record<RecoverySlot, number> = {
  d2: NOTIFICATION_IDS.RECOVERY_D2,
  d5: NOTIFICATION_IDS.RECOVERY_D5,
  d10: NOTIFICATION_IDS.RECOVERY_D10,
};

const SLOT_KEY: Record<RecoverySlot, { title: string; body: string }> = {
  d2: {
    title: 'notifications.recovery.d2.title',
    body: 'notifications.recovery.d2.body',
  },
  d5: {
    title: 'notifications.recovery.d5.title',
    body: 'notifications.recovery.d5.body',
  },
  d10: {
    title: 'notifications.recovery.d10.title',
    body: 'notifications.recovery.d10.body',
  },
};

@Injectable({ providedIn: 'root' })
export class RecoveryNotificationsService {
  private readonly plugin = inject(CapacitorNotificationPlugin);
  private readonly translate = inject(TranslateService);
  private readonly preferences = inject(SettingsPreferencesService);

  /**
   * Schedule the three-slot recovery window. Cancels any existing slots first
   * so re-running this on a re-installed / re-onboarded user stays idempotent.
   */
  async scheduleRecoveryWindow(): Promise<void> {
    await this.cancelRecoveryWindow();

    const hour = this.preferences.preferences().notificationHour ?? DEFAULT_NOTIFICATION_HOUR;
    const slots: RecoverySlot[] = ['d2', 'd5', 'd10'];

    const payload = slots.map((slot, idx) => {
      const offsetDays = RECOVERY_OFFSETS_DAYS[idx];
      const trigger = new Date();
      trigger.setDate(trigger.getDate() + offsetDays);
      trigger.setHours(hour, 0, 0, 0);
      return {
        id: SLOT_ID[slot],
        title: this.translate.instant(SLOT_KEY[slot].title),
        body: this.translate.instant(SLOT_KEY[slot].body),
        scheduleAt: trigger,
      };
    });

    await this.plugin.schedule(payload);
  }

  /** Cancel all pending recovery slots. Safe to call even when nothing is scheduled. */
  async cancelRecoveryWindow(): Promise<void> {
    await this.plugin.cancel([...RECOVERY_NOTIFICATION_IDS]);
  }

  /**
   * Dev-only: fire a single recovery slot in `delayMs` milliseconds. Does NOT
   * affect the real D2/D5/D10 window — only schedules an extra one-off.
   */
  async fireRecoveryNotification(slot: RecoverySlot, opts?: { delayMs?: number }): Promise<void> {
    const delay = opts?.delayMs ?? 5_000;
    await this.plugin.schedule([
      {
        id: SLOT_ID[slot],
        title: this.translate.instant(SLOT_KEY[slot].title),
        body: this.translate.instant(SLOT_KEY[slot].body),
        scheduleAt: new Date(Date.now() + delay),
      },
    ]);
  }
}
```

- [ ] **Step 4: Run the test — should pass**

Run: `ng test --watch=false --browsers=ChromeHeadless --include='**/recovery-notifications.service.spec.ts'`
Expected: PASS (4 specs).

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/notifications/recovery-notifications.service.ts src/app/core/services/notifications/recovery-notifications.service.spec.ts
git commit -m "feat(notif): RecoveryNotificationsService — D2/D5/D10 schedule + cancel + dev fire"
```

---

### Task B3: i18n keys for recovery (6 langs)

**Files:**
- Modify: `src/assets/i18n/{es,en,de,fr,it,pt}.json`

- [ ] **Step 1: Add recovery block to es.json**

Inside the `notifications` block, add:

```json
"recovery": {
  "d2": {
    "title": "¿Cómo va tu despensa?",
    "body": "Revisa qué tienes en casa. Te ayudamos a no olvidar nada."
  },
  "d5": {
    "title": "Hace 5 días que no nos vemos",
    "body": "Algunos productos podrían estar cerca de caducar. Échales un ojo."
  },
  "d10": {
    "title": "Tu despensa te necesita",
    "body": "Vuelve y evita tirar comida. Tardas 30 segundos en revisarla."
  }
},
```

- [ ] **Step 2: Add equivalents to en.json**

```json
"recovery": {
  "d2": {
    "title": "How's your pantry doing?",
    "body": "Take a quick look at what you have. We'll help you keep track."
  },
  "d5": {
    "title": "It's been 5 days",
    "body": "Some items might be close to expiring. Worth a glance."
  },
  "d10": {
    "title": "Your pantry needs you",
    "body": "Come back and avoid wasting food. 30 seconds is all it takes."
  }
},
```

- [ ] **Step 3: Add equivalents to de.json**

```json
"recovery": {
  "d2": {
    "title": "Wie läuft's mit deiner Vorratskammer?",
    "body": "Schau kurz vorbei. Wir helfen dir, den Überblick zu behalten."
  },
  "d5": {
    "title": "Es sind 5 Tage vergangen",
    "body": "Einige Produkte könnten bald ablaufen. Lohnt sich ein Blick."
  },
  "d10": {
    "title": "Deine Vorratskammer braucht dich",
    "body": "Komm zurück und vermeide Lebensmittelverschwendung. 30 Sekunden reichen."
  }
},
```

- [ ] **Step 4: Add equivalents to fr.json**

```json
"recovery": {
  "d2": {
    "title": "Comment va ton garde-manger ?",
    "body": "Jette un œil à ce que tu as. On t'aide à ne rien oublier."
  },
  "d5": {
    "title": "Ça fait 5 jours qu'on ne s'est pas vu",
    "body": "Certains produits pourraient bientôt expirer. Un coup d'œil s'impose."
  },
  "d10": {
    "title": "Ton garde-manger a besoin de toi",
    "body": "Reviens et évite de jeter de la nourriture. 30 secondes suffisent."
  }
},
```

- [ ] **Step 5: Add equivalents to it.json**

```json
"recovery": {
  "d2": {
    "title": "Come va la tua dispensa?",
    "body": "Dai un'occhiata a quello che hai. Ti aiutiamo a non dimenticare nulla."
  },
  "d5": {
    "title": "Sono passati 5 giorni",
    "body": "Alcuni prodotti potrebbero scadere presto. Dacci un'occhiata."
  },
  "d10": {
    "title": "La tua dispensa ha bisogno di te",
    "body": "Torna ed evita di buttare cibo. Bastano 30 secondi."
  }
},
```

- [ ] **Step 6: Add equivalents to pt.json**

```json
"recovery": {
  "d2": {
    "title": "Como vai a tua despensa?",
    "body": "Vê rapidamente o que tens. Ajudamos-te a não esqueceres nada."
  },
  "d5": {
    "title": "Passaram 5 dias",
    "body": "Alguns produtos podem estar perto de caducar. Vale a pena olhar."
  },
  "d10": {
    "title": "A tua despensa precisa de ti",
    "body": "Volta e evita deitar comida fora. Bastam 30 segundos."
  }
},
```

- [ ] **Step 7: Validate JSON**

Run: `node -e "for (const f of ['es','en','de','fr','it','pt']) JSON.parse(require('fs').readFileSync('src/assets/i18n/'+f+'.json','utf8'));"`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/assets/i18n/*.json
git commit -m "feat(notif): i18n recovery D2/D5/D10 copy (6 langs)"
```

---

### Task B4: Schedule recovery on onboarding completion

**Files:**
- Modify: `src/app/core/services/onboarding/onboarding-state.service.ts`

- [ ] **Step 1: Add the RecoveryNotificationsService import**

Near the existing notification imports, add:

```ts
import { RecoveryNotificationsService } from '../notifications/recovery-notifications.service';
```

Inside the class, after the existing `private readonly welcomeNotif = inject(WelcomeNotificationService);` line, add:

```ts
private readonly recoveryNotif = inject(RecoveryNotificationsService);
```

- [ ] **Step 2: Schedule recovery window on completeOnboarding**

Locate the `completeOnboarding` method. The current shape is:

```ts
async completeOnboarding(): Promise<void> {
  setBooleanFlag(STORAGE_KEYS.ONBOARDING_FLAG, true);
  await this.bulkCreateSeedItems();
  await this.navCtrl.navigateRoot('/dashboard');
}
```

Change it to:

```ts
async completeOnboarding(): Promise<void> {
  setBooleanFlag(STORAGE_KEYS.ONBOARDING_FLAG, true);
  await this.bulkCreateSeedItems();
  // Recovery window only makes sense if we can actually push to the user.
  if (this.notificationsDecision() === 'granted') {
    try {
      await this.recoveryNotif.scheduleRecoveryWindow();
    } catch {
      // never block onboarding completion on a scheduling failure
    }
  }
  await this.navCtrl.navigateRoot('/dashboard');
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/services/onboarding/onboarding-state.service.ts
git commit -m "feat(retention): schedule D2/D5/D10 recovery window on onboarding completion"
```

---

### Task B5: Cancel recovery on app bootstrap and resume

**Files:**
- Modify: `src/app/app.component.ts`

- [ ] **Step 1: Inject RecoveryNotificationsService**

Add import near the other notification import:

```ts
import { RecoveryNotificationsService } from '@core/services/notifications/recovery-notifications.service';
```

Inside the class, after `private readonly notificationScheduler = inject(NotificationSchedulerService);`, add:

```ts
private readonly recoveryNotif = inject(RecoveryNotificationsService);
```

- [ ] **Step 2: Cancel after notification scheduler initial run**

Inside `initializeApp`, locate the line `await this.notificationScheduler.scheduleAll();`. **Immediately after** that line add:

```ts
// User opened the app — recovery nudges are no longer relevant.
void this.recoveryNotif.cancelRecoveryWindow();
```

- [ ] **Step 3: Also cancel on appStateChange (foreground transition)**

Locate the existing `CapacitorApp.addListener('appStateChange', async state => {` block. Inside the callback, after the existing logic that handles `isActive`, add (replace whole if block if you need to):

If the existing block does not already react to `isActive === true`, append the following at the top of the callback body:

```ts
if (state.isActive) {
  void this.recoveryNotif.cancelRecoveryWindow();
}
```

If the existing block already handles `isActive === true`, just add the single `void this.recoveryNotif.cancelRecoveryWindow();` line inside that branch.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/app.component.ts
git commit -m "feat(retention): cancel recovery window on app open and resume"
```

---

### Task B6: Tap handlers for RECOVERY ids

**Files:**
- Modify: `src/app/core/services/notifications/notification-scheduler.service.ts`

- [ ] **Step 1: Add RECOVERY cases to handleNotificationTap**

Inside the `switch (id)` of `handleNotificationTap`, after the existing `case NOTIFICATION_IDS.WELCOME:` block, add (still before the closing `}` of the switch):

```ts
case NOTIFICATION_IDS.RECOVERY_D2:
case NOTIFICATION_IDS.RECOVERY_D5:
case NOTIFICATION_IDS.RECOVERY_D10:
  await this.navCtrl.navigateRoot('/dashboard');
  return;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/services/notifications/notification-scheduler.service.ts
git commit -m "feat(notif): RECOVERY taps route to /dashboard"
```

---

## Bet A — Smart Copy + Deep-Link

### Task A1: Add `extra` field to plugin contract

**Files:**
- Modify: `src/app/core/services/notifications/notification.plugin.ts`
- Modify: `src/app/core/models/notifications/notification.model.ts`

- [ ] **Step 1: Extend the model**

Replace the `ScheduledNotification` interface in `src/app/core/models/notifications/notification.model.ts`:

```ts
export interface ScheduledNotification {
  id: number;
  title: string;
  body: string;
  scheduleAt: string;
  /** Arbitrary payload passed to the OS so the tap handler can read it back. */
  extra?: Record<string, unknown>;
}
```

- [ ] **Step 2: Extend the plugin contract**

Replace `src/app/core/services/notifications/notification.plugin.ts`:

```ts
export type NotificationPermissionDisplay = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';

export interface ScheduledNotificationInput {
  id: number;
  title: string;
  body: string;
  scheduleAt: Date;
  extra?: Record<string, unknown>;
}

export interface PendingNotification {
  id: number;
  title?: string;
  body?: string;
  scheduleAt?: string;
  extra?: Record<string, unknown>;
}

export interface INotificationPlugin {
  requestPermission(): Promise<boolean>;
  checkPermission(): Promise<NotificationPermissionDisplay>;
  schedule(notifications: ScheduledNotificationInput[]): Promise<void>;
  cancel(ids: number[]): Promise<void>;
  createChannel?(options: { id: string; name: string; importance: number }): Promise<void>;
  getPending?(): Promise<PendingNotification[]>;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors (existing call sites use inline shape that matches `ScheduledNotificationInput`).

- [ ] **Step 4: Commit**

```bash
git add src/app/core/services/notifications/notification.plugin.ts src/app/core/models/notifications/notification.model.ts
git commit -m "feat(notif): add optional extra payload to ScheduledNotification + plugin contract"
```

---

### Task A2: Capacitor plugin threads extra + getPending

**Files:**
- Modify: `src/app/core/services/notifications/capacitor-notification.plugin.ts`

- [ ] **Step 1: Replace the plugin implementation**

Replace `src/app/core/services/notifications/capacitor-notification.plugin.ts`:

```ts
import { Injectable } from '@angular/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { NOTIFICATION_CHANNEL_ID } from '@core/constants';
import type {
  INotificationPlugin,
  NotificationPermissionDisplay,
  PendingNotification,
  ScheduledNotificationInput,
} from './notification.plugin';

@Injectable({ providedIn: 'root' })
export class CapacitorNotificationPlugin implements INotificationPlugin {

  async requestPermission(): Promise<boolean> {
    try {
      const result = await LocalNotifications.requestPermissions();
      return result.display === 'granted';
    } catch {
      return false;
    }
  }

  async checkPermission(): Promise<NotificationPermissionDisplay> {
    try {
      const result = await LocalNotifications.checkPermissions();
      return result.display as NotificationPermissionDisplay;
    } catch {
      return 'denied';
    }
  }

  async schedule(notifications: ScheduledNotificationInput[]): Promise<void> {
    if (!notifications.length) return;
    await LocalNotifications.schedule({
      notifications: notifications.map(n => ({
        id: n.id,
        title: n.title,
        body: n.body,
        schedule: { at: n.scheduleAt },
        channelId: NOTIFICATION_CHANNEL_ID,
        extra: n.extra ?? undefined,
      })),
    });
  }

  async cancel(ids: number[]): Promise<void> {
    if (!ids.length) return;
    await LocalNotifications.cancel({
      notifications: ids.map(id => ({ id })),
    });
  }

  async createChannel(options: { id: string; name: string; importance: number }): Promise<void> {
    try {
      await LocalNotifications.createChannel({
        id: options.id,
        name: options.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        importance: options.importance as any,
        visibility: 1,
        sound: 'default',
      });
    } catch {
      // silently ignored on iOS
    }
  }

  async getPending(): Promise<PendingNotification[]> {
    try {
      const result = await LocalNotifications.getPending();
      return (result?.notifications ?? []).map(n => ({
        id: typeof n.id === 'number' ? n.id : Number(n.id),
        title: n.title,
        body: n.body,
        scheduleAt: n.schedule?.at instanceof Date ? n.schedule.at.toISOString() : undefined,
        extra: (n.extra as Record<string, unknown> | undefined) ?? undefined,
      }));
    } catch {
      return [];
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/services/notifications/capacitor-notification.plugin.ts
git commit -m "feat(notif): CapacitorNotificationPlugin threads extra + adds getPending()"
```

---

### Task A3: pickPriorityItem domain helper (TDD)

**Files:**
- Create: `src/app/core/domain/notifications/notification.domain.spec.ts` (extend if exists)
- Modify: `src/app/core/domain/notifications/notification.domain.ts`

- [ ] **Step 1: Write the failing test**

Open or create `src/app/core/domain/notifications/notification.domain.spec.ts` and add:

```ts
import { pickPriorityItem } from './notification.domain';
import type { PantryItem } from '@core/models/pantry';

function makeItem(name: string, expirationDate?: string): PantryItem {
  return {
    _id: `item:${name}`,
    type: 'item',
    householdId: 'household:default',
    name,
    categoryId: '',
    batches: expirationDate
      ? [{ quantity: 1, expirationDate }]
      : [{ quantity: 1 }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('pickPriorityItem', () => {
  const now = new Date('2026-06-02T08:00:00.000Z');

  it('returns the earliest-expiring item for kind=expired', () => {
    const items = [
      makeItem('yogurt', '2026-05-30T00:00:00.000Z'),
      makeItem('milk', '2026-05-15T00:00:00.000Z'),
      makeItem('cheese', '2026-06-01T00:00:00.000Z'),
    ];
    const winner = pickPriorityItem(items, 'expired', now);
    expect(winner?.name).toBe('milk');
  });

  it('returns the earliest-expiring item for kind=near-expiry', () => {
    const items = [
      makeItem('apples', '2026-06-10T00:00:00.000Z'),
      makeItem('bread', '2026-06-04T00:00:00.000Z'),
    ];
    const winner = pickPriorityItem(items, 'near-expiry', now);
    expect(winner?.name).toBe('bread');
  });

  it('returns the alphabetically-first item for kind=low-stock when no expiry signal', () => {
    const items = [makeItem('rice'), makeItem('flour'), makeItem('sugar')];
    const winner = pickPriorityItem(items, 'low-stock', now);
    expect(winner?.name).toBe('flour');
  });

  it('falls back to the first item if everything is undefined', () => {
    const items = [makeItem('only')];
    expect(pickPriorityItem(items, 'expired', now)?.name).toBe('only');
  });

  it('returns null on empty input', () => {
    expect(pickPriorityItem([], 'expired', now)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test — should fail**

Run: `ng test --watch=false --browsers=ChromeHeadless --include='**/notification.domain.spec.ts'`
Expected: FAIL — `pickPriorityItem` not exported.

- [ ] **Step 3: Add the helper to notification.domain.ts**

Append to `src/app/core/domain/notifications/notification.domain.ts`:

```ts
import type { PantryItem } from '@core/models/pantry';

export type NotificationItemKind = 'expired' | 'near-expiry' | 'low-stock';

/**
 * Pick the single most representative item for a notification body.
 * - expired / near-expiry: earliest expiry first; ties break on name lex sort.
 * - low-stock: alphabetical (no expiry signal that's relevant here).
 * Returns null when the list is empty.
 */
export function pickPriorityItem(
  items: PantryItem[],
  kind: NotificationItemKind,
  _now: Date,
): PantryItem | null {
  if (!items.length) return null;
  if (kind === 'low-stock') {
    return [...items].sort((a, b) => a.name.localeCompare(b.name))[0];
  }
  const byEarliestExpiry = [...items].sort((a, b) => {
    const aDate = earliestBatchExpiry(a);
    const bDate = earliestBatchExpiry(b);
    if (aDate === bDate) return a.name.localeCompare(b.name);
    if (aDate === undefined) return 1;
    if (bDate === undefined) return -1;
    return aDate.localeCompare(bDate);
  });
  return byEarliestExpiry[0] ?? items[0];
}

function earliestBatchExpiry(item: PantryItem): string | undefined {
  if (!item.batches?.length) return undefined;
  const dated = item.batches.map(b => b.expirationDate).filter((d): d is string => !!d);
  if (!dated.length) return undefined;
  return dated.sort((a, b) => a.localeCompare(b))[0];
}
```

- [ ] **Step 4: Run the test — should pass**

Run: `ng test --watch=false --browsers=ChromeHeadless --include='**/notification.domain.spec.ts'`
Expected: PASS (5 specs).

- [ ] **Step 5: Commit**

```bash
git add src/app/core/domain/notifications/notification.domain.ts src/app/core/domain/notifications/notification.domain.spec.ts
git commit -m "feat(notif): pickPriorityItem domain helper for smart-copy item selection"
```

---

### Task A4: Smart copy in expired-items definition (TDD)

**Files:**
- Modify: `src/app/core/services/notifications/definitions/expired-items.notification.ts`
- Create: `src/app/core/services/notifications/definitions/expired-items.notification.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/notifications/definitions/expired-items.notification.spec.ts`:

```ts
import { ExpiredItemsNotification } from './expired-items.notification';
import { NOTIFICATION_IDS } from '@core/constants';
import type { NotificationContext } from '@core/models/notifications';
import type { PantryItem } from '@core/models/pantry';

function makeItem(id: string, name: string, expirationDate: string): PantryItem {
  return {
    _id: id,
    type: 'item',
    householdId: 'household:default',
    name,
    categoryId: '',
    batches: [{ quantity: 1, expirationDate }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeCtx(items: PantryItem[]): NotificationContext {
  return {
    items,
    preferences: {
      theme: 'system',
      nearExpiryDays: 15,
      compactView: false,
      notificationsEnabled: true,
      notifyOnExpired: true,
      locationOptions: [],
      categoryOptions: [],
      supermarketOptions: [],
    },
    t: (key, params) => `[${key}|${JSON.stringify(params ?? {})}]`,
    now: new Date('2026-06-02T08:00:00.000Z'),
  };
}

describe('ExpiredItemsNotification — smart copy', () => {
  const def = new ExpiredItemsNotification();

  it('returns null when nothing expired', () => {
    expect(def.build(makeCtx([]))).toBeNull();
  });

  it('embeds extra.itemId of the priority winner', () => {
    const items = [
      makeItem('item:a', 'yogurt', '2026-05-30T00:00:00.000Z'),
      makeItem('item:b', 'milk',   '2026-05-15T00:00:00.000Z'),
    ];
    const out = def.build(makeCtx(items))!;
    expect(out.id).toBe(NOTIFICATION_IDS.EXPIRED_ITEMS);
    expect(out.extra).toEqual({ itemId: 'item:b' });
  });

  it('uses _one_named copy for single expired item', () => {
    const items = [makeItem('item:b', 'milk', '2026-05-15T00:00:00.000Z')];
    const out = def.build(makeCtx(items))!;
    expect(out.body).toContain('notifications.expired.body_one_named');
    expect(out.body).toContain('"name":"milk"');
  });

  it('uses _many_named copy with others=N-1 for multiple', () => {
    const items = [
      makeItem('item:a', 'yogurt', '2026-05-30T00:00:00.000Z'),
      makeItem('item:b', 'milk',   '2026-05-15T00:00:00.000Z'),
      makeItem('item:c', 'cheese', '2026-06-01T00:00:00.000Z'),
    ];
    const out = def.build(makeCtx(items))!;
    expect(out.body).toContain('notifications.expired.body_many_named');
    expect(out.body).toContain('"name":"milk"');
    expect(out.body).toContain('"others":2');
  });
});
```

- [ ] **Step 2: Run the test — fails**

Run: `ng test --watch=false --browsers=ChromeHeadless --include='**/expired-items.notification.spec.ts'`
Expected: FAIL — current implementation does not set `extra` or use `_named` keys.

- [ ] **Step 3: Update the implementation**

Replace `src/app/core/services/notifications/definitions/expired-items.notification.ts`:

```ts
import { NOTIFICATION_IDS } from '@core/constants';
import { buildNextTriggerDate, filterExpiredItems, pickPriorityItem } from '@core/domain/notifications';
import type { NotificationContext, NotificationDefinition, ScheduledNotification } from '@core/models/notifications';
import type { AppPreferences } from '@core/models/settings';

export class ExpiredItemsNotification implements NotificationDefinition {
  readonly id = NOTIFICATION_IDS.EXPIRED_ITEMS;
  readonly priority = 100;

  isEnabled(preferences: AppPreferences): boolean {
    return Boolean(preferences.notificationsEnabled && preferences.notifyOnExpired);
  }

  build(context: NotificationContext): ScheduledNotification | null {
    const { items, preferences, t, now } = context;
    const expired = filterExpiredItems(items, now);
    if (!expired.length) return null;

    const winner = pickPriorityItem(expired, 'expired', now);
    if (!winner) return null;

    const hour = preferences.notificationHour ?? 9;
    const count = expired.length;
    const titleKey = count === 1 ? 'notifications.expired.title_one' : 'notifications.expired.title';
    const bodyKey = count === 1
      ? 'notifications.expired.body_one_named'
      : 'notifications.expired.body_many_named';
    const others = Math.max(count - 1, 0);
    return {
      id: this.id,
      title: t(titleKey),
      body: t(bodyKey, { name: winner.name, others }),
      scheduleAt: buildNextTriggerDate(now, hour).toISOString(),
      extra: { itemId: winner._id },
    };
  }
}
```

- [ ] **Step 4: Run the test — should pass**

Run: `ng test --watch=false --browsers=ChromeHeadless --include='**/expired-items.notification.spec.ts'`
Expected: PASS (4 specs).

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/notifications/definitions/expired-items.notification.ts src/app/core/services/notifications/definitions/expired-items.notification.spec.ts
git commit -m "feat(notif): smart copy + extra.itemId for expired-items definition"
```

---

### Task A5: Smart copy in near-expiry definition

**Files:**
- Modify: `src/app/core/services/notifications/definitions/near-expiry.notification.ts`
- Create: `src/app/core/services/notifications/definitions/near-expiry.notification.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/notifications/definitions/near-expiry.notification.spec.ts`:

```ts
import { NearExpiryNotification } from './near-expiry.notification';
import { NOTIFICATION_IDS } from '@core/constants';
import type { NotificationContext } from '@core/models/notifications';
import type { PantryItem } from '@core/models/pantry';

function makeItem(id: string, name: string, expirationDate: string): PantryItem {
  return {
    _id: id,
    type: 'item',
    householdId: 'household:default',
    name,
    categoryId: '',
    batches: [{ quantity: 1, expirationDate }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeCtx(items: PantryItem[], now: Date): NotificationContext {
  return {
    items,
    preferences: {
      theme: 'system',
      nearExpiryDays: 15,
      compactView: false,
      notificationsEnabled: true,
      notifyOnNearExpiry: true,
      locationOptions: [],
      categoryOptions: [],
      supermarketOptions: [],
    },
    t: (key, params) => `[${key}|${JSON.stringify(params ?? {})}]`,
    now,
  };
}

describe('NearExpiryNotification — smart copy', () => {
  const def = new NearExpiryNotification();

  it('uses _one_named_tomorrow copy when nearestDays=1', () => {
    const now = new Date('2026-06-02T08:00:00.000Z');
    const tomorrow = '2026-06-03T08:00:00.000Z';
    const out = def.build(makeCtx([makeItem('item:y', 'yogurt', tomorrow)], now))!;
    expect(out.extra).toEqual({ itemId: 'item:y' });
    expect(out.body).toContain('notifications.nearExpiry.body_one_named_tomorrow');
    expect(out.body).toContain('"name":"yogurt"');
  });

  it('uses _one_named copy when nearestDays>1', () => {
    const now = new Date('2026-06-02T08:00:00.000Z');
    const inFive = '2026-06-07T08:00:00.000Z';
    const out = def.build(makeCtx([makeItem('item:b', 'bread', inFive)], now))!;
    expect(out.body).toContain('notifications.nearExpiry.body_one_named');
    expect(out.body).toContain('"days":5');
  });

  it('uses _many_named copy with others=N-1 when count>1', () => {
    const now = new Date('2026-06-02T08:00:00.000Z');
    const items = [
      makeItem('item:a', 'apple', '2026-06-10T00:00:00.000Z'),
      makeItem('item:b', 'bread', '2026-06-04T00:00:00.000Z'),
    ];
    const out = def.build(makeCtx(items, now))!;
    expect(out.body).toContain('notifications.nearExpiry.body_many_named');
    expect(out.body).toContain('"name":"bread"');
    expect(out.body).toContain('"others":1');
    expect(out.id).toBe(NOTIFICATION_IDS.NEAR_EXPIRY);
  });
});
```

- [ ] **Step 2: Run the test — fails**

Run: `ng test --watch=false --browsers=ChromeHeadless --include='**/near-expiry.notification.spec.ts'`
Expected: FAIL.

- [ ] **Step 3: Update the implementation**

Replace `src/app/core/services/notifications/definitions/near-expiry.notification.ts`:

```ts
import { NEAR_EXPIRY_WINDOW_DAYS, NOTIFICATION_IDS } from '@core/constants';
import {
  buildNextTriggerDate,
  filterNearExpiryItems,
  nearestExpiryDays,
  pickPriorityItem,
} from '@core/domain/notifications';
import type { NotificationContext, NotificationDefinition, ScheduledNotification } from '@core/models/notifications';
import type { AppPreferences } from '@core/models/settings';

export class NearExpiryNotification implements NotificationDefinition {
  readonly id = NOTIFICATION_IDS.NEAR_EXPIRY;
  readonly priority = 60;

  isEnabled(preferences: AppPreferences): boolean {
    return Boolean(preferences.notificationsEnabled && preferences.notifyOnNearExpiry);
  }

  build(context: NotificationContext): ScheduledNotification | null {
    const { items, preferences, t, now } = context;
    const nearExpiry = filterNearExpiryItems(items, now, NEAR_EXPIRY_WINDOW_DAYS);
    if (!nearExpiry.length) return null;

    const winner = pickPriorityItem(nearExpiry, 'near-expiry', now);
    if (!winner) return null;

    const hour = preferences.notificationHour ?? 9;
    const count = nearExpiry.length;
    const nearestDays = nearestExpiryDays(nearExpiry, now);

    const titleKey = count === 1 ? 'notifications.nearExpiry.title_one' : 'notifications.nearExpiry.title';
    let bodyKey: string;
    if (count === 1) {
      bodyKey = nearestDays === 1
        ? 'notifications.nearExpiry.body_one_named_tomorrow'
        : 'notifications.nearExpiry.body_one_named';
    } else {
      bodyKey = nearestDays === 1
        ? 'notifications.nearExpiry.body_many_named_tomorrow'
        : 'notifications.nearExpiry.body_many_named';
    }
    const others = Math.max(count - 1, 0);
    return {
      id: this.id,
      title: t(titleKey, { count }),
      body: t(bodyKey, { name: winner.name, days: nearestDays, others }),
      scheduleAt: buildNextTriggerDate(now, hour).toISOString(),
      extra: { itemId: winner._id },
    };
  }
}
```

- [ ] **Step 4: Run the test — should pass**

Run: `ng test --watch=false --browsers=ChromeHeadless --include='**/near-expiry.notification.spec.ts'`
Expected: PASS (3 specs).

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/notifications/definitions/near-expiry.notification.ts src/app/core/services/notifications/definitions/near-expiry.notification.spec.ts
git commit -m "feat(notif): smart copy + extra.itemId for near-expiry definition"
```

---

### Task A6: Smart copy in low-stock definition

**Files:**
- Modify: `src/app/core/services/notifications/definitions/low-stock.notification.ts`
- Create: `src/app/core/services/notifications/definitions/low-stock.notification.spec.ts`

- [ ] **Step 1: Inspect current implementation**

Run: `cat src/app/core/services/notifications/definitions/low-stock.notification.ts`

Expected: a definition that calls `filterLowStockItems` and returns generic copy.

- [ ] **Step 2: Write the failing test**

Create `src/app/core/services/notifications/definitions/low-stock.notification.spec.ts`:

```ts
import { LowStockNotification } from './low-stock.notification';
import { NOTIFICATION_IDS } from '@core/constants';
import type { NotificationContext } from '@core/models/notifications';
import type { PantryItem } from '@core/models/pantry';

function makeBasic(id: string, name: string, qty: number, min = 1): PantryItem {
  return {
    _id: id,
    type: 'item',
    householdId: 'household:default',
    name,
    categoryId: '',
    isBasic: true,
    minThreshold: min,
    batches: [{ quantity: qty }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeCtx(items: PantryItem[]): NotificationContext {
  return {
    items,
    preferences: {
      theme: 'system',
      nearExpiryDays: 15,
      compactView: false,
      notificationsEnabled: true,
      notifyOnLowStock: true,
      locationOptions: [],
      categoryOptions: [],
      supermarketOptions: [],
    },
    t: (key, params) => `[${key}|${JSON.stringify(params ?? {})}]`,
    now: new Date('2026-06-02T08:00:00.000Z'),
  };
}

describe('LowStockNotification — smart copy', () => {
  const def = new LowStockNotification();

  it('uses _one_named for single below-threshold basic', () => {
    const out = def.build(makeCtx([makeBasic('item:r', 'rice', 0)]))!;
    expect(out.id).toBe(NOTIFICATION_IDS.LOW_STOCK);
    expect(out.extra).toEqual({ itemId: 'item:r' });
    expect(out.body).toContain('notifications.lowStock.body_one_named');
    expect(out.body).toContain('"name":"rice"');
  });

  it('uses _many_named with others=N-1 for multiple', () => {
    const items = [
      makeBasic('item:s', 'sugar', 0),
      makeBasic('item:f', 'flour', 0),
      makeBasic('item:r', 'rice', 0),
    ];
    const out = def.build(makeCtx(items))!;
    expect(out.body).toContain('notifications.lowStock.body_many_named');
    expect(out.body).toContain('"name":"flour"');
    expect(out.body).toContain('"others":2');
  });
});
```

- [ ] **Step 3: Run the test — fails**

Run: `ng test --watch=false --browsers=ChromeHeadless --include='**/low-stock.notification.spec.ts'`
Expected: FAIL.

- [ ] **Step 4: Update the implementation**

Replace `src/app/core/services/notifications/definitions/low-stock.notification.ts` (preserve any priority constant the original used; keep filter call the same):

```ts
import { NOTIFICATION_IDS } from '@core/constants';
import {
  buildNextTriggerDate,
  filterLowStockItems,
  pickPriorityItem,
} from '@core/domain/notifications';
import type { NotificationContext, NotificationDefinition, ScheduledNotification } from '@core/models/notifications';
import type { AppPreferences } from '@core/models/settings';

export class LowStockNotification implements NotificationDefinition {
  readonly id = NOTIFICATION_IDS.LOW_STOCK;
  readonly priority = 30;

  isEnabled(preferences: AppPreferences): boolean {
    return Boolean(preferences.notificationsEnabled && preferences.notifyOnLowStock);
  }

  build(context: NotificationContext): ScheduledNotification | null {
    const { items, preferences, t, now } = context;
    const lowStock = filterLowStockItems(items);
    if (!lowStock.length) return null;

    const winner = pickPriorityItem(lowStock, 'low-stock', now);
    if (!winner) return null;

    const hour = preferences.notificationHour ?? 9;
    const count = lowStock.length;
    const titleKey = count === 1 ? 'notifications.lowStock.title_one' : 'notifications.lowStock.title';
    const bodyKey = count === 1
      ? 'notifications.lowStock.body_one_named'
      : 'notifications.lowStock.body_many_named';
    const others = Math.max(count - 1, 0);
    return {
      id: this.id,
      title: t(titleKey, { count }),
      body: t(bodyKey, { name: winner.name, others }),
      scheduleAt: buildNextTriggerDate(now, hour).toISOString(),
      extra: { itemId: winner._id },
    };
  }
}
```

> If the original `low-stock.notification.ts` uses a different `filterLowStockItems` signature (e.g. takes preferences), keep the original signature — the goal is smart copy + extra, not refactoring the filter.

- [ ] **Step 5: Run the test — should pass**

Run: `ng test --watch=false --browsers=ChromeHeadless --include='**/low-stock.notification.spec.ts'`
Expected: PASS (2 specs).

- [ ] **Step 6: Commit**

```bash
git add src/app/core/services/notifications/definitions/low-stock.notification.ts src/app/core/services/notifications/definitions/low-stock.notification.spec.ts
git commit -m "feat(notif): smart copy + extra.itemId for low-stock definition"
```

---

### Task A7: i18n _named copy variants

**Files:**
- Modify: `src/assets/i18n/{es,en,de,fr,it,pt}.json`

- [ ] **Step 1: Add to es.json under `notifications`**

Find the `notifications.expired`, `notifications.nearExpiry`, and `notifications.lowStock` blocks. **Add (do not replace existing keys)** the following keys inside each:

```json
"expired": {
  "...existing keys stay as-is...": "...",
  "body_one_named": "Tu {{name}} ya caducó. Decide si conservarlo o tirarlo.",
  "body_many_named": "Tu {{name}} y {{others}} más han caducado."
},
"nearExpiry": {
  "...existing keys stay as-is...": "...",
  "body_one_named": "Tu {{name}} caduca en {{days}} días.",
  "body_one_named_tomorrow": "Tu {{name}} caduca mañana. Consúmelo hoy.",
  "body_many_named": "Tu {{name}} y {{others}} más caducan pronto.",
  "body_many_named_tomorrow": "Tu {{name}} caduca mañana y {{others}} más están cerca."
},
"lowStock": {
  "...existing keys stay as-is...": "...",
  "body_one_named": "Te queda poco {{name}}. Añádelo a la lista.",
  "body_many_named": "Poco stock de {{name}} y {{others}} más."
}
```

- [ ] **Step 2: Mirror to en.json**

```json
"expired": {
  "body_one_named": "Your {{name}} has expired. Decide whether to keep or toss.",
  "body_many_named": "Your {{name}} and {{others}} more have expired."
},
"nearExpiry": {
  "body_one_named": "Your {{name}} expires in {{days}} days.",
  "body_one_named_tomorrow": "Your {{name}} expires tomorrow. Use it today.",
  "body_many_named": "Your {{name}} and {{others}} more expire soon.",
  "body_many_named_tomorrow": "Your {{name}} expires tomorrow and {{others}} more are close."
},
"lowStock": {
  "body_one_named": "Low on {{name}}. Add it to your list.",
  "body_many_named": "Low stock: {{name}} and {{others}} more."
}
```

- [ ] **Step 3: Mirror to de.json**

```json
"expired": {
  "body_one_named": "Dein {{name}} ist abgelaufen. Aufbewahren oder wegwerfen?",
  "body_many_named": "Dein {{name}} und {{others}} weitere sind abgelaufen."
},
"nearExpiry": {
  "body_one_named": "Dein {{name}} läuft in {{days}} Tagen ab.",
  "body_one_named_tomorrow": "Dein {{name}} läuft morgen ab. Heute aufbrauchen.",
  "body_many_named": "Dein {{name}} und {{others}} weitere laufen bald ab.",
  "body_many_named_tomorrow": "Dein {{name}} läuft morgen ab und {{others}} weitere sind kurz davor."
},
"lowStock": {
  "body_one_named": "Wenig {{name}} übrig. Setz es auf die Liste.",
  "body_many_named": "Wenig Vorrat: {{name}} und {{others}} weitere."
}
```

- [ ] **Step 4: Mirror to fr.json**

```json
"expired": {
  "body_one_named": "Ton {{name}} a expiré. Garder ou jeter ?",
  "body_many_named": "Ton {{name}} et {{others}} autres ont expiré."
},
"nearExpiry": {
  "body_one_named": "Ton {{name}} expire dans {{days}} jours.",
  "body_one_named_tomorrow": "Ton {{name}} expire demain. Consomme-le aujourd'hui.",
  "body_many_named": "Ton {{name}} et {{others}} autres expirent bientôt.",
  "body_many_named_tomorrow": "Ton {{name}} expire demain et {{others}} autres sont proches."
},
"lowStock": {
  "body_one_named": "Il reste peu de {{name}}. Ajoute-le à la liste.",
  "body_many_named": "Stock bas : {{name}} et {{others}} autres."
}
```

- [ ] **Step 5: Mirror to it.json**

```json
"expired": {
  "body_one_named": "Il tuo {{name}} è scaduto. Tenere o buttare?",
  "body_many_named": "Il tuo {{name}} e altri {{others}} sono scaduti."
},
"nearExpiry": {
  "body_one_named": "Il tuo {{name}} scade tra {{days}} giorni.",
  "body_one_named_tomorrow": "Il tuo {{name}} scade domani. Consumalo oggi.",
  "body_many_named": "Il tuo {{name}} e altri {{others}} scadono presto.",
  "body_many_named_tomorrow": "Il tuo {{name}} scade domani e altri {{others}} sono vicini."
},
"lowStock": {
  "body_one_named": "Poco {{name}} rimasto. Aggiungilo alla lista.",
  "body_many_named": "Scorta bassa: {{name}} e altri {{others}}."
}
```

- [ ] **Step 6: Mirror to pt.json**

```json
"expired": {
  "body_one_named": "O teu {{name}} já caducou. Guarda ou deita fora?",
  "body_many_named": "O teu {{name}} e mais {{others}} caducaram."
},
"nearExpiry": {
  "body_one_named": "O teu {{name}} caduca em {{days}} dias.",
  "body_one_named_tomorrow": "O teu {{name}} caduca amanhã. Usa-o hoje.",
  "body_many_named": "O teu {{name}} e mais {{others}} caducam em breve.",
  "body_many_named_tomorrow": "O teu {{name}} caduca amanhã e mais {{others}} estão perto."
},
"lowStock": {
  "body_one_named": "Pouco {{name}} restante. Adiciona-o à lista.",
  "body_many_named": "Stock baixo: {{name}} e mais {{others}}."
}
```

- [ ] **Step 7: Validate JSON**

Run: `node -e "for (const f of ['es','en','de','fr','it','pt']) JSON.parse(require('fs').readFileSync('src/assets/i18n/'+f+'.json','utf8'));"`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/assets/i18n/*.json
git commit -m "feat(notif): i18n _named copy variants for expired/near-expiry/low-stock (6 langs)"
```

---

### Task A8: handleNotificationTap reads `extra.itemId` + tap listener wiring

**Files:**
- Modify: `src/app/core/services/notifications/notification-scheduler.service.ts`

- [ ] **Step 1: Update the tap listener registration to forward extra**

Locate the constructor block that registers the listener:

```ts
if (Capacitor.isNativePlatform()) {
  void LocalNotifications.addListener('localNotificationActionPerformed', action => {
    void this.handleNotificationTap(action.notification.id);
  });
}
```

Replace with:

```ts
if (Capacitor.isNativePlatform()) {
  void LocalNotifications.addListener('localNotificationActionPerformed', action => {
    const extra = (action.notification.extra as Record<string, unknown> | undefined) ?? undefined;
    void this.handleNotificationTap(action.notification.id, extra);
  });
}
```

- [ ] **Step 2: Update the handleNotificationTap signature and add the itemId branch**

Find the `private async handleNotificationTap(id: number): Promise<void> {` line. Update to:

```ts
private async handleNotificationTap(id: number, extra?: Record<string, unknown>): Promise<void> {
  // Per-item deep-link path (bet A). Items may have been deleted between
  // schedule and tap, so we fall back to plain pantry if the id is unknown.
  const itemId = typeof extra?.['itemId'] === 'string' ? (extra['itemId'] as string) : undefined;
  if (itemId) {
    const exists = this.pantryStore.loadedProducts().some(p => p._id === itemId);
    if (exists) {
      await this.navCtrl.navigateRoot('/pantry', { queryParams: { focusItem: itemId } });
      return;
    }
    // fall through to id-based routing if the item is gone
  }
  switch (id) {
    // ...existing cases stay unchanged...
  }
}
```

Keep all the existing `case NOTIFICATION_IDS.*` branches inside the switch. The only changes are: new parameter, new pre-switch block, no other deletions.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/services/notifications/notification-scheduler.service.ts
git commit -m "feat(notif): tap handler reads extra.itemId and deep-links via focusItem queryParam"
```

---

### Task A9: PantryComponent reads `?focusItem` queryParam

**Files:**
- Modify: `src/app/features/pantry/pantry.component.ts`

- [ ] **Step 1: Inspect current ionViewWillEnter and openAddModal handling**

Run: `sed -n '1,80p' src/app/features/pantry/pantry.component.ts`

The existing pattern consumes `?openAddModal=true` then clears the param via `router.navigate`. Follow the same pattern for `focusItem`.

- [ ] **Step 2: Add focusItem consumption**

In `pantry.component.ts`, inside `ionViewWillEnter()` (or wherever `openAddModal` is consumed), **after** the `openAddModal` block, add:

```ts
const focusItemId = this.route.snapshot.queryParams['focusItem'];
if (focusItemId) {
  this.facade.focusItemById(focusItemId);
  void this.router.navigate([], {
    relativeTo: this.route,
    queryParams: { focusItem: null },
    queryParamsHandling: 'merge',
  });
}
```

- [ ] **Step 3: Add the facade method**

Open `src/app/core/services/pantry/pantry-state.service.ts`. Locate `openEditModalFromSheet` (around line 402). **Immediately after** that method, add:

```ts
/**
 * Open the edit modal for the item with the given id, if it still exists in
 * the loaded products list. Called by deep-link entry from a tapped
 * notification carrying extra.itemId. Fresh items route to the fresh-edit
 * modal; everything else to the despensa edit modal, matching the existing
 * openEditModalFromSheet branch.
 */
focusItemById(itemId: string): void {
  const item = this.pantryItemsState().find(p => p._id === itemId);
  if (!item) return;
  if (item.productType === 'fresh') {
    this.editFreshItemModalRequest.set({ mode: 'edit', item });
    return;
  }
  this.editItemModalRequest.set({ mode: 'edit', item });
}
```

The signals `editItemModalRequest` and `editFreshItemModalRequest` already exist on `PantryStateService`; no new state is introduced.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/pantry/pantry.component.ts src/app/core/services/pantry/pantry-state.service.ts
git commit -m "feat(pantry): consume ?focusItem queryParam — deep-link entry for notif taps"
```

---

### Task A10: Manual QA for bet A

- [ ] **Step 1: Build and install**

```bash
npm run prepare:build
npx cap run android
```

- [ ] **Step 2: Seed a near-expiry item**

In the app, add an item with an expiry date 2 days from today.

- [ ] **Step 3: Force-fire the near-expiry notification (via dev panel after D ships, OR via debug shell)**

Until bet D ships, use existing `scheduleTestNotification()` exposed via Settings → Advanced if available, or temporarily call the scheduler from a button. Otherwise, set system time forward in Android settings and re-open the app.

- [ ] **Step 4: Verify notification body contains the item name**

Expected: body matches the `body_one_named` template with the item's actual name interpolated.

- [ ] **Step 5: Tap the notification**

Expected: app opens directly to that item's detail/edit view in pantry. The query param self-cleans on first read (no re-trigger on back nav).

- [ ] **Step 6: Delete the item, force-fire again, tap**

Expected: app falls back to `/pantry` plain — no crash, no error toast.

---

## Bet D — Developer Notifications Panel

### Task D1: `fireDefinitionInFiveSeconds` on the scheduler (TDD)

**Files:**
- Modify: `src/app/core/services/notifications/notification-scheduler.service.ts`
- Create: `src/app/core/services/notifications/notification-scheduler.service.spec.ts` (if absent — append otherwise)

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/notifications/notification-scheduler.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { NavController } from '@ionic/angular';
import { NOTIFICATION_IDS } from '@core/constants';
import type { NotificationDefinition, ScheduledNotification } from '@core/models/notifications';
import { CapacitorNotificationPlugin } from './capacitor-notification.plugin';
import { NotificationPermissionService } from './notification-permission.service';
import { NotificationRegistryService } from './notification-registry.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { SettingsPreferencesService } from '../settings/settings-preferences.service';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { PantryNavigationPresetService } from '../pantry/pantry-navigation-preset.service';
import { signal } from '@angular/core';

class FakePlugin {
  scheduled: any[] = [];
  schedule = jasmine.createSpy('schedule').and.callFake(async (n: any[]) => { this.scheduled.push(...n); });
  cancel = jasmine.createSpy('cancel').and.resolveTo(undefined);
}

class FakeRegistry {
  defs: NotificationDefinition[] = [];
  getAll() { return this.defs; }
  getById(id: number) { return this.defs.find(d => d.id === id); }
}

class FakePermission {
  init = jasmine.createSpy('init').and.resolveTo();
  request = jasmine.createSpy('request').and.resolveTo(true);
  isGranted = () => true;
  isPermanentlyDenied = () => false;
  wasRequested = true;
  permissionState = signal('granted');
}

class FakePrefs {
  preferences = () => ({
    theme: 'system' as const,
    nearExpiryDays: 15,
    compactView: false,
    notificationsEnabled: true,
    notifyOnExpired: true,
    notifyOnNearExpiry: true,
    notifyOnLowStock: true,
    notificationHour: 9,
    locationOptions: [],
    categoryOptions: [],
    supermarketOptions: [],
  });
  savePreferences = jasmine.createSpy('savePreferences').and.resolveTo();
}

class FakeStore { loadedProducts = signal([]); }
class FakeNav { setPending = () => undefined; }
class FakeNavCtrl { navigateRoot = jasmine.createSpy('navigateRoot').and.resolveTo(); }
class FakeTranslate { instant(k: string) { return k; } }

describe('NotificationSchedulerService — fireDefinitionInFiveSeconds', () => {
  let svc: NotificationSchedulerService;
  let plugin: FakePlugin;
  let registry: FakeRegistry;

  beforeEach(() => {
    plugin = new FakePlugin();
    registry = new FakeRegistry();
    registry.defs = [
      {
        id: NOTIFICATION_IDS.EXPIRED_ITEMS,
        priority: 100,
        isEnabled: () => true,
        build: (_ctx): ScheduledNotification => ({
          id: NOTIFICATION_IDS.EXPIRED_ITEMS,
          title: 'X title',
          body: 'X body',
          scheduleAt: new Date().toISOString(),
        }),
      },
    ];
    TestBed.configureTestingModule({
      providers: [
        NotificationSchedulerService,
        { provide: CapacitorNotificationPlugin, useValue: plugin },
        { provide: NotificationRegistryService, useValue: registry },
        { provide: NotificationPermissionService, useClass: FakePermission },
        { provide: SettingsPreferencesService, useClass: FakePrefs },
        { provide: PantryStoreService, useClass: FakeStore },
        { provide: PantryNavigationPresetService, useClass: FakeNav },
        { provide: NavController, useClass: FakeNavCtrl },
        { provide: TranslateService, useClass: FakeTranslate },
      ],
    });
    svc = TestBed.inject(NotificationSchedulerService);
  });

  it('builds the given definition and schedules in ~5s', async () => {
    const ok = await svc.fireDefinitionInFiveSeconds(NOTIFICATION_IDS.EXPIRED_ITEMS);
    expect(ok).toBeTrue();
    expect(plugin.scheduled.length).toBe(1);
    expect(plugin.scheduled[0].id).toBe(NOTIFICATION_IDS.EXPIRED_ITEMS);
    const delta = plugin.scheduled[0].scheduleAt.getTime() - Date.now();
    expect(delta).toBeGreaterThan(4_500);
    expect(delta).toBeLessThan(6_000);
  });

  it('returns false if the definition is not registered', async () => {
    const ok = await svc.fireDefinitionInFiveSeconds(999_999);
    expect(ok).toBeFalse();
    expect(plugin.scheduled.length).toBe(0);
  });

  it('returns false if the definition has nothing to fire (build returns null)', async () => {
    registry.defs[0] = { ...registry.defs[0], build: () => null };
    const ok = await svc.fireDefinitionInFiveSeconds(NOTIFICATION_IDS.EXPIRED_ITEMS);
    expect(ok).toBeFalse();
  });
});
```

- [ ] **Step 2: Add `getById` to NotificationRegistryService (if absent)**

Run: `grep -n "getById\|getAll" src/app/core/services/notifications/notification-registry.service.ts`

If `getById` is missing, add it. Edit `src/app/core/services/notifications/notification-registry.service.ts` and inside the class add (near `getAll`):

```ts
getById(id: number): NotificationDefinition | undefined {
  return this.getAll().find(d => d.id === id);
}
```

- [ ] **Step 3: Add the scheduler method**

In `src/app/core/services/notifications/notification-scheduler.service.ts`, append a new public method (near the existing dev-only `scheduleTestNotification`):

```ts
/**
 * Dev-only: build a single specific definition (regardless of priority) and
 * fire it in ~5 seconds. Returns false if the definition is not registered,
 * or if its build() returns null (no items to notify about).
 */
async fireDefinitionInFiveSeconds(definitionId: number): Promise<boolean> {
  const def = this.registry.getById(definitionId);
  if (!def) return false;

  await this.permission.init();
  if (!this.permission.isGranted()) {
    const granted = await this.permission.request();
    if (!granted) return false;
  }

  const preferences = this.preferencesService.preferences();
  const items = this.pantryStore.loadedProducts();
  const now = new Date();
  const t = (key: string, params?: Record<string, unknown>): string =>
    this.translate.instant(key, params);

  const payload = def.build({ items, preferences, t, now });
  if (!payload) return false;

  await this.plugin.schedule([{
    id: payload.id,
    title: payload.title,
    body: payload.body,
    scheduleAt: new Date(Date.now() + 5_000),
    extra: payload.extra,
  }]);

  return true;
}
```

- [ ] **Step 4: Run the test — should pass**

Run: `ng test --watch=false --browsers=ChromeHeadless --include='**/notification-scheduler.service.spec.ts'`
Expected: PASS (3 specs).

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/notifications/notification-scheduler.service.ts src/app/core/services/notifications/notification-scheduler.service.spec.ts src/app/core/services/notifications/notification-registry.service.ts
git commit -m "feat(notif): fireDefinitionInFiveSeconds — dev hook to force-fire any registered def"
```

---

### Task D2: SettingsNotificationsDevStateService (facade)

**Files:**
- Create: `src/app/core/services/settings/settings-notifications-dev-state.service.ts`

- [ ] **Step 1: Create the facade**

Create `src/app/core/services/settings/settings-notifications-dev-state.service.ts`:

```ts
import { Injectable, computed, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { NOTIFICATION_IDS } from '@core/constants';
import type { PendingNotification } from '@core/services/notifications/notification.plugin';
import { CapacitorNotificationPlugin } from '@core/services/notifications/capacitor-notification.plugin';
import { NotificationPermissionService } from '@core/services/notifications/notification-permission.service';
import { NotificationRegistryService } from '@core/services/notifications/notification-registry.service';
import { NotificationSchedulerService } from '@core/services/notifications/notification-scheduler.service';
import { RecoveryNotificationsService } from '@core/services/notifications/recovery-notifications.service';
import { WelcomeNotificationService } from '@core/services/notifications/welcome-notification.service';
import { SettingsPreferencesService } from './settings-preferences.service';
import { ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import type { RecoverySlot } from '@core/constants';

@Injectable()
export class SettingsNotificationsDevStateService {
  private readonly scheduler = inject(NotificationSchedulerService);
  private readonly registry = inject(NotificationRegistryService);
  private readonly permission = inject(NotificationPermissionService);
  private readonly plugin = inject(CapacitorNotificationPlugin);
  private readonly preferencesService = inject(SettingsPreferencesService);
  private readonly welcomeNotif = inject(WelcomeNotificationService);
  private readonly recoveryNotif = inject(RecoveryNotificationsService);
  private readonly toastCtrl = inject(ToastController);
  private readonly translate = inject(TranslateService);

  readonly isNativePlatform = Capacitor.isNativePlatform();
  readonly pending = signal<PendingNotification[]>([]);
  readonly permissionState = computed(() => this.permission.permissionState());
  readonly notificationsEnabled = computed(() =>
    Boolean(this.preferencesService.preferences().notificationsEnabled),
  );

  readonly registeredDefinitions = computed(() =>
    this.registry.getAll().map(d => ({ id: d.id, priority: d.priority })),
  );

  async refreshPending(): Promise<void> {
    if (!this.isNativePlatform) {
      this.pending.set([]);
      return;
    }
    const list = await this.plugin.getPending?.() ?? [];
    this.pending.set(list);
  }

  async previewNext(): Promise<{ title: string; body: string } | null> {
    return await this.scheduler.previewNextNotification();
  }

  async fireWinning(): Promise<void> {
    const ok = await this.scheduler.scheduleTestNotification();
    await this.notifyOutcome(ok);
    await this.refreshPending();
  }

  async fireDefinition(definitionId: number): Promise<void> {
    const ok = await this.scheduler.fireDefinitionInFiveSeconds(definitionId);
    await this.notifyOutcome(ok);
    await this.refreshPending();
  }

  async fireWelcome(): Promise<void> {
    if (!this.isNativePlatform) {
      await this.notifyOutcome(false);
      return;
    }
    await this.welcomeNotif.scheduleWelcomeNotification({ delayMs: 5_000 });
    await this.notifyOutcome(true);
    await this.refreshPending();
  }

  async fireRecovery(slot: RecoverySlot): Promise<void> {
    if (!this.isNativePlatform) {
      await this.notifyOutcome(false);
      return;
    }
    await this.recoveryNotif.fireRecoveryNotification(slot, { delayMs: 5_000 });
    await this.notifyOutcome(true);
    await this.refreshPending();
  }

  async cancelAll(): Promise<void> {
    const allIds = [
      ...this.registry.getAll().map(d => d.id),
      NOTIFICATION_IDS.WELCOME,
      NOTIFICATION_IDS.RECOVERY_D2,
      NOTIFICATION_IDS.RECOVERY_D5,
      NOTIFICATION_IDS.RECOVERY_D10,
    ];
    await this.plugin.cancel(allIds);
    await this.refreshPending();
  }

  private async notifyOutcome(ok: boolean): Promise<void> {
    const messageKey = ok
      ? 'settings.dev.notifications.toast.scheduled'
      : 'settings.dev.notifications.toast.noop';
    const toast = await this.toastCtrl.create({
      message: this.translate.instant(messageKey),
      duration: 1800,
      position: 'bottom',
    });
    await toast.present();
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/services/settings/settings-notifications-dev-state.service.ts
git commit -m "feat(settings): SettingsNotificationsDevStateService — facade for dev panel"
```

---

### Task D3: i18n for the dev panel

**Files:**
- Modify: `src/assets/i18n/{es,en,de,fr,it,pt}.json`

- [ ] **Step 1: Add to es.json under `settings`**

Inside the `settings` block, after the `advanced` block (preserve existing keys), add:

```json
"dev": {
  "notifications": {
    "title": "Notificaciones (desarrollador)",
    "subtitle": "Inspecciona y dispara notificaciones manualmente",
    "permissionLabel": "Permiso del sistema",
    "preferenceLabel": "Notificaciones activadas",
    "previewButton": "Previsualizar próxima",
    "fireWinningButton": "Disparar ganadora en 5s",
    "fireExpired": "Disparar 'caducados' en 5s",
    "fireNearExpiry": "Disparar 'pronto a caducar' en 5s",
    "fireLowStock": "Disparar 'bajo stock' en 5s",
    "fireReEngagement": "Disparar semanal en 5s",
    "fireWelcome": "Disparar bienvenida en 5s",
    "fireRecoveryD2": "Disparar D2 en 5s",
    "fireRecoveryD5": "Disparar D5 en 5s",
    "fireRecoveryD10": "Disparar D10 en 5s",
    "pendingTitle": "Programadas",
    "pendingEmpty": "Sin notificaciones programadas",
    "refreshPending": "Actualizar lista",
    "cancelAll": "Cancelar todas",
    "previewEmpty": "Nada que disparar — sin items que cumplan condición",
    "previewResultTitle": "Próxima notificación",
    "toast": {
      "scheduled": "Programada en 5 segundos",
      "noop": "Nada que disparar"
    }
  }
}
```

- [ ] **Step 2: Mirror to en.json**

```json
"dev": {
  "notifications": {
    "title": "Notifications (developer)",
    "subtitle": "Inspect and trigger notifications manually",
    "permissionLabel": "System permission",
    "preferenceLabel": "Notifications enabled",
    "previewButton": "Preview next",
    "fireWinningButton": "Fire winning in 5s",
    "fireExpired": "Fire 'expired' in 5s",
    "fireNearExpiry": "Fire 'near-expiry' in 5s",
    "fireLowStock": "Fire 'low-stock' in 5s",
    "fireReEngagement": "Fire weekly in 5s",
    "fireWelcome": "Fire welcome in 5s",
    "fireRecoveryD2": "Fire D2 in 5s",
    "fireRecoveryD5": "Fire D5 in 5s",
    "fireRecoveryD10": "Fire D10 in 5s",
    "pendingTitle": "Pending",
    "pendingEmpty": "No pending notifications",
    "refreshPending": "Refresh list",
    "cancelAll": "Cancel all",
    "previewEmpty": "Nothing to fire — no items match",
    "previewResultTitle": "Next notification",
    "toast": {
      "scheduled": "Scheduled in 5 seconds",
      "noop": "Nothing to fire"
    }
  }
}
```

- [ ] **Step 3: Mirror to de.json**

```json
"dev": {
  "notifications": {
    "title": "Benachrichtigungen (Entwickler)",
    "subtitle": "Benachrichtigungen einsehen und manuell auslösen",
    "permissionLabel": "Systemberechtigung",
    "preferenceLabel": "Benachrichtigungen aktiviert",
    "previewButton": "Nächste anzeigen",
    "fireWinningButton": "Gewinnerin in 5s auslösen",
    "fireExpired": "'Abgelaufen' in 5s auslösen",
    "fireNearExpiry": "'Bald abgelaufen' in 5s auslösen",
    "fireLowStock": "'Wenig Vorrat' in 5s auslösen",
    "fireReEngagement": "Wöchentliche in 5s auslösen",
    "fireWelcome": "Willkommen in 5s auslösen",
    "fireRecoveryD2": "D2 in 5s auslösen",
    "fireRecoveryD5": "D5 in 5s auslösen",
    "fireRecoveryD10": "D10 in 5s auslösen",
    "pendingTitle": "Geplant",
    "pendingEmpty": "Keine geplanten Benachrichtigungen",
    "refreshPending": "Liste aktualisieren",
    "cancelAll": "Alle abbrechen",
    "previewEmpty": "Nichts zum Auslösen — keine passenden Items",
    "previewResultTitle": "Nächste Benachrichtigung",
    "toast": {
      "scheduled": "In 5 Sekunden geplant",
      "noop": "Nichts zum Auslösen"
    }
  }
}
```

- [ ] **Step 4: Mirror to fr.json**

```json
"dev": {
  "notifications": {
    "title": "Notifications (développeur)",
    "subtitle": "Inspecter et déclencher manuellement les notifications",
    "permissionLabel": "Autorisation système",
    "preferenceLabel": "Notifications activées",
    "previewButton": "Prévisualiser la suivante",
    "fireWinningButton": "Déclencher la gagnante dans 5s",
    "fireExpired": "Déclencher 'expirés' dans 5s",
    "fireNearExpiry": "Déclencher 'bientôt' dans 5s",
    "fireLowStock": "Déclencher 'stock bas' dans 5s",
    "fireReEngagement": "Déclencher hebdomadaire dans 5s",
    "fireWelcome": "Déclencher bienvenue dans 5s",
    "fireRecoveryD2": "Déclencher D2 dans 5s",
    "fireRecoveryD5": "Déclencher D5 dans 5s",
    "fireRecoveryD10": "Déclencher D10 dans 5s",
    "pendingTitle": "Programmées",
    "pendingEmpty": "Aucune notification programmée",
    "refreshPending": "Rafraîchir la liste",
    "cancelAll": "Tout annuler",
    "previewEmpty": "Rien à déclencher — aucun item correspondant",
    "previewResultTitle": "Prochaine notification",
    "toast": {
      "scheduled": "Programmée dans 5 secondes",
      "noop": "Rien à déclencher"
    }
  }
}
```

- [ ] **Step 5: Mirror to it.json**

```json
"dev": {
  "notifications": {
    "title": "Notifiche (sviluppatore)",
    "subtitle": "Ispeziona e attiva notifiche manualmente",
    "permissionLabel": "Permesso di sistema",
    "preferenceLabel": "Notifiche attive",
    "previewButton": "Anteprima prossima",
    "fireWinningButton": "Attiva vincente in 5s",
    "fireExpired": "Attiva 'scaduti' in 5s",
    "fireNearExpiry": "Attiva 'in scadenza' in 5s",
    "fireLowStock": "Attiva 'poco stock' in 5s",
    "fireReEngagement": "Attiva settimanale in 5s",
    "fireWelcome": "Attiva benvenuto in 5s",
    "fireRecoveryD2": "Attiva D2 in 5s",
    "fireRecoveryD5": "Attiva D5 in 5s",
    "fireRecoveryD10": "Attiva D10 in 5s",
    "pendingTitle": "Programmate",
    "pendingEmpty": "Nessuna notifica programmata",
    "refreshPending": "Aggiorna lista",
    "cancelAll": "Annulla tutte",
    "previewEmpty": "Niente da attivare — nessun item corrispondente",
    "previewResultTitle": "Prossima notifica",
    "toast": {
      "scheduled": "Programmata in 5 secondi",
      "noop": "Niente da attivare"
    }
  }
}
```

- [ ] **Step 6: Mirror to pt.json**

```json
"dev": {
  "notifications": {
    "title": "Notificações (programador)",
    "subtitle": "Inspeciona e dispara notificações manualmente",
    "permissionLabel": "Permissão do sistema",
    "preferenceLabel": "Notificações ativadas",
    "previewButton": "Previsualizar próxima",
    "fireWinningButton": "Disparar vencedora em 5s",
    "fireExpired": "Disparar 'caducados' em 5s",
    "fireNearExpiry": "Disparar 'prestes a caducar' em 5s",
    "fireLowStock": "Disparar 'stock baixo' em 5s",
    "fireReEngagement": "Disparar semanal em 5s",
    "fireWelcome": "Disparar boas-vindas em 5s",
    "fireRecoveryD2": "Disparar D2 em 5s",
    "fireRecoveryD5": "Disparar D5 em 5s",
    "fireRecoveryD10": "Disparar D10 em 5s",
    "pendingTitle": "Programadas",
    "pendingEmpty": "Sem notificações programadas",
    "refreshPending": "Atualizar lista",
    "cancelAll": "Cancelar todas",
    "previewEmpty": "Nada para disparar — sem items que cumpram",
    "previewResultTitle": "Próxima notificação",
    "toast": {
      "scheduled": "Programada em 5 segundos",
      "noop": "Nada para disparar"
    }
  }
}
```

- [ ] **Step 7: Validate JSON**

Run: `node -e "for (const f of ['es','en','de','fr','it','pt']) JSON.parse(require('fs').readFileSync('src/assets/i18n/'+f+'.json','utf8'));"`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/assets/i18n/*.json
git commit -m "feat(settings): i18n developer notifications panel (6 langs)"
```

---

### Task D4: Render the dev panel inside settings-advanced

**Files:**
- Modify: `src/app/features/settings/components/settings-advanced/settings-advanced.component.ts`
- Modify: `src/app/features/settings/components/settings-advanced/settings-advanced.component.html`

- [ ] **Step 1: Inject and provide the new facade**

Replace `src/app/features/settings/components/settings-advanced/settings-advanced.component.ts`:

```ts
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NOTIFICATION_IDS } from '@core/constants';
import { SettingsStateService } from '@core/services/settings/settings-state.service';
import { SettingsNotificationsDevStateService } from '@core/services/settings/settings-notifications-dev-state.service';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemDivider,
  IonLabel,
  IonList,
  IonSpinner,
  IonTitle,
  IonToolbar,
  AlertController,
} from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-settings-advanced',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonList,
    IonItem,
    IonItemDivider,
    IonLabel,
    IonButton,
    IonIcon,
    IonSpinner,
    CommonModule,
    RouterLink,
    TranslateModule,
  ],
  templateUrl: './settings-advanced.component.html',
  styleUrls: ['./settings-advanced.component.scss'],
  providers: [SettingsStateService, SettingsNotificationsDevStateService],
})
export class SettingsAdvancedComponent {
  readonly facade = inject(SettingsStateService);
  readonly dev = inject(SettingsNotificationsDevStateService);
  protected readonly NOTIFICATION_IDS = NOTIFICATION_IDS;

  private readonly alertCtrl = inject(AlertController);
  private readonly translate = inject(TranslateService);

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
    await this.dev.refreshPending();
  }

  async showPreview(): Promise<void> {
    const result = await this.dev.previewNext();
    const message = result
      ? `${result.title}\n\n${result.body}`
      : this.translate.instant('settings.dev.notifications.previewEmpty');
    const alert = await this.alertCtrl.create({
      header: this.translate.instant('settings.dev.notifications.previewResultTitle'),
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }
}
```

- [ ] **Step 2: Append the developer card to the HTML**

In `src/app/features/settings/components/settings-advanced/settings-advanced.component.html`, **append** the following block immediately before the closing `</div>` that wraps `.settings-content` (and before the closing `</ion-content>`). Adjust the surrounding selector if the existing structure differs slightly:

```html
<ion-card class="settings-card">
  <ion-card-header>
    <ion-card-title>{{ 'settings.dev.notifications.title' | translate }}</ion-card-title>
    <ion-card-subtitle>{{ 'settings.dev.notifications.subtitle' | translate }}</ion-card-subtitle>
  </ion-card-header>
  <ion-card-content>
    <ion-list lines="none">
      <ion-item lines="none">
        <ion-label>
          <h3>{{ 'settings.dev.notifications.permissionLabel' | translate }}</h3>
          <p>{{ dev.permissionState() }}</p>
        </ion-label>
      </ion-item>
      <ion-item lines="none">
        <ion-label>
          <h3>{{ 'settings.dev.notifications.preferenceLabel' | translate }}</h3>
          <p>{{ dev.notificationsEnabled() ? '✓' : '✗' }}</p>
        </ion-label>
      </ion-item>

      <ion-item-divider></ion-item-divider>

      <ion-item lines="none">
        <ion-button slot="end" fill="clear" (click)="showPreview()">
          {{ 'settings.dev.notifications.previewButton' | translate }}
        </ion-button>
      </ion-item>
      <ion-item lines="none">
        <ion-button slot="end" fill="clear" (click)="dev.fireWinning()">
          {{ 'settings.dev.notifications.fireWinningButton' | translate }}
        </ion-button>
      </ion-item>

      <ion-item-divider></ion-item-divider>

      <ion-item lines="none">
        <ion-button slot="end" fill="clear" (click)="dev.fireDefinition(NOTIFICATION_IDS.EXPIRED_ITEMS)">
          {{ 'settings.dev.notifications.fireExpired' | translate }}
        </ion-button>
      </ion-item>
      <ion-item lines="none">
        <ion-button slot="end" fill="clear" (click)="dev.fireDefinition(NOTIFICATION_IDS.NEAR_EXPIRY)">
          {{ 'settings.dev.notifications.fireNearExpiry' | translate }}
        </ion-button>
      </ion-item>
      <ion-item lines="none">
        <ion-button slot="end" fill="clear" (click)="dev.fireDefinition(NOTIFICATION_IDS.LOW_STOCK)">
          {{ 'settings.dev.notifications.fireLowStock' | translate }}
        </ion-button>
      </ion-item>
      <ion-item lines="none">
        <ion-button slot="end" fill="clear" (click)="dev.fireDefinition(NOTIFICATION_IDS.RE_ENGAGEMENT)">
          {{ 'settings.dev.notifications.fireReEngagement' | translate }}
        </ion-button>
      </ion-item>

      <ion-item-divider></ion-item-divider>

      <ion-item lines="none">
        <ion-button slot="end" fill="clear" (click)="dev.fireWelcome()">
          {{ 'settings.dev.notifications.fireWelcome' | translate }}
        </ion-button>
      </ion-item>
      <ion-item lines="none">
        <ion-button slot="end" fill="clear" (click)="dev.fireRecovery('d2')">
          {{ 'settings.dev.notifications.fireRecoveryD2' | translate }}
        </ion-button>
      </ion-item>
      <ion-item lines="none">
        <ion-button slot="end" fill="clear" (click)="dev.fireRecovery('d5')">
          {{ 'settings.dev.notifications.fireRecoveryD5' | translate }}
        </ion-button>
      </ion-item>
      <ion-item lines="none">
        <ion-button slot="end" fill="clear" (click)="dev.fireRecovery('d10')">
          {{ 'settings.dev.notifications.fireRecoveryD10' | translate }}
        </ion-button>
      </ion-item>

      <ion-item-divider></ion-item-divider>

      <ion-item lines="none">
        <ion-label>
          <h3>{{ 'settings.dev.notifications.pendingTitle' | translate }}</h3>
        </ion-label>
        <ion-button slot="end" fill="clear" (click)="dev.refreshPending()">
          {{ 'settings.dev.notifications.refreshPending' | translate }}
        </ion-button>
      </ion-item>
      @if (dev.pending().length === 0) {
        <ion-item lines="none">
          <ion-label>
            <p>{{ 'settings.dev.notifications.pendingEmpty' | translate }}</p>
          </ion-label>
        </ion-item>
      } @else {
        @for (n of dev.pending(); track n.id) {
          <ion-item lines="none">
            <ion-label>
              <h3>#{{ n.id }} — {{ n.title || '—' }}</h3>
              <p>{{ n.scheduleAt || '—' }}</p>
            </ion-label>
          </ion-item>
        }
      }

      <ion-item lines="none">
        <ion-button slot="end" fill="clear" color="danger" (click)="dev.cancelAll()">
          {{ 'settings.dev.notifications.cancelAll' | translate }}
        </ion-button>
      </ion-item>
    </ion-list>
  </ion-card-content>
</ion-card>
```

- [ ] **Step 3: Verify TypeScript and template compile**

Run: `npm run build`
Expected: build succeeds without template errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/settings/components/settings-advanced/settings-advanced.component.ts src/app/features/settings/components/settings-advanced/settings-advanced.component.html
git commit -m "feat(settings): developer notifications panel UI in Settings → Advanced"
```

---

### Task D5: Manual QA for bet D

- [ ] **Step 1: Build and install on device**

```bash
npm run prepare:build
npx cap run android
```

- [ ] **Step 2: Open Settings → Advanced**

Expected: new card titled "Notificaciones (desarrollador)" visible. Permission state row shows current OS state. Notifications enabled row shows ✓ or ✗.

- [ ] **Step 3: Tap "Disparar ganadora en 5s"**

Expected: toast "Programada en 5 segundos" (or noop toast if nothing matches). Wait 5s — notification appears (when something to fire).

- [ ] **Step 4: Tap each per-definition fire button**

Expected: per-definition build → 5s schedule → notification arrives. Order does not matter; each id is independent.

- [ ] **Step 5: Tap "Disparar bienvenida en 5s"**

Expected: welcome notification fires in 5s with the new copy.

- [ ] **Step 6: Tap each recovery fire button (d2, d5, d10)**

Expected: matching recovery notification fires in 5s with the slot's copy.

- [ ] **Step 7: Tap "Actualizar lista"**

Expected: pending list shows current scheduled items (their ids + timestamps).

- [ ] **Step 8: Tap "Cancelar todas"**

Expected: pending list goes empty.

- [ ] **Step 9: Tap a fired notification carrying `extra.itemId`**

Expected: deep-link routes to that item's pantry-detail view (verifies bet A integration).

---

## Final: documentation refresh

### Task FINAL1: Update .claude docs

**Files:**
- Modify: `.claude/NOTIFICATIONS.md`
- Modify: `.claude/STATE.md`
- Modify: `.claude/FILE-MAP.md`

- [ ] **Step 1: Update NOTIFICATIONS.md**

Open `.claude/NOTIFICATIONS.md`. In the ID table, add rows for `WELCOME` (130) and `RECOVERY_D2/5/10` (140/141/142) — marked as "outside registry" — and document the new `extra.itemId` field plus the deep-link query param `?focusItem=<id>`. Add a "Developer panel" subsection summarising bet D.

- [ ] **Step 2: Update STATE.md**

Move H/B/A/D bullets from "Retention roadmap reference" pending into a new "What shipped in v4.5 retention" block.

- [ ] **Step 3: Update FILE-MAP.md**

Under `core/services/notifications/`, add: `welcome-notification.service.ts`, `recovery-notifications.service.ts`. Under `core/services/settings/`, add: `settings-notifications-dev-state.service.ts`.

- [ ] **Step 4: Commit**

```bash
git add .claude/NOTIFICATIONS.md .claude/STATE.md .claude/FILE-MAP.md
git commit -m "docs(retention): document v4.5 retention notifications (H+B+A+D)"
```

---

## Self-review checklist (run before opening PR)

- [ ] All four bets H/B/A/D have at least one task each.
- [ ] Every test step shows the actual test code.
- [ ] Every implementation step shows the actual implementation code.
- [ ] No "TBD", "TODO", "implement later", "add validation" placeholders remain.
- [ ] Method names used in later tasks (e.g. `pickPriorityItem`, `fireDefinitionInFiveSeconds`, `focusItemById`) match exactly the names defined in earlier tasks.
- [ ] All i18n changes touch all six language files in the same task.
- [ ] Each task ends with a commit step using `feat(...):` or `docs(...):` prefix.
- [ ] Manual QA steps name the exact device action and the exact expected outcome.
