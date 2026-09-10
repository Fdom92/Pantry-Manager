/**
 * Telling a native sheet the user dismissed apart from one that broke.
 *
 * Capacitor plugins that put up a system UI — the camera/gallery picker, the
 * share sheet — reject the same way whether the user backed out or the plugin
 * failed. Both call sites here used to catch that rejection and return in
 * silence, and production showed the cost: the receipt scanner logged 11 starts
 * by 6 users with 0 completions and 0 failures, and QA found "share as text"
 * doing nothing at all. A real cancellation and a dead plugin were
 * indistinguishable to the app, to Sentry, and to us.
 *
 * There is no stable error code for cancellation, only a message, so this is a
 * heuristic — and it is deliberately biased: anything not positively recognised
 * as a cancellation counts as a failure. A stray Sentry event costs nothing; a
 * silent failure already cost a whole feature.
 */
export type NativeDismissal = 'cancelled' | 'failed';

/** Substrings Capacitor uses when the user backs out of a native sheet. */
const CANCELLATION_MARKERS = ['cancel', 'no image picked'];

export function classifyNativeDismissal(error: unknown): NativeDismissal {
  const message = extractMessage(error).toLowerCase();
  if (!message) {
    return 'failed';
  }
  return CANCELLATION_MARKERS.some(marker => message.includes(marker))
    ? 'cancelled'
    : 'failed';
}

function extractMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const { message } = error as { message: unknown };
    return typeof message === 'string' ? message : '';
  }
  return '';
}
