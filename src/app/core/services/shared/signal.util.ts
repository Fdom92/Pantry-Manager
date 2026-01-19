import type { WritableSignal } from '@angular/core';

export async function withSignalFlag<T>(
  flag: WritableSignal<boolean>,
  run: () => Promise<T>,
): Promise<T> {
  flag.set(true);
  try {
    return await run();
  } finally {
    flag.set(false);
  }
}

