const FALLBACK_PREFIX = 'id';

function randomBase36(length: number): string {
  let result = '';
  while (result.length < length) {
    result += Math.random().toString(36).slice(2);
  }
  return result.slice(0, length);
}

export function createDocumentId(prefix: string = FALLBACK_PREFIX): string {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : randomBase36(24);

  return `${prefix}:${id}`;
}
