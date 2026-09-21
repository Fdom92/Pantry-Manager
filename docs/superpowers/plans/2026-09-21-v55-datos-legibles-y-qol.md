# 5.5 — Datos legibles y QOL: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a small 5.5 that makes PostHog data trustworthy (install source, delivered notifications, plugin failure ≠ denial) and adds expiry sorting, a one-line empty Fresh section, and a unified shopping-list action menu.

**Architecture:** Pure rules go in `src/app/core/domain/**` with Jasmine specs (TDD). Services wire them to Ionic/Capacitor. One new local Capacitor plugin (Java) reads the Android installer package. No new dependencies.

**Tech Stack:** Angular 20 (standalone, signals), Ionic 8, Capacitor 7, Jasmine/Karma, PostHog, ngx-translate (6 bundles: es, en, de, fr, it, pt).

**Spec:** `docs/superpowers/specs/2026-09-15-v55-datos-legibles-y-qol-design.md`. Branch: `release/5.5`.

---

## Conventions for every task

- **Run one spec file:**
  `npx ng test --watch=false --browsers=ChromeHeadless --include='<path to .spec.ts>'`
- **Run everything (CI parity):** `npx ng lint && node scripts/check-icons.mjs && npx ng test --watch=false --browsers=ChromeHeadless`
- **i18n edits:** the six bundles round-trip exactly through `JSON.stringify(obj, null, 2) + '\n'` (verified). Use the helper below instead of hand-editing six files. Save it once as `/tmp/i18n-set.js` (not committed):

```js
// usage: node /tmp/i18n-set.js '<json of {lang: {"dotted.key": "value"}}>'
const fs = require('fs');
const updates = JSON.parse(process.argv[2]);
for (const [lang, entries] of Object.entries(updates)) {
  const p = `src/assets/i18n/${lang}.json`;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const [dotted, value] of Object.entries(entries)) {
    const keys = dotted.split('.');
    let o = j;
    for (const k of keys.slice(0, -1)) o = o[k] ??= {};
    o[keys.at(-1)] = value;
  }
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}
```

- **Commits:** Conventional Commits, English, body explains *why*. End every message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Icons:** any icon name used in a template or an action sheet must exist in `src/app/app-icons.ts` (import + map entry). `scripts/check-icons.mjs` only sees templates — action-sheet icons in TS are your responsibility.

## File map

| File | Change | Task |
|---|---|---|
| `src/app/core/domain/analytics/install-source.domain.ts` (+spec) | new: `classifyInstallSource` | 1 |
| `src/app/core/domain/analytics/person-profile.domain.ts` (+spec) | `install_source` field | 1 |
| `android/app/src/main/java/com/fdom/pantrymind/InstallSourcePlugin.java` | new native plugin | 2 |
| `android/app/src/main/java/com/fdom/pantrymind/MainActivity.java` | register plugin | 2 |
| `src/app/core/services/analytics/install-source.service.ts` | new: bridge + cache | 2 |
| `src/app/app.component.ts` | send install source; report delivered notifications | 2, 5 |
| `src/app/core/services/notifications/local-notifications.token.ts` | new: DI seam for tests | 3 |
| `src/app/core/services/notifications/notification.plugin.ts` | `'unavailable'`, `getDelivered` | 3 |
| `src/app/core/services/notifications/capacitor-notification.plugin.ts` (+spec) | log + `'unavailable'`, `getDelivered` | 3 |
| `src/app/core/services/notifications/notification-permission.service.ts` | three-state result | 4 |
| `src/app/core/services/notifications/notification-scheduler.service.ts` (+spec) | don't switch off on `'unavailable'`; `reportDelivered()` | 4, 5 |
| `src/app/core/services/reconsent/reconsent-prompt.service.ts` | exclude `'unavailable'` | 4 |
| `src/app/core/constants/analytics/events.constants.ts` | 5 new events | 5, 10, 16 |
| `src/app/core/domain/pantry/basic.domain.ts` (+spec) | new: `setBasic` | 6 |
| `src/app/core/services/pantry/pantry-state.service.ts` | use `setBasic`; sort menu; drop flat re-sort; drop dead `closeConsumeModal` | 6, 9, 10, 12 |
| `src/app/core/domain/pantry/pantry-filtering.domain.ts` (+spec) | `PantrySortMode`, `sortPantryItems(items, mode)` | 7 |
| `src/app/core/constants/shared/storage.constants.ts` | `PANTRY_SORT` key | 8 |
| `src/app/core/services/shared/local-storage.service.ts` | `pantrySort` accessor | 8 |
| `src/app/core/services/pantry/pantry-query.service.ts` | `sortMode` signal | 8 |
| `src/app/core/services/pantry/pantry-store.service.ts` | expose `sortMode` / `setSortMode` | 8 |
| `src/app/core/services/pantry/pantry-view-model.service.ts` | groups keep input order | 9 |
| `src/app/core/domain/README.md` | fix wrong `sortPantryItems` description | 9 |
| `src/app/features/pantry/pantry.component.html` | sort button; inline Fresh empty state | 10, 11 |
| `src/app/app-icons.ts` | `swap-vertical-outline` | 10 |
| `src/app/shared/components/empty-state/*` | `inline` input | 11 |
| `src/app/core/services/pantry/modals/pantry-consume-modal-state.service.ts` | remove dead `close()` | 12 |
| `src/app/features/list/list.component.html` / `.ts` | add row always; tap-row menu; no swipe | 13, 17 |
| `src/app/core/domain/list/list-row-actions.domain.ts` (+spec) | new: `listRowActions` | 14 |
| `src/app/core/services/shared/toast.service.ts` | `withAction` | 15 |
| `src/app/core/services/list/list-state.service.ts` | row menu, un-basic, unhide | 16 |
| `src/app/core/services/retention/coach-mark-state.service.ts` | drop `'list:swipe'` | 17 |
| `src/assets/i18n/*.json` | new keys | 10, 13, 16 |

---

### Task 1: `classifyInstallSource` and `install_source` in the person profile

**Files:**
- Create: `src/app/core/domain/analytics/install-source.domain.ts`
- Create: `src/app/core/domain/analytics/install-source.domain.spec.ts`
- Modify: `src/app/core/domain/analytics/index.ts`
- Modify: `src/app/core/domain/analytics/person-profile.domain.ts`
- Modify: `src/app/core/domain/analytics/person-profile.domain.spec.ts`

- [ ] **Step 1: Write the failing test** — `install-source.domain.spec.ts`

```ts
import { classifyInstallSource } from './install-source.domain';

describe('classifyInstallSource', () => {
  it('reads the Play Store installer as play', () => {
    expect(classifyInstallSource('com.android.vending')).toBe('play');
  });

  it('reads a missing installer as sideload (adb / Android Studio)', () => {
    expect(classifyInstallSource(null)).toBe('sideload');
    expect(classifyInstallSource(undefined)).toBe('sideload');
    expect(classifyInstallSource('')).toBe('sideload');
  });

  it('reads the system package installers and the shell as sideload', () => {
    expect(classifyInstallSource('com.google.android.packageinstaller')).toBe('sideload');
    expect(classifyInstallSource('com.android.packageinstaller')).toBe('sideload');
    expect(classifyInstallSource('com.android.shell')).toBe('sideload');
  });

  it('reads any other store as other', () => {
    expect(classifyInstallSource('com.huawei.appmarket')).toBe('other');
    expect(classifyInstallSource('com.sec.android.app.samsungapps')).toBe('other');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module './install-source.domain'`)

`npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/core/domain/analytics/install-source.domain.spec.ts'`

- [ ] **Step 3: Implement** — `install-source.domain.ts`

```ts
/**
 * Where the running APK came from. 'unknown' is never produced here: it is
 * what the caller reports when it could not ask at all (web, plugin failure).
 *
 * Why it exists: every production APK installed from Android Studio for QA
 * showed up in PostHog as a new real user — the developer's phone counted as
 * three people, and the only PRO purchase of the period was a tester one.
 * Filtering on `install_source = 'play'` removes them without anyone having
 * to remember to mark a device.
 */
export type InstallSourceKind = 'play' | 'sideload' | 'other' | 'unknown';

const PLAY_STORE = 'com.android.vending';
const SIDELOAD_INSTALLERS: ReadonlySet<string> = new Set([
  'com.google.android.packageinstaller',
  'com.android.packageinstaller',
  'com.android.shell',
]);

export function classifyInstallSource(installer: string | null | undefined): InstallSourceKind {
  if (!installer) return 'sideload';
  if (installer === PLAY_STORE) return 'play';
  if (SIDELOAD_INSTALLERS.has(installer)) return 'sideload';
  return 'other';
}
```

- [ ] **Step 4: Export it** — `src/app/core/domain/analytics/index.ts` becomes:

```ts
export * from './person-profile.domain';
export * from './install-source.domain';
```

- [ ] **Step 5: Run the spec — expect PASS**

- [ ] **Step 6: Failing test for the profile field** — in `person-profile.domain.spec.ts`, change `base` and add a test inside `describe('buildPersonProfile', ...)`:

```ts
  const base = {
    firstOpenAt: new Date('2026-08-24T10:00:00.000Z'),
    now: NOW,
    onboardingDone: true,
    notificationsEnabled: false,
    installSource: 'play' as const,
  };

  it('reports where the app was installed from', () => {
    expect(buildPersonProfile({ ...base, items: [] }).install_source).toBe('play');
    expect(buildPersonProfile({ ...base, items: [], installSource: 'sideload' }).install_source).toBe('sideload');
  });
```

- [ ] **Step 7: Run — expect FAIL** (compile error: `installSource` not in params / `install_source` missing)

`npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/core/domain/analytics/person-profile.domain.spec.ts'`

- [ ] **Step 8: Implement** — in `person-profile.domain.ts`:

Add the import at the top:
```ts
import type { InstallSourceKind } from './install-source.domain';
```
Add to `interface PersonProfile` (after `notifications_enabled: boolean;`):
```ts
  /** See `classifyInstallSource`: filter PostHog on 'play' to drop QA installs. */
  install_source: InstallSourceKind;
```
Change `buildPersonProfile` params and return:
```ts
export function buildPersonProfile(params: {
  items: readonly PantryItem[];
  firstOpenAt: Date | null | undefined;
  now: Date;
  onboardingDone: boolean;
  notificationsEnabled: boolean;
  installSource: InstallSourceKind;
}): PersonProfile {
  const { items, firstOpenAt, now, onboardingDone, notificationsEnabled, installSource } = params;
```
and add `install_source: installSource,` as the last property of the returned object.

- [ ] **Step 9: Run — expect PASS.** Then `npx ng lint` — `app.component.ts` will not compile yet (missing `installSource`); that is fixed in Task 2. To keep this commit green, in `app.component.ts` `syncPersonProfile()` add `installSource: 'unknown',` to the `buildPersonProfile({...})` call for now.

- [ ] **Step 10: Commit**

```bash
git add src/app/core/domain/analytics src/app/app.component.ts
git commit -m "feat(analytics): classify install source and add it to the person profile

The developer's own QA installs counted as real users in PostHog. A person
property saying where the APK came from lets every analysis filter on
install_source = 'play' instead of relying on someone marking a device.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Native `InstallSource` plugin and wiring

**Files:**
- Create: `android/app/src/main/java/com/fdom/pantrymind/InstallSourcePlugin.java`
- Modify: `android/app/src/main/java/com/fdom/pantrymind/MainActivity.java`
- Create: `src/app/core/services/analytics/install-source.service.ts`
- Modify: `src/app/core/services/analytics/index.ts` (add export)
- Modify: `src/app/app.component.ts`

No unit test: the logic lives in Task 1; this is a bridge. It is verified on device (Step 6).

- [ ] **Step 1: Native plugin** — `InstallSourcePlugin.java`

```java
package com.fdom.pantrymind;

import android.content.pm.PackageManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Reports which package installed this APK ("com.android.vending" = Play).
 * Never rejects: any failure resolves with no installer, and the JS side
 * decides what that means.
 */
@CapacitorPlugin(name = "InstallSource")
public class InstallSourcePlugin extends Plugin {

    @PluginMethod
    public void getInstaller(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            ret.put("installer", readInstaller());
        } catch (Exception e) {
            ret.put("installer", JSObject.NULL);
        }
        call.resolve(ret);
    }

    @SuppressWarnings("deprecation")
    private Object readInstaller() throws PackageManager.NameNotFoundException {
        PackageManager pm = getContext().getPackageManager();
        String pkg = getContext().getPackageName();
        String installer;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            installer = pm.getInstallSourceInfo(pkg).getInstallingPackageName();
        } else {
            installer = pm.getInstallerPackageName(pkg);
        }
        return installer == null ? JSObject.NULL : installer;
    }
}
```

- [ ] **Step 2: Register it** — `MainActivity.java` becomes:

```java
package com.fdom.pantrymind;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before super.onCreate builds the bridge.
        registerPlugin(InstallSourcePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

- [ ] **Step 3: TS bridge** — `install-source.service.ts`

```ts
import { Injectable, inject } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { classifyInstallSource, type InstallSourceKind } from '@core/domain/analytics';
import { LoggerService } from '../shared/logger.service';

interface InstallSourceNative {
  getInstaller(): Promise<{ installer?: string | null }>;
}

const InstallSource = registerPlugin<InstallSourceNative>('InstallSource');

/**
 * Asks the native side once per app process where the APK came from.
 * The answer cannot change while the process lives, so it is cached.
 */
@Injectable({ providedIn: 'root' })
export class InstallSourceService {
  private readonly logger = inject(LoggerService);
  private cached: Promise<InstallSourceKind> | null = null;

  resolve(): Promise<InstallSourceKind> {
    this.cached ??= this.read();
    return this.cached;
  }

  private async read(): Promise<InstallSourceKind> {
    if (!Capacitor.isNativePlatform()) return 'unknown';
    try {
      const { installer } = await InstallSource.getInstaller();
      return classifyInstallSource(installer ?? null);
    } catch (err) {
      this.logger.warn('InstallSourceService', 'getInstaller failed', { err: String(err) });
      return 'unknown';
    }
  }
}
```

Add `export * from './install-source.service';` to `src/app/core/services/analytics/index.ts`.

- [ ] **Step 4: Wire into the profile** — in `app.component.ts`:
  - import: `import { AnalyticsService, InstallSourceService } from '@core/services/analytics';`
  - field: `private readonly installSource = inject(InstallSourceService);`
  - in `syncPersonProfile()`, replace the temporary `installSource: 'unknown',` with:

```ts
          installSource: await this.installSource.resolve(),
```
(`syncPersonProfile` is already `async` and wrapped in try/catch.)

- [ ] **Step 5: Lint and full tests** — `npx ng lint && npx ng test --watch=false --browsers=ChromeHeadless` → PASS.

- [ ] **Step 6: Device check (manual, Fernando's phone)** — `npm run prepare:build`, run from Android Studio, open the app, then in PostHog → Persons → the newest person on CPH2493: `install_source = sideload`. If the app crashes at start, the registration order in `MainActivity` is wrong. Record the result in the commit body.

- [ ] **Step 7: Commit**

```bash
git add android/app/src/main/java/com/fdom/pantrymind src/app/core/services/analytics src/app/app.component.ts
git commit -m "feat(analytics): report the APK installer through a local native plugin

No installed Capacitor plugin exposes the install source, so a small local
plugin reads it from PackageManager. It never rejects; the TS side maps a
failure to 'unknown'. Verified on device: Android Studio install reports
install_source = sideload.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Notification plugin — `'unavailable'` and `getDelivered`

**Files:**
- Create: `src/app/core/services/notifications/local-notifications.token.ts`
- Modify: `src/app/core/services/notifications/notification.plugin.ts`
- Modify: `src/app/core/services/notifications/capacitor-notification.plugin.ts`
- Create: `src/app/core/services/notifications/capacitor-notification.plugin.spec.ts`

- [ ] **Step 1: DI seam** — `local-notifications.token.ts`

```ts
import { InjectionToken } from '@angular/core';
import { LocalNotifications, type LocalNotificationsPlugin } from '@capacitor/local-notifications';

/**
 * The Capacitor plugin object behind a token, so specs can hand the wrapper a
 * fake instead of spying on Capacitor's proxy object.
 */
export const LOCAL_NOTIFICATIONS = new InjectionToken<LocalNotificationsPlugin>('LOCAL_NOTIFICATIONS', {
  providedIn: 'root',
  factory: () => LocalNotifications,
});
```

- [ ] **Step 2: Types** — in `notification.plugin.ts`:

```ts
/**
 * 'unavailable' means the plugin itself failed. It is not a user decision and
 * must never be treated as 'denied' — doing so used to switch the user's
 * notification toggle off silently.
 */
export type NotificationPermissionDisplay = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied' | 'unavailable';

export type NotificationRequestResult = 'granted' | 'denied' | 'unavailable';
```
and in `INotificationPlugin` change/add:
```ts
  requestPermission(): Promise<NotificationRequestResult>;
  getDelivered?(): Promise<number[]>;
```

- [ ] **Step 3: Failing spec** — `capacitor-notification.plugin.spec.ts`

```ts
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../shared/logger.service';
import { CapacitorNotificationPlugin } from './capacitor-notification.plugin';
import { LOCAL_NOTIFICATIONS } from './local-notifications.token';

describe('CapacitorNotificationPlugin', () => {
  let plugin: CapacitorNotificationPlugin;
  let native: jasmine.SpyObj<any>;
  let logger: jasmine.SpyObj<LoggerService>;

  beforeEach(() => {
    native = jasmine.createSpyObj('LocalNotifications', [
      'checkPermissions', 'requestPermissions', 'getDeliveredNotifications',
    ]);
    logger = jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info', 'debug']);
    TestBed.configureTestingModule({
      providers: [
        CapacitorNotificationPlugin,
        { provide: LOCAL_NOTIFICATIONS, useValue: native },
        { provide: LoggerService, useValue: logger },
      ],
    });
    plugin = TestBed.inject(CapacitorNotificationPlugin);
  });

  it('passes the OS permission through', async () => {
    native.checkPermissions.and.resolveTo({ display: 'denied' });
    expect(await plugin.checkPermission()).toBe('denied');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('reports a failing check as unavailable, not denied, and logs it', async () => {
    native.checkPermissions.and.rejectWith(new Error('boom'));
    expect(await plugin.checkPermission()).toBe('unavailable');
    expect(logger.error).toHaveBeenCalled();
  });

  it('maps a request to granted / denied', async () => {
    native.requestPermissions.and.resolveTo({ display: 'granted' });
    expect(await plugin.requestPermission()).toBe('granted');
    native.requestPermissions.and.resolveTo({ display: 'denied' });
    expect(await plugin.requestPermission()).toBe('denied');
  });

  it('reports a failing request as unavailable and logs it', async () => {
    native.requestPermissions.and.rejectWith(new Error('boom'));
    expect(await plugin.requestPermission()).toBe('unavailable');
    expect(logger.error).toHaveBeenCalled();
  });

  it('returns the ids still sitting in the tray', async () => {
    native.getDeliveredNotifications.and.resolveTo({ notifications: [{ id: 9001 }, { id: '9002' }] });
    expect(await plugin.getDelivered()).toEqual([9001, 9002]);
  });

  it('returns no ids when the tray cannot be read, without throwing', async () => {
    native.getDeliveredNotifications.and.rejectWith(new Error('boom'));
    expect(await plugin.getDelivered()).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run — expect FAIL**

`npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/core/services/notifications/capacitor-notification.plugin.spec.ts'`

- [ ] **Step 5: Implement** — replace the body of `capacitor-notification.plugin.ts` so every `LocalNotifications.x` call goes through the injected token:

```ts
import { Injectable, inject } from '@angular/core';
import { NOTIFICATION_CHANNEL_ID } from '@core/constants';
import { LoggerService } from '../shared/logger.service';
import { LOCAL_NOTIFICATIONS } from './local-notifications.token';
import type {
  INotificationPlugin,
  NotificationPermissionDisplay,
  NotificationRequestResult,
  PendingNotification,
  ScheduledNotificationInput,
} from './notification.plugin';

@Injectable({ providedIn: 'root' })
export class CapacitorNotificationPlugin implements INotificationPlugin {
  private readonly native = inject(LOCAL_NOTIFICATIONS);
  private readonly logger = inject(LoggerService);

  async requestPermission(): Promise<NotificationRequestResult> {
    try {
      const result = await this.native.requestPermissions();
      return result.display === 'granted' ? 'granted' : 'denied';
    } catch (err) {
      this.logger.error('CapacitorNotificationPlugin', 'requestPermissions failed', err);
      return 'unavailable';
    }
  }

  async checkPermission(): Promise<NotificationPermissionDisplay> {
    try {
      const result = await this.native.checkPermissions();
      return result.display as NotificationPermissionDisplay;
    } catch (err) {
      this.logger.error('CapacitorNotificationPlugin', 'checkPermissions failed', err);
      return 'unavailable';
    }
  }

  async schedule(notifications: ScheduledNotificationInput[]): Promise<void> {
    if (!notifications.length) return;
    await this.native.schedule({
      notifications: notifications.map(n => ({
        id: n.id,
        title: n.title,
        body: n.body,
        schedule: { at: n.scheduleAt, allowWhileIdle: true },
        channelId: NOTIFICATION_CHANNEL_ID,
        extra: n.extra ?? undefined,
      })),
    });
  }

  async cancel(ids: number[]): Promise<void> {
    if (!ids.length) return;
    await this.native.cancel({ notifications: ids.map(id => ({ id })) });
  }

  async createChannel(options: { id: string; name: string; importance: number }): Promise<void> {
    try {
      await this.native.createChannel({
        id: options.id,
        name: options.name,
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
      const result = await this.native.getPending();
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

  /**
   * Ids of notifications still in the system tray. A lower bound on delivery:
   * tapped or swiped-away ones are gone, and the same one is seen again on
   * every open until it leaves the tray.
   */
  async getDelivered(): Promise<number[]> {
    try {
      const result = await this.native.getDeliveredNotifications();
      return (result?.notifications ?? [])
        .map(n => Number(n.id))
        .filter(id => Number.isFinite(id));
    } catch (err) {
      this.logger.warn('CapacitorNotificationPlugin', 'getDeliveredNotifications failed', { err: String(err) });
      return [];
    }
  }
}
```

- [ ] **Step 6: Run the spec — expect PASS.** Then `npx ng lint` — expect errors in `notification-permission.service.ts` (`requestPermission` now returns a string). Fixed in Task 4; do not commit until Task 4 Step 5 passes, or commit both together.

---

### Task 4: Permission service, scheduler and re-consent treat `'unavailable'` as a failure

**Files:**
- Modify: `src/app/core/services/notifications/notification-permission.service.ts`
- Modify: `src/app/core/services/notifications/notification-scheduler.service.ts:126-150`
- Modify: `src/app/core/services/reconsent/reconsent-prompt.service.ts:63-69`
- Create: `src/app/core/services/notifications/notification-scheduler.service.spec.ts`

- [ ] **Step 1: Permission service** — replace the type, `request()` and add `isUnavailable()`:

```ts
export type NotificationPermissionState =
  'unknown' | 'granted' | 'prompt' | 'prompt-with-rationale' | 'denied' | 'unavailable';
```
```ts
  async request(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    this.hasBeenRequested = true;
    const result = await this.plugin.requestPermission();
    this.permissionState.set(result);
    return result === 'granted';
  }
```
```ts
  /** The plugin failed; this is not a user decision. */
  isUnavailable(): boolean {
    return this.permissionState() === 'unavailable';
  }
```

- [ ] **Step 2: Failing scheduler spec** — `notification-scheduler.service.spec.ts`. Only the permission branch; the full scheduler spec is out of scope for 5.5.

```ts
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { DEFAULT_PREFERENCES } from '@core/constants';
import { AnalyticsService } from '../analytics/analytics.service';
import { SettingsPreferencesService } from '@core/services/settings/settings-preferences.service';
import { PantryNavigationPresetService } from '@core/services/pantry/pantry-navigation-preset.service';
import { PantryStoreService } from '@core/services/pantry/pantry-store.service';
import { LoggerService } from '../shared/logger.service';
import { CapacitorNotificationPlugin } from './capacitor-notification.plugin';
import { NotificationPermissionService } from './notification-permission.service';
import { NotificationRegistryService } from './notification-registry.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { WelcomeNotificationService } from './welcome-notification.service';

describe('NotificationSchedulerService — permission branch', () => {
  let scheduler: NotificationSchedulerService;
  let prefs: { preferences: ReturnType<typeof signal>; savePreferences: jasmine.Spy };
  let permission: jasmine.SpyObj<NotificationPermissionService>;
  let plugin: jasmine.SpyObj<CapacitorNotificationPlugin>;
  let analytics: jasmine.SpyObj<AnalyticsService>;

  beforeEach(() => {
    // Construction must not register native listeners; scheduleAll must think it is native.
    const isNative = spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);

    prefs = {
      preferences: signal({ ...DEFAULT_PREFERENCES, notificationsEnabled: true }),
      savePreferences: jasmine.createSpy('savePreferences').and.resolveTo(),
    };
    permission = jasmine.createSpyObj('NotificationPermissionService',
      ['init', 'isGranted', 'isPermanentlyDenied', 'isUnavailable', 'request'],
      { wasRequested: false });
    permission.init.and.resolveTo();
    plugin = jasmine.createSpyObj('CapacitorNotificationPlugin', ['schedule', 'cancel', 'getDelivered']);
    plugin.cancel.and.resolveTo();
    plugin.schedule.and.resolveTo();
    analytics = jasmine.createSpyObj('AnalyticsService', ['track']);

    TestBed.configureTestingModule({
      providers: [
        NotificationSchedulerService,
        { provide: NotificationRegistryService, useValue: { getAll: () => [], getById: () => undefined } },
        { provide: NotificationPermissionService, useValue: permission },
        { provide: CapacitorNotificationPlugin, useValue: plugin },
        { provide: SettingsPreferencesService, useValue: prefs },
        { provide: PantryStoreService, useValue: { loadedProducts: signal([]) } },
        { provide: PantryNavigationPresetService, useValue: { setPending: () => undefined } },
        { provide: NavController, useValue: { navigateRoot: () => Promise.resolve(true) } },
        { provide: TranslateService, useValue: { instant: (k: string) => k } },
        { provide: WelcomeNotificationService, useValue: { cancelWelcomeNotification: () => Promise.resolve() } },
        { provide: AnalyticsService, useValue: analytics },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info', 'debug']) },
      ],
    });
    scheduler = TestBed.inject(NotificationSchedulerService);
    isNative.and.returnValue(true);
  });

  it('leaves the user toggle alone when the plugin is unavailable', async () => {
    permission.isGranted.and.returnValue(false);
    permission.isUnavailable.and.returnValue(true);
    permission.isPermanentlyDenied.and.returnValue(false);

    await scheduler.scheduleAll();

    expect(prefs.savePreferences).not.toHaveBeenCalled();
    expect(permission.request).not.toHaveBeenCalled();
  });

  it('leaves the toggle alone when the request itself fails', async () => {
    permission.isGranted.and.returnValue(false);
    permission.isPermanentlyDenied.and.returnValue(false);
    permission.isUnavailable.and.returnValues(false, true); // before request, after request
    permission.request.and.resolveTo(false);

    await scheduler.scheduleAll();

    expect(prefs.savePreferences).not.toHaveBeenCalled();
  });

  it('still switches the toggle off after a real denial', async () => {
    permission.isGranted.and.returnValue(false);
    permission.isUnavailable.and.returnValue(false);
    permission.isPermanentlyDenied.and.returnValue(true);

    await scheduler.scheduleAll();

    expect(prefs.savePreferences).toHaveBeenCalledWith(jasmine.objectContaining({ notificationsEnabled: false }));
  });
});
```

- [ ] **Step 3: Run — expect FAIL** on the first two tests (`savePreferences` is called because `'unavailable'` is not handled).

`npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/core/services/notifications/notification-scheduler.service.spec.ts'`

If construction fails because an injected dependency is missing from the providers above, add a `useValue` stub for it — do not change the service to suit the test.

- [ ] **Step 4: Implement** — in `scheduleAll()` replace the `if (!this.permission.isGranted()) { ... }` block with:

```ts
      if (!this.permission.isGranted()) {
        // A broken plugin is not a user decision: the plugin already logged it
        // to Sentry. Leave the user's toggle exactly as it is.
        if (this.permission.isUnavailable()) return;
        if (this.permission.isPermanentlyDenied()) {
          // User chose "Don't ask again" — cannot request. Auto-disable the toggle.
          // The settings UI will show a friendly alert explaining how to re-enable.
          await this.preferencesService.savePreferences({
            ...this.preferencesService.preferences(),
            notificationsEnabled: false,
          });
          return;
        }
        // Only request permission once per session to avoid showing the system dialog
        // repeatedly (e.g. when the app resumes after the user dismisses the dialog).
        if (this.permission.wasRequested) return;
        const granted = await this.permission.request();
        if (!granted) {
          if (this.permission.isUnavailable()) return;
          // Mirror the system decision back into preferences so the toggle goes OFF
          // automatically — avoids the confusing state where toggle is ON but no
          // notifications arrive.
          await this.preferencesService.savePreferences({
            ...this.preferencesService.preferences(),
            notificationsEnabled: false,
          });
          return;
        }
      }
```

- [ ] **Step 5: Re-consent** — in `reconsent-prompt.service.ts` the gate becomes:

```ts
    const notifications =
      !notificationsAlreadyDecided &&
      permissionState !== 'granted' &&
      permissionState !== 'denied' &&
      permissionState !== 'unavailable' &&
      permissionState !== 'unknown';
```
and add to the comment above it: `//   4. 'unavailable' means the plugin is broken — asking would fail too.`

- [ ] **Step 6: Run the scheduler spec — PASS. Then** `npx ng lint && npx ng test --watch=false --browsers=ChromeHeadless` — PASS. Other callers of `permission.request()` (reconsent sheet, dev panel) keep receiving `boolean`, so they compile unchanged.

- [ ] **Step 7: Commit (Tasks 3 + 4 together)**

```bash
git add src/app/core/services/notifications src/app/core/services/reconsent
git commit -m "fix(notifications): stop reading a plugin failure as a permission denial

checkPermission() returned 'denied' when the plugin threw, which made the
scheduler switch the user's notification toggle off without a trace. A
failure is now 'unavailable': logged to Sentry, never persisted into
preferences, and excluded from the re-consent prompt. The plugin goes
through an injection token so its spec can use a fake.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `notification_delivered_seen`

**Files:**
- Modify: `src/app/core/constants/analytics/events.constants.ts`
- Modify: `src/app/core/services/notifications/notification-scheduler.service.ts`
- Modify: `src/app/core/services/notifications/notification-scheduler.service.spec.ts`
- Modify: `src/app/app.component.ts`

- [ ] **Step 1: Event constant** — next to `NOTIFICATION_RECEIVED` in `events.constants.ts`:

```ts
  /**
   * Notifications still in the system tray when the app opens. A lower bound on
   * delivery: tapped or swiped-away ones are gone, and one left in the tray is
   * counted again on every open — dedupe by person and id when analysing.
   * Exists because notification_received can almost never fire: the plugin
   * only emits it while the WebView is alive, and a morning notification
   * usually arrives with the app process dead.
   */
  NOTIFICATION_DELIVERED_SEEN: 'notification_delivered_seen',
```

- [ ] **Step 2: Failing tests** — append to `notification-scheduler.service.spec.ts` inside the `describe`:

```ts
  it('reports the notifications left in the tray', async () => {
    plugin.getDelivered.and.resolveTo([9001, 9003]);
    await scheduler.reportDelivered();
    expect(analytics.track).toHaveBeenCalledWith('notification_delivered_seen', { count: 2, ids: [9001, 9003] });
  });

  it('stays quiet when the tray is empty', async () => {
    plugin.getDelivered.and.resolveTo([]);
    await scheduler.reportDelivered();
    expect(analytics.track).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Run — FAIL** (`reportDelivered` is not a function).

- [ ] **Step 4: Implement** — add to `NotificationSchedulerService` (after `cancelAll()`):

```ts
  /** See ANALYTICS_EVENTS.NOTIFICATION_DELIVERED_SEEN for what this can and cannot say. */
  async reportDelivered(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    const ids = await this.plugin.getDelivered();
    if (!ids.length) return;
    this.analytics.track(ANALYTICS_EVENTS.NOTIFICATION_DELIVERED_SEEN, { count: ids.length, ids });
  }
```
Also, in the comment above the `localNotificationReceived` listener in the constructor, append: `// In practice this almost never fires (the WebView must be alive); see NOTIFICATION_DELIVERED_SEEN.`

- [ ] **Step 5: Call it from boot and foreground** — `app.component.ts`: after `await this.notificationScheduler.scheduleAll();` in the boot sequence (~line 100) **and** in the `appStateChange` active branch (~line 180), add:

```ts
    void this.notificationScheduler.reportDelivered();
```
(Not inside `scheduleAll()`: that also runs on every preferences change and would over-report.)

- [ ] **Step 6: Run spec — PASS; then lint + full tests — PASS.**

- [ ] **Step 7: Commit**

```bash
git add src/app/core/constants/analytics/events.constants.ts src/app/core/services/notifications src/app/app.component.ts
git commit -m "feat(analytics): count notifications still in the tray on each open

notification_received can almost never fire: the plugin needs a live
WebView and morning notifications arrive with the process dead. Reading
the tray on boot and foreground gives a lower bound on delivery, which
is what the notification numbers were missing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `setBasic` — one definition of "no longer a staple"

**Files:**
- Create: `src/app/core/domain/pantry/basic.domain.ts`
- Create: `src/app/core/domain/pantry/basic.domain.spec.ts`
- Modify: `src/app/core/domain/pantry/index.ts`
- Modify: `src/app/core/services/pantry/pantry-state.service.ts:552-571`

- [ ] **Step 1: Failing spec**

```ts
import type { PantryItem } from '@core/models/pantry';
import { setBasic } from './basic.domain';

const NOW = '2026-09-21T10:00:00.000Z';

function item(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    _id: 'item:1', type: 'item', householdId: 'hh', name: 'Maíz', categoryId: 'cat',
    batches: [], isBasic: true, minThreshold: 2, createdAt: NOW, updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as PantryItem;
}

describe('setBasic', () => {
  it('clears the minimum when a product stops being basic', () => {
    const result = setBasic(item(), false, NOW);
    expect(result.isBasic).toBeFalse();
    expect(result.minThreshold).toBeUndefined();
    expect(result.updatedAt).toBe(NOW);
  });

  it('keeps the current minimum when marking basic without a restore value', () => {
    const result = setBasic(item({ isBasic: false, minThreshold: 3 }), true, NOW);
    expect(result.isBasic).toBeTrue();
    expect(result.minThreshold).toBe(3);
  });

  it('restores a previous minimum when undoing', () => {
    const cleared = setBasic(item(), false, NOW);
    expect(setBasic(cleared, true, NOW, 2).minThreshold).toBe(2);
  });

  it('does not mutate its input', () => {
    const original = item();
    setBasic(original, false, NOW);
    expect(original.isBasic).toBeTrue();
    expect(original.minThreshold).toBe(2);
  });
});
```

- [ ] **Step 2: Run — FAIL.** `--include='src/app/core/domain/pantry/basic.domain.spec.ts'`

- [ ] **Step 3: Implement** — `basic.domain.ts`

```ts
import type { PantryItem } from '@core/models/pantry';

/**
 * "Always keep at home" on or off. Turning it off also clears the minimum —
 * a minimum only means something for a product the list should restock.
 * `restoreMinThreshold` is for undo: put back the minimum it had before.
 */
export function setBasic(
  item: PantryItem,
  isBasic: boolean,
  nowIso: string,
  restoreMinThreshold?: number,
): PantryItem {
  const updated: PantryItem = { ...item, isBasic, updatedAt: nowIso };
  if (!isBasic) {
    updated.minThreshold = undefined;
  } else if (restoreMinThreshold !== undefined) {
    updated.minThreshold = restoreMinThreshold;
  }
  return updated;
}
```
Add `export * from './basic.domain';` to `src/app/core/domain/pantry/index.ts`.

- [ ] **Step 4: Run — PASS.**

- [ ] **Step 5: Use it in the pantry star** — in `pantry-state.service.ts` `toggleItemBasic`, replace the object literal and the `if (!isBasic) { updated.minThreshold = undefined; }` with:

```ts
    const isBasic = !item.isBasic;
    const updated = setBasic(item, isBasic, new Date().toISOString());
```
and add `setBasic` to the existing `@core/domain/pantry` import in that file (or a new `import { setBasic } from '@core/domain/pantry';`).

- [ ] **Step 6: Lint + full tests — PASS. Commit**

```bash
git add src/app/core/domain/pantry src/app/core/services/pantry/pantry-state.service.ts
git commit -m "refactor(pantry): extract setBasic so every screen shares one rule

Un-starring a product also clears its minimum. The shopping list is about
to offer the same action, so the rule moves to the domain instead of
being copied.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: `sortPantryItems(items, mode)`

**Files:**
- Modify: `src/app/core/domain/pantry/pantry-filtering.domain.ts:72-85`
- Modify: `src/app/core/domain/pantry/pantry-filtering.domain.spec.ts`

- [ ] **Step 1: Failing tests** — add `sortPantryItems, isPantrySortMode` to the existing import at the top of the spec, then append:

```ts
describe('sortPantryItems', () => {
  const a = (name: string, expirationDate?: string) =>
    makeItem({ _id: name, name, expirationDate });

  it('alpha keeps the current alphabetical behaviour, ignoring accents and case', () => {
    const sorted = sortPantryItems([a('zanahoria'), a('Árbol'), a('berenjena')], 'alpha');
    expect(sorted.map(i => i.name)).toEqual(['Árbol', 'berenjena', 'zanahoria']);
  });

  it('expiry puts the earliest date first, so expired items lead', () => {
    const sorted = sortPantryItems(
      [a('leche', '2026-09-30'), a('yogur', '2026-09-01'), a('queso', '2026-09-15')],
      'expiry',
    );
    expect(sorted.map(i => i.name)).toEqual(['yogur', 'queso', 'leche']);
  });

  it('expiry sends dateless items to the end, alphabetically', () => {
    const sorted = sortPantryItems([a('sal'), a('arroz'), a('leche', '2026-09-30')], 'expiry');
    expect(sorted.map(i => i.name)).toEqual(['leche', 'arroz', 'sal']);
  });

  it('expiry breaks ties by name so the order never jumps between reloads', () => {
    const sorted = sortPantryItems([a('pan', '2026-09-20'), a('huevos', '2026-09-20')], 'expiry');
    expect(sorted.map(i => i.name)).toEqual(['huevos', 'pan']);
  });

  it('does not mutate its input', () => {
    const input = [a('b'), a('a')];
    sortPantryItems(input, 'alpha');
    expect(input.map(i => i.name)).toEqual(['b', 'a']);
  });
});

describe('isPantrySortMode', () => {
  it('accepts only the known modes', () => {
    expect(isPantrySortMode('expiry')).toBeTrue();
    expect(isPantrySortMode('alpha')).toBeTrue();
    expect(isPantrySortMode('recent')).toBeFalse();
    expect(isPantrySortMode(null)).toBeFalse();
  });
});
```

- [ ] **Step 2: Run — FAIL.** `--include='src/app/core/domain/pantry/pantry-filtering.domain.spec.ts'`

- [ ] **Step 3: Implement** — replace the current `sortPantryItems` in `pantry-filtering.domain.ts`:

```ts
/**
 * How the despensa list is ordered. 'expiry' is the default: in an app about
 * expiry dates, what runs out tomorrow should not sit at the bottom because
 * its name starts with Y.
 */
export type PantrySortMode = 'expiry' | 'alpha';
export const DEFAULT_PANTRY_SORT_MODE: PantrySortMode = 'expiry';

export function isPantrySortMode(value: unknown): value is PantrySortMode {
  return value === 'expiry' || value === 'alpha';
}

function compareByName(a: PantryItem, b: PantryItem): number {
  return normalizeSearchField(a.name).localeCompare(normalizeSearchField(b.name));
}

/**
 * `expirationDate` is already the earliest date among lots with stock
 * (computeEarliestExpiryStock), stored as an ISO date, so plain string
 * comparison orders it. Dateless items go last; ties fall back to the name.
 */
function compareByExpiry(a: PantryItem, b: PantryItem): number {
  const ea = a.expirationDate;
  const eb = b.expirationDate;
  if (ea && eb && ea !== eb) return ea < eb ? -1 : 1;
  if (ea && !eb) return -1;
  if (!ea && eb) return 1;
  return compareByName(a, b);
}

export function sortPantryItems(items: PantryItem[], mode: PantrySortMode): PantryItem[] {
  if (items.length <= 1) return items;
  const compare = mode === 'expiry' ? compareByExpiry : compareByName;
  return [...items].sort(compare);
}
```

- [ ] **Step 4: Run — PASS.** `npx ng lint` will now flag `pantry-query.service.ts:304` (missing argument). Pass `'alpha'` there temporarily so this commit keeps today's behaviour; Task 8 replaces it.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/domain/pantry src/app/core/services/pantry/pantry-query.service.ts
git commit -m "feat(pantry): add an expiry-first sort mode to sortPantryItems

Earliest expiry first, dateless last, ties by name so the order is stable.
Callers still pass 'alpha' until the mode is wired to state.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Sort mode state and persistence

**Files:**
- Modify: `src/app/core/constants/shared/storage.constants.ts`
- Modify: `src/app/core/services/shared/local-storage.service.ts`
- Modify: `src/app/core/services/pantry/pantry-query.service.ts`
- Modify: `src/app/core/services/pantry/pantry-store.service.ts`

- [ ] **Step 1: Key** — in `STORAGE_KEYS`, after `HOUSEHOLD_SIZE`:

```ts
  /**
   * Despensa sort order ('expiry' | 'alpha'). Screen state, not an app
   * preference: AppPreferences changes re-run the notification scheduler.
   */
  PANTRY_SORT: 'pantry:sortMode',
```

- [ ] **Step 2: Accessor** — in `LocalStorageService`, after `householdSize`:

```ts
  // ─── Despensa sort order (screen state) ────────────────────────────────
  readonly pantrySort = {
    get: (): PantrySortMode => {
      const raw = this.getString(STORAGE_KEYS.PANTRY_SORT);
      return isPantrySortMode(raw) ? raw : DEFAULT_PANTRY_SORT_MODE;
    },
    set: (mode: PantrySortMode) => this.setString(STORAGE_KEYS.PANTRY_SORT, mode),
  };
```
with the import `import { DEFAULT_PANTRY_SORT_MODE, isPantrySortMode, type PantrySortMode } from '@core/domain/pantry';`.

- [ ] **Step 3: Query service** — in `PantryQueryService`:
  - inject: `private readonly localStorage = inject(LocalStorageService);` (import from `'../shared/local-storage.service'`)
  - state (next to `activeFilters`): `readonly sortMode = signal<PantrySortMode>(this.localStorage.pantrySort.get());`
  - method (next to the filter setters):

```ts
  /** Re-sorts in memory; does not reset pagination. */
  setSortMode(mode: PantrySortMode): void {
    if (this.sortMode() === mode) return;
    this.sortMode.set(mode);
    this.localStorage.pantrySort.set(mode);
  }
```
  - in `recomputeFilteredProducts()`: `this.filteredProducts.set(sortPantryItems(filtered, this.sortMode()));`
  - import `type PantrySortMode` from `@core/domain/pantry`.

  If `inject(LocalStorageService)` creates a circular import, use `import { LocalStorageService } from '@core/services/shared/local-storage.service';`.

- [ ] **Step 4: Store** — in `PantryStoreService` exposed signals:

```ts
  readonly sortMode: Signal<PantrySortMode> = this.pantryQuery.sortMode;
```
and under business operations:
```ts
  setSortMode(mode: PantrySortMode): void {
    this.pantryQuery.setSortMode(mode);
  }
```

- [ ] **Step 5: Lint + full tests — PASS.** Commit:

```bash
git add src/app/core/constants/shared/storage.constants.ts src/app/core/services/shared/local-storage.service.ts src/app/core/services/pantry/pantry-query.service.ts src/app/core/services/pantry/pantry-store.service.ts
git commit -m "feat(pantry): keep the sort mode in state and localStorage

Stored per device next to other screen state, not in AppPreferences,
whose changes re-run the notification scheduler. Unknown stored values
fall back to expiry-first.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Stop re-sorting alphabetically downstream

**Files:**
- Modify: `src/app/core/services/pantry/pantry-state.service.ts` (`flatDespensaItems`)
- Modify: `src/app/core/services/pantry/pantry-view-model.service.ts` (`buildGroups`, `compareItems`)
- Modify: `src/app/core/domain/README.md` (line ~172)

Without this task the new order never shows: the flat list and each group re-sort by name.

- [ ] **Step 1: Flat list** — replace:

```ts
  readonly flatDespensaItems = computed(() =>
    [...this.despensaItems()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  );
```
with:
```ts
  /** Already ordered by the query's sort mode; do not re-sort here. */
  readonly flatDespensaItems = this.despensaItems;
```

- [ ] **Step 2: Groups** — in `buildGroups`, delete the loop that does `group.items = group.items.sort((a, b) => this.compareItems(a, b));` (items are pushed in input order already) and delete the now-unused `private compareItems(...)`. Groups themselves stay sorted by category name. Add above `buildGroups`: `/** Items keep the order they arrive in — the query decides the sort mode. */`

- [ ] **Step 3: Docs** — in `src/app/core/domain/README.md`, the table row for `sortPantryItems` says "Sorts items by priority". Change it to: `` | `sortPantryItems` | Sorts by expiry (default) or name | `PantryItem[]`, `PantrySortMode` | ``. Update the usage example `sortPantryItems(items)` → `sortPantryItems(items, 'expiry')` in both `core/domain/README.md` and `core/domain/pantry/README.md`.

- [ ] **Step 4: Run full tests.** If a spec asserted alphabetical order inside groups or in the flat list, change it to assert that the input order is kept (the order now belongs to the query). Lint — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/pantry src/app/core/domain/README.md src/app/core/domain/pantry/README.md
git commit -m "fix(pantry): let the query own the sort order

The flat list and each category group re-sorted by name after the query
had sorted, so any other order would have been invisible.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Sort control in the despensa header

**Files:**
- Modify: `src/app/app-icons.ts`
- Modify: `src/app/core/constants/analytics/events.constants.ts`
- Modify: `src/app/core/services/pantry/pantry-state.service.ts`
- Modify: `src/app/features/pantry/pantry.component.html:127-137`
- Modify: `src/assets/i18n/*.json`

- [ ] **Step 1: Icon** — in `app-icons.ts` import `swapVerticalOutline` from `ionicons/icons` (alphabetical position in the import list) and add `'swap-vertical-outline': swapVerticalOutline,` to `APP_ICONS`.

- [ ] **Step 2: Event** — next to `PANTRY_GROUPING_TOGGLED`: `PANTRY_SORT_CHANGED: 'pantry_sort_changed',`

- [ ] **Step 3: Texts**

```bash
node /tmp/i18n-set.js '{
 "es":{"pantry.sections.sort.label":"Ordenar","pantry.sections.sort.expiry":"Caduca antes","pantry.sections.sort.alpha":"Alfabético"},
 "en":{"pantry.sections.sort.label":"Sort","pantry.sections.sort.expiry":"Expiring first","pantry.sections.sort.alpha":"Alphabetical"},
 "de":{"pantry.sections.sort.label":"Sortieren","pantry.sections.sort.expiry":"Läuft zuerst ab","pantry.sections.sort.alpha":"Alphabetisch"},
 "fr":{"pantry.sections.sort.label":"Trier","pantry.sections.sort.expiry":"Expire en premier","pantry.sections.sort.alpha":"Alphabétique"},
 "it":{"pantry.sections.sort.label":"Ordina","pantry.sections.sort.expiry":"In scadenza prima","pantry.sections.sort.alpha":"Alfabetico"},
 "pt":{"pantry.sections.sort.label":"Ordenar","pantry.sections.sort.expiry":"Expira primeiro","pantry.sections.sort.alpha":"Alfabético"}
}'
```

- [ ] **Step 4: Facade** — in `PantryStateService`:
  - inject `private readonly actionSheetCtrl = inject(ActionSheetController);` (`import { ActionSheetController } from '@ionic/angular';`) if not already injected
  - add:

```ts
  readonly sortMode = this.pantryStore.sortMode;

  async openSortMenu(): Promise<void> {
    const current = this.sortMode();
    const option = (mode: PantrySortMode, key: string) => ({
      text: this.translate.instant(key),
      icon: current === mode ? 'checkmark-outline' : undefined,
      role: current === mode ? 'selected' : undefined,
      handler: () => this.changeSortMode(mode),
    });
    const sheet = await this.actionSheetCtrl.create({
      header: this.translate.instant('pantry.sections.sort.label'),
      buttons: [
        option('expiry', 'pantry.sections.sort.expiry'),
        option('alpha', 'pantry.sections.sort.alpha'),
        { role: 'cancel', text: this.translate.instant('common.actions.cancel') },
      ],
    });
    await sheet.present();
  }

  private changeSortMode(mode: PantrySortMode): void {
    if (this.sortMode() === mode) return;
    this.pantryStore.setSortMode(mode);
    this.analytics.track(ANALYTICS_EVENTS.PANTRY_SORT_CHANGED, { mode });
  }
```
  Check `checkmark-outline` exists in `APP_ICONS`; if not, register it like Step 1. Use the facade's existing `translate` field name (inspect the file; it may be `this.translate`).

- [ ] **Step 5: Template** — in `pantry.component.html`, inside `@if (!facade.pantryIsEmpty()) {` in the despensa header, add **before** the group toggle button:

```html
            <button
              class="pantry-section__add-btn pantry-section__sort-toggle"
              [attr.aria-label]="'pantry.sections.sort.label' | translate"
              (click)="facade.openSortMenu()">
              <ion-icon name="swap-vertical-outline"></ion-icon>
            </button>
```

- [ ] **Step 6: Checks** — `node scripts/check-icons.mjs && npx ng lint && npx ng test --watch=false --browsers=ChromeHeadless` — PASS.

- [ ] **Step 7: Browser check** — `npm start`; in the dev panel seed products with different dates (Ajustes → Dev → seed). Verify: default order is expiry-first in flat view **and** inside each group; switching to Alfabético re-sorts without a reload; reload keeps the choice; the button hides with an empty pantry.

- [ ] **Step 8: Commit**

```bash
git add src/app/app-icons.ts src/app/core/constants/analytics/events.constants.ts src/app/core/services/pantry/pantry-state.service.ts src/app/features/pantry/pantry.component.html src/assets/i18n
git commit -m "feat(pantry): sort control in the despensa header, expiry-first by default

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Inline empty state for Frescos

**Files:**
- Modify: `src/app/shared/components/empty-state/empty-state.component.ts`
- Modify: `src/app/shared/components/empty-state/empty-state.component.html`
- Modify: `src/app/shared/components/empty-state/empty-state.component.scss`
- Modify: `src/app/features/pantry/pantry.component.html:84-97`

- [ ] **Step 1: Input** — in the component class, after `compact`:

```ts
  /**
   * One line of secondary text, no icon, no card. The analytics event still
   * fires from ngOnInit — the reason this is a variant and not plain text.
   */
  @Input() inline = false;
```

- [ ] **Step 2: Template** — wrap the whole existing template:

```html
@if (inline) {
  <p class="empty-state-inline">{{ subtitle || (subtitleKey | translate) }}</p>
} @else {
  <!-- existing <div class="empty-state"> ... </div> unchanged -->
}
```

- [ ] **Step 3: Style** — append to the `.scss`:

```scss
.empty-state-inline {
  margin: 0;
  padding: var(--app-theme-spacing-xs) 0 var(--app-theme-spacing-sm);
  color: var(--ion-color-medium);
  font-size: 0.875rem;
  line-height: 1.4;
  white-space: normal; // the subtitle's "\n" reads as a space on one line
}
```

- [ ] **Step 4: Use it** — in both Frescos empty states (`pantry.fresh.emptyState.subtitle` and `pantry.fresh.empty.filters`) add `[inline]="true"`. Keep `subtitleKey` values unchanged (they are the analytics key).

- [ ] **Step 5: Browser check** in `es` and `de` (Ajustes → idioma): Frescos empty shows one grey line under the header; the `+` still opens the fresh add sheet. Lint + tests — PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/shared/components/empty-state src/app/features/pantry/pantry.component.html
git commit -m "feat(pantry): show the empty Fresh section as one line

A full card for an empty secondary section pushed the despensa down. The
empty state gains an inline variant so empty_state_shown keeps firing
with the same key as in 5.4.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Remove dead consume-modal code

**Files:**
- Modify: `src/app/core/services/pantry/modals/pantry-consume-modal-state.service.ts:65-76,81-88`
- Modify: `src/app/core/services/pantry/pantry-state.service.ts:310`

- [ ] **Step 1: Confirm no callers** — `grep -rn "closeConsumeModal\|consumeModal.close()" src/app` → only the definition in `pantry-state.service.ts:310`.
- [ ] **Step 2:** delete `close()` (lines 65-76) from the consume modal service, and delete `closeConsumeModal = () => this.consumeModal.close();` from `pantry-state.service.ts`.
- [ ] **Step 3:** in the `dismiss()` doc comment, replace the sentence about `close()` with: `The abandonment event lives here because this is the only close path the modal ever takes.`
- [ ] **Step 4: Lint + tests — PASS. Commit**

```bash
git add src/app/core/services/pantry
git commit -m "refactor(pantry): drop the consume modal's unreachable close()

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Shopping list — add by hand when empty; explain how it fills

**Files:**
- Modify: `src/app/features/list/list.component.html:25-49`
- Modify: `src/assets/i18n/*.json`

- [ ] **Step 1: Template** — restructure the top of the content so the add row sits outside the empty/non-empty branch:

```html
  @if (facade.loading()) {
    <!-- skeleton block unchanged -->
  } @else {
    <!-- Inline manual add row — always available, also on an empty list -->
    <button class="manual-add-row pressable" (click)="openManualAdd()">
      <ion-icon name="add-circle-outline" color="medium"></ion-icon>
      <span>{{ 'shopping.manualAdd.inlineHint' | translate }}</span>
    </button>

    @if (!state.summary.total && !state.allBoughtItems.length && !state.allIgnoredItems.length && !facade.manualItems().length) {
      <app-empty-state
        class="list-empty-state"
        icon="cart-outline"
        [titleKey]="'emptyStates.shopping.title'"
        [subtitleKey]="'shopping.emptyState.autoHint'">
      </app-empty-state>
    } @else {
      <div class="suggestion-groups fade-in-list">
        <!-- everything that was inside, minus the add row that moved up -->
      </div>
    }
  }
```
  Note `[subtitle]` → `[subtitleKey]`: with a pre-translated `[subtitle]`, `empty_state_shown` reported the generic key (`emptyStates.generic.subtitle`) — seen in the 2026-09-14 export. Keep the `@let state = ...` (or equivalent) declaration where it already is so `state` stays in scope; move it above the new `@else` if needed.

- [ ] **Step 2: Texts** — every product is born non-basic, so a new user's list is always empty; the old text ("they will appear automatically") was false for them.

```bash
node /tmp/i18n-set.js '{
 "es":{"emptyStates.shopping.title":"Tu lista está vacía","shopping.emptyState.autoHint":"Marca con ★ «Mantener siempre en casa» lo que no quieres que falte: volverá aquí solo cuando se acabe o baje del mínimo. O añade cualquier cosa a mano arriba."},
 "en":{"emptyStates.shopping.title":"Your list is empty","shopping.emptyState.autoHint":"Star ★ “Always keep at home” on what you never want to run out of: it will come back here on its own when it runs out or drops below its minimum. Or add anything by hand above."},
 "de":{"emptyStates.shopping.title":"Deine Liste ist leer","shopping.emptyState.autoHint":"Markiere mit ★ „Immer zuhause vorrätig halten“, was nie fehlen soll: Es kommt von selbst hierher zurück, wenn es aufgebraucht ist oder unter das Minimum fällt. Oder füge oben etwas von Hand hinzu."},
 "fr":{"emptyStates.shopping.title":"Ta liste est vide","shopping.emptyState.autoHint":"Marque d’une ★ « Toujours garder à la maison » ce qui ne doit jamais manquer : il reviendra ici tout seul quand il sera épuisé ou sous son minimum. Ou ajoute ce que tu veux à la main ci-dessus."},
 "it":{"emptyStates.shopping.title":"La tua lista è vuota","shopping.emptyState.autoHint":"Segna con ★ «Tenere sempre in casa» ciò che non deve mai mancare: tornerà qui da solo quando finisce o scende sotto il minimo. Oppure aggiungi qualsiasi cosa a mano qui sopra."},
 "pt":{"emptyStates.shopping.title":"A sua lista está vazia","shopping.emptyState.autoHint":"Marque com ★ «Manter sempre em casa» o que não pode faltar: voltará aqui sozinho quando acabar ou ficar abaixo do mínimo. Ou adicione o que quiser à mão acima."}
}'
```
  Before running, grep for other uses of `emptyStates.shopping.title` (`grep -rn "emptyStates.shopping" src/app`); if it is used outside the list, add a new key `shopping.emptyState.title` instead of changing the shared one.

- [ ] **Step 3: Browser check** — fresh profile (Ajustes → Dev → clear pantry): Lista shows the add row, the new title and text; adding a manual item works and the list switches to its normal layout. Lint + tests — PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/list/list.component.html src/assets/i18n
git commit -m "fix(list): allow adding items by hand on an empty list

The add row lived inside the non-empty branch, so an empty list offered no
way in. Every product is born non-basic, which means a new user's list is
always empty — 5 of 11 real new users opened this tab in their first
session. The empty state now explains both ways the list fills, and
reports its own key to analytics instead of the generic one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: `listRowActions(kind)`

**Files:**
- Create: `src/app/core/domain/list/list-row-actions.domain.ts`
- Create: `src/app/core/domain/list/list-row-actions.domain.spec.ts`
- Modify: `src/app/core/domain/list/index.ts`

- [ ] **Step 1: Failing spec**

```ts
import { listRowActions } from './list-row-actions.domain';

const actionsOf = (kind: Parameters<typeof listRowActions>[0]) => listRowActions(kind).map(a => a.action);

describe('listRowActions', () => {
  it('lets an automatic suggestion be hidden for now or stop being a staple', () => {
    expect(actionsOf('auto')).toEqual(['hide', 'unbasic']);
  });

  it('lets a manual item be removed, marked destructive', () => {
    expect(listRowActions('manual')).toEqual([{ action: 'remove', destructive: true }]);
  });

  it('lets a bought item go back to the list', () => {
    expect(actionsOf('bought')).toEqual(['restore']);
  });

  it('gives hidden items a way back — they had none before', () => {
    expect(actionsOf('hidden')).toEqual(['unhide', 'unbasic']);
  });

  it('marks nothing but removal as destructive', () => {
    const all = (['auto', 'manual', 'bought', 'hidden'] as const).flatMap(k => listRowActions(k));
    expect(all.filter(a => a.destructive).map(a => a.action)).toEqual(['remove']);
  });
});
```

- [ ] **Step 2: Run — FAIL.** `--include='src/app/core/domain/list/list-row-actions.domain.spec.ts'`

- [ ] **Step 3: Implement**

```ts
/**
 * The shopping list has one interaction rule: a row's button is its primary
 * action (buy), tapping the row opens a menu with the rest. This table is the
 * only place that decides what that menu holds. It replaced three swipe
 * gestures in two directions and a hidden section with no way back.
 */
export type ListRowKind = 'auto' | 'manual' | 'bought' | 'hidden';
export type ListRowAction = 'hide' | 'unbasic' | 'remove' | 'restore' | 'unhide';

export interface ListRowActionSpec {
  action: ListRowAction;
  destructive: boolean;
}

const ROW_ACTIONS: Record<ListRowKind, readonly ListRowActionSpec[]> = {
  auto: [
    { action: 'hide', destructive: false },
    { action: 'unbasic', destructive: false },
  ],
  manual: [{ action: 'remove', destructive: true }],
  bought: [{ action: 'restore', destructive: false }],
  hidden: [
    { action: 'unhide', destructive: false },
    { action: 'unbasic', destructive: false },
  ],
};

export function listRowActions(kind: ListRowKind): readonly ListRowActionSpec[] {
  return ROW_ACTIONS[kind];
}
```
Add `export * from './list-row-actions.domain';` to `src/app/core/domain/list/index.ts`.

- [ ] **Step 4: Run — PASS. Commit**

```bash
git add src/app/core/domain/list
git commit -m "feat(list): define shopping-row actions in one domain table

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 15: `ToastService.withAction`

**Files:**
- Modify: `src/app/core/services/shared/toast.service.ts`

- [ ] **Step 1: Implement** — add to `DURATION`: `action: 5000,` and to the class:

```ts
  /**
   * A toast with one action button (e.g. "Undo"). Longer than the others:
   * the user has to read it and decide.
   */
  withAction(
    key: string,
    actionKey: string,
    onAction: () => void,
    params?: Record<string, unknown>,
  ): void {
    void this.presentWithAction(
      this.translate.instant(key, params),
      this.translate.instant(actionKey),
      onAction,
    );
  }

  private async presentWithAction(message: string, actionText: string, onAction: () => void): Promise<void> {
    try {
      const toast = await this.toastCtrl.create({
        message,
        duration: DURATION.action,
        position: 'bottom',
        buttons: [{ text: actionText, handler: () => { onAction(); } }],
      });
      await toast.present();
    } catch (err) {
      this.logger.warn('ToastService', 'Failed to present action toast', { err: String(err) });
    }
  }
```

- [ ] **Step 2: Lint + tests — PASS. Commit**

```bash
git add src/app/core/services/shared/toast.service.ts
git commit -m "feat(shared): toasts with an action button

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 16: List state — row menu, "no longer keep at home", unhide

**Files:**
- Modify: `src/app/core/constants/analytics/events.constants.ts`
- Modify: `src/app/core/services/list/list-state.service.ts`
- Modify: `src/assets/i18n/*.json`

- [ ] **Step 1: Events** — next to `SHOPPING_ITEM_REMOVED`:

```ts
  /** Row tapped → action menu shown. If nobody opens it, discoverability is the problem. */
  SHOPPING_ROW_MENU_OPENED: 'shopping_row_menu_opened',
  SHOPPING_BASIC_REMOVED: 'shopping_basic_removed',
  SHOPPING_BASIC_RESTORED: 'shopping_basic_restored',
```

- [ ] **Step 2: Texts** (the app never says "basic" to users; the star is "Always keep at home")

```bash
node /tmp/i18n-set.js '{
 "es":{"shopping.rowMenu.hide":"Ocultar por ahora","shopping.rowMenu.unbasic":"Ya no mantener siempre en casa","shopping.rowMenu.remove":"Quitar de la lista","shopping.rowMenu.restore":"Devolver a la lista","shopping.rowMenu.unhide":"Volver a mostrar","shopping.toasts.unbasic":"{{name}} ya no se añadirá a la lista automáticamente.","common.actions.undo":"Deshacer"},
 "en":{"shopping.rowMenu.hide":"Hide for now","shopping.rowMenu.unbasic":"Stop always keeping at home","shopping.rowMenu.remove":"Remove from list","shopping.rowMenu.restore":"Put back on the list","shopping.rowMenu.unhide":"Show again","shopping.toasts.unbasic":"{{name}} won’t be added to your list automatically anymore.","common.actions.undo":"Undo"},
 "de":{"shopping.rowMenu.hide":"Vorerst ausblenden","shopping.rowMenu.unbasic":"Nicht mehr immer vorrätig halten","shopping.rowMenu.remove":"Von der Liste entfernen","shopping.rowMenu.restore":"Zurück auf die Liste","shopping.rowMenu.unhide":"Wieder anzeigen","shopping.toasts.unbasic":"{{name}} wird nicht mehr automatisch zur Liste hinzugefügt.","common.actions.undo":"Rückgängig"},
 "fr":{"shopping.rowMenu.hide":"Masquer pour l’instant","shopping.rowMenu.unbasic":"Ne plus toujours garder à la maison","shopping.rowMenu.remove":"Retirer de la liste","shopping.rowMenu.restore":"Remettre dans la liste","shopping.rowMenu.unhide":"Afficher à nouveau","shopping.toasts.unbasic":"{{name}} ne sera plus ajouté automatiquement à ta liste.","common.actions.undo":"Annuler"},
 "it":{"shopping.rowMenu.hide":"Nascondi per ora","shopping.rowMenu.unbasic":"Non tenere più sempre in casa","shopping.rowMenu.remove":"Rimuovi dalla lista","shopping.rowMenu.restore":"Rimetti nella lista","shopping.rowMenu.unhide":"Mostra di nuovo","shopping.toasts.unbasic":"{{name}} non verrà più aggiunto automaticamente alla lista.","common.actions.undo":"Annulla"},
 "pt":{"shopping.rowMenu.hide":"Ocultar por agora","shopping.rowMenu.unbasic":"Deixar de manter sempre em casa","shopping.rowMenu.remove":"Remover da lista","shopping.rowMenu.restore":"Voltar a pôr na lista","shopping.rowMenu.unhide":"Mostrar novamente","shopping.toasts.unbasic":"{{name}} não será mais adicionado automaticamente à sua lista.","common.actions.undo":"Desfazer"}
}'
```

- [ ] **Step 3: State** — in `ListStateService`:
  - imports: `import { listRowActions, type ListRowAction, type ListRowKind } from '@core/domain/list';` and `import { setBasic, sumQuantities } from '@core/domain/pantry';`
  - add after `removeManualItem`:

```ts
  private static readonly ROW_ACTION_LABELS: Record<ListRowAction, string> = {
    hide: 'shopping.rowMenu.hide',
    unbasic: 'shopping.rowMenu.unbasic',
    remove: 'shopping.rowMenu.remove',
    restore: 'shopping.rowMenu.restore',
    unhide: 'shopping.rowMenu.unhide',
  };

  private static readonly ROW_ACTION_ICONS: Record<ListRowAction, string> = {
    hide: 'eye-off-outline',
    unbasic: 'star-outline',
    remove: 'trash-outline',
    restore: 'arrow-undo-outline',
    unhide: 'eye-outline',
  };

  async openRowActions(row: { kind: ListRowKind; id: string; name: string }): Promise<void> {
    this.analytics.track(ANALYTICS_EVENTS.SHOPPING_ROW_MENU_OPENED, { kind: row.kind });
    const sheet = await this.actionSheetCtrl.create({
      header: row.name,
      buttons: [
        ...listRowActions(row.kind).map(spec => ({
          text: this.translate.instant(ListStateService.ROW_ACTION_LABELS[spec.action]),
          icon: ListStateService.ROW_ACTION_ICONS[spec.action],
          role: spec.destructive ? 'destructive' : undefined,
          handler: () => { void this.runRowAction(spec.action, row); },
        })),
        { role: 'cancel', text: this.translate.instant('common.actions.cancel') },
      ],
    });
    await sheet.present();
  }

  private async runRowAction(action: ListRowAction, row: { kind: ListRowKind; id: string }): Promise<void> {
    switch (action) {
      case 'hide': this.removeAutoItem(row.id); return;
      case 'unbasic': await this.unbasicItem(row.id, row.kind); return;
      case 'remove': this.removeManualItem(row.id); return;
      case 'restore': this.restoreFromBought(row.id); return;
      case 'unhide': this.unhideAutoItem(row.id); return;
    }
  }

  unhideAutoItem(id: string): void {
    this.removedAutoIds.update(set => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
  }

  /**
   * "Always keep at home" off, from the list. A depleted despensa product is
   * hidden from the pantry screen, so the list is the only place it can be
   * un-starred. After this it appears nowhere until added again — hence undo.
   */
  async unbasicItem(id: string, from: ListRowKind): Promise<void> {
    const item = this.items().find(i => i._id === id);
    if (!item) return;
    const previousMin = item.minThreshold;
    await this.pantryStore.updateItem(setBasic(item, false, new Date().toISOString()));
    this.unhideAutoItem(id);
    this.analytics.track(ANALYTICS_EVENTS.SHOPPING_BASIC_REMOVED, {
      kind: item.productType === 'fresh' ? 'fresh' : 'despensa',
      from,
      depleted: sumQuantities(item.batches ?? []) <= 0,
    });
    this.toast.withAction(
      'shopping.toasts.unbasic',
      'common.actions.undo',
      () => { void this.restoreBasic(id, previousMin); },
      { name: item.name },
    );
  }

  private async restoreBasic(id: string, previousMin: number | undefined): Promise<void> {
    const current = this.items().find(i => i._id === id);
    if (!current) return;
    await this.pantryStore.updateItem(setBasic(current, true, new Date().toISOString(), previousMin));
    this.analytics.track(ANALYTICS_EVENTS.SHOPPING_BASIC_RESTORED);
  }
```
  - in `removeAutoItem` and `removeManualItem`, add `surface: 'menu'` to the existing `SHOPPING_ITEM_REMOVED` payloads (`{ source: 'auto', surface: 'menu' }` / `{ source: 'manual', surface: 'menu' }`).
  - update the `removedAutoIds` comment: `// Ephemeral per-visit state — cleared on ionViewWillLeave ("hide for now" means this visit).`

- [ ] **Step 4: Lint + tests — PASS. Commit**

```bash
git add src/app/core/constants/analytics/events.constants.ts src/app/core/services/list/list-state.service.ts src/assets/i18n
git commit -m "feat(list): row action menu with 'no longer keep at home' and unhide

A depleted product was only visible on the list, and the list had no way
to un-star it — the only exit was buying it and deleting it. The action
reuses setBasic, clears the minimum like the pantry star, and offers undo
because afterwards the product appears nowhere. Hidden items can finally
be shown again.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 17: List template — tap rows, no swipe

**Files:**
- Modify: `src/app/features/list/list.component.html`
- Modify: `src/app/features/list/list.component.ts`
- Modify: `src/app/core/services/retention/coach-mark-state.service.ts:6`

- [ ] **Step 1: Auto suggestion rows** — replace each `<ion-item-sliding ...> <ion-item ...> ... </ion-item> <ion-item-options>...</ion-item-options> </ion-item-sliding>` for suggestions with:

```html
                  <ion-item
                    detail="false"
                    class="suggestion-item pressable"
                    [class.suggestion-item--exiting]="isExiting(suggestion.item._id)"
                    (click)="facade.openRowActions({ kind: 'auto', id: suggestion.item._id, name: suggestion.item.name })">
                    <!-- item-body unchanged -->
                    <ion-button
                      slot="end"
                      fill="solid"
                      [color]="(suggestion.reason === 'fresh-empty' || suggestion.reason === 'fresh-low') ? 'success' : 'primary'"
                      shape="round"
                      class="buy-btn"
                      (click)="$event.stopPropagation(); onBuyTap(suggestion)">
                      <!-- icon unchanged -->
                    </ion-button>
                  </ion-item>
```
  The `suggestion-item--exiting` class moves from the sliding wrapper to the item; check `list.component.scss` and move the selector if it targets `ion-item-sliding`.

- [ ] **Step 2: Manual rows** (both places: inside supermarket groups and the synthetic unassigned group) — drop the sliding wrapper and options; the item becomes:

```html
                  <ion-item
                    detail="false"
                    class="suggestion-item pressable"
                    (click)="facade.openRowActions({ kind: 'manual', id: manual.id, name: manual.name })">
                    <!-- item-body unchanged -->
                    <ion-button slot="end" fill="solid" color="primary" shape="round" class="buy-btn"
                      (click)="$event.stopPropagation(); buySheet.openSheetForManual(manual.id, manual.name)">
                      <ion-icon slot="icon-only" name="cart-outline"></ion-icon>
                    </ion-button>
                  </ion-item>
```

- [ ] **Step 3: Bought rows**

```html
                <ion-item
                  class="bought-item pressable"
                  detail="false"
                  (click)="facade.openRowActions({ kind: 'bought', id: bought.id, name: bought.name })">
                  <ion-icon slot="start" name="checkmark-circle" color="success"></ion-icon>
                  <span class="item-name bought-name">{{ bought.name }}</span>
                </ion-item>
```

- [ ] **Step 4: Hidden rows**

```html
                <ion-item
                  detail="false"
                  class="ignored-item pressable"
                  (click)="facade.openRowActions({ kind: 'hidden', id: ignored.id, name: ignored.name })">
                  <ion-icon slot="start" name="eye-off-outline" color="medium"></ion-icon>
                  <span class="item-name ignored-name">{{ ignored.name }}</span>
                </ion-item>
```

- [ ] **Step 5: Component class** — in `list.component.ts`:
  - remove `IonItemSliding, IonItemOptions, IonItemOption` from both the import and `imports: [...]`
  - remove `QueryList, ViewChildren` from the Angular import, the `@ViewChildren(IonItemSliding) slidingItems` field, `ionViewDidEnter()`, `maybeShowSwipeHint()`, and the `coachMark` injection + its import if nothing else uses it.

- [ ] **Step 6: Coach mark key** — in `coach-mark-state.service.ts`: `export type CoachMarkKey = 'add_first_item' | 'pantry:star';` (the stored `coachMark:list:swipe` flag becomes harmless dead data).

- [ ] **Step 7: Checks** — `grep -n "ion-item-sliding\|ion-item-option" src/app/features/list/list.component.html` → nothing. `node scripts/check-icons.mjs && npx ng lint && npx ng test --watch=false --browsers=ChromeHeadless` — PASS.

- [ ] **Step 8: Browser check** (`npm start`, seed via dev panel, mark two products as "Mantener siempre en casa" and consume them to 0):
  - tapping the cart buys (despensa: sheet; fresh: direct) and does **not** open the menu;
  - tapping a suggestion row → menu with Ocultar por ahora / Ya no mantener siempre en casa / Cancelar;
  - "Ya no mantener…" removes it; the toast shows Deshacer; Deshacer brings it back with its minimum (check the edit modal);
  - "Ocultar por ahora" moves it to Ocultos; tapping it there → Volver a mostrar works;
  - manual row → Quitar de la lista (red); bought row → Devolver a la lista;
  - no row can be swiped; no console errors.

- [ ] **Step 9: Commit**

```bash
git add src/app/features/list src/app/core/services/retention/coach-mark-state.service.ts
git commit -m "feat(list): one interaction rule — button buys, tapping the row opens a menu

The list used three swipe gestures in two directions, and the hidden
section had no way back. Every row now opens its action menu on tap;
the buy button keeps its behaviour and stops the tap from reaching the
row. The swipe coach mark goes with the swipes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 18: Release verification

- [ ] **Step 1: CI parity** — `npx ng lint && node scripts/check-icons.mjs && npx ng test --watch=false --browsers=ChromeHeadless && npx ng build --configuration production` — all PASS. Push `release/5.5` and confirm the GitHub Actions run is green.
- [ ] **Step 2: Version bump** — `android/app/build.gradle`: `versionCode 63`, `versionName "5.5"`; the app's displayed version constant (grep for `'5.4'` in `src/` and `package.json`) → `5.5`. Commit `chore(release): 5.5 (versionCode 63)`.
- [ ] **Step 3: Device QA (Fernando, APK from Android Studio)** — the lesson from 5.3: CI green is not done.
  - PostHog person for this device: `install_source = sideload`.
  - Dev panel → fire a notification, leave it in the tray, background and reopen → `notification_delivered_seen` with its id.
  - Despensa: expiry-first by default, switch to alphabetical, relaunch keeps it; grouped view ordered inside groups.
  - Frescos empty: one line. Consume modal still opens and closes.
  - Lista: empty list shows add row + new text; row menus as in Task 17 Step 8.
  - Onboarding, delete-with-stock dialog and ticket scan still work.
- [ ] **Step 4: Play internal testing track** — upload the AAB there first; install from Play on a device; PostHog shows `install_source = play`. Only then promote to production.
- [ ] **Step 5: Memory** — update `project_55_plan.md` and `project_release_history.md` in the project memory with what shipped and what was verified.
