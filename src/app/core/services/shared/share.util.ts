import type { ShareOutcome } from './share.service';

export function shouldSkipShareOutcome(outcome: ShareOutcome): boolean {
  return outcome === 'shared' || outcome === 'cancelled';
}
