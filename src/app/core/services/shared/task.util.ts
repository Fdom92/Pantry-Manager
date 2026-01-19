import { DestroyRef } from '@angular/core';

export interface LatestOnlyRunner {
  run<T>(fn: (isActive: () => boolean) => Promise<T>): Promise<T | undefined>;
  cancel(): void;
  isDestroyed(): boolean;
}

/**
 * Runs async tasks in "latest-only" mode and cancels everything on destroy.
 * Useful to avoid late UI updates (toasts, navigation, signal updates) after route changes.
 */
export function createLatestOnlyRunner(destroyRef: DestroyRef): LatestOnlyRunner {
  let token = 0;
  let destroyed = false;

  const cancel = () => {
    token += 1;
  };

  destroyRef.onDestroy(() => {
    destroyed = true;
    cancel();
  });

  return {
    isDestroyed: () => destroyed,
    cancel,
    run: async <T>(fn: (isActive: () => boolean) => Promise<T>): Promise<T | undefined> => {
      const current = ++token;
      const isActive = () => !destroyed && current === token;
      const result = await fn(isActive);
      return isActive() ? result : undefined;
    },
  };
}
