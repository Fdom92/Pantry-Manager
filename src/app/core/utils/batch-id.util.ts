/**
 * Generates a unique batch ID using timestamp and random string.
 * Format: batch:{timestamp36}-{random6chars}
 * Example: batch:l3k2mn9-a4b7c2
 */
export function generateBatchId(): string {
  return `batch:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
