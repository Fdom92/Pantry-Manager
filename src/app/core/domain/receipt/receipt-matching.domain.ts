import { normalizeSearchQuery } from '@core/utils/normalization.util';

export interface MatchCandidate {
  id: string;
  name: string;
}

export interface MatchResult {
  id: string;
  name: string;
  /** 0..1 — share of receipt tokens matched against the candidate name. */
  score: number;
}

/** Score above which a match is trusted enough to pre-select in the review UI. */
export const MATCH_AUTO_THRESHOLD = 0.72;
/** Score above which a match is offered as a suggestion. */
export const MATCH_SUGGEST_THRESHOLD = 0.45;

/**
 * Fuzzy-match a receipt line name against catalog/pantry names.
 *
 * Receipts truncate ("CARNICERIA CA"), abbreviate ("PECH POLLO FIL") and the
 * OCR garbles characters ("AGiUALATE"), so matching is token-based with
 * prefix tolerance instead of exact string comparison.
 */
export function matchReceiptName(rawName: string, candidates: MatchCandidate[]): MatchResult | null {
  const receiptTokens = tokenize(rawName);
  if (!receiptTokens.length) return null;

  let best: MatchResult | null = null;
  for (const candidate of candidates) {
    const candidateTokens = tokenize(candidate.name);
    if (!candidateTokens.length) continue;

    const score = scoreTokens(receiptTokens, candidateTokens);
    if (score > (best?.score ?? 0)) {
      best = { id: candidate.id, name: candidate.name, score };
    }
  }

  return best && best.score >= MATCH_SUGGEST_THRESHOLD ? best : null;
}

function scoreTokens(receiptTokens: string[], candidateTokens: string[]): number {
  let matched = 0;
  const used = new Set<number>();

  for (const rt of receiptTokens) {
    for (let i = 0; i < candidateTokens.length; i++) {
      if (used.has(i)) continue;
      if (tokensMatch(rt, candidateTokens[i])) {
        matched++;
        used.add(i);
        break;
      }
    }
  }

  // Weight by both sides: all receipt tokens matching a 10-word candidate is
  // weaker evidence than a full mutual match.
  const receiptCoverage = matched / receiptTokens.length;
  const candidateCoverage = matched / candidateTokens.length;
  let score = receiptCoverage * 0.7 + candidateCoverage * 0.3;

  // First-token agreement is a strong signal on receipts (brand/type first).
  if (tokensMatch(receiptTokens[0], candidateTokens[0])) {
    score = Math.min(1, score + 0.1);
  }
  return score;
}

/**
 * Equal, prefix of one another (receipts truncate words), or 1 edit apart
 * for longer tokens (OCR garbles characters: "hatural" ≈ "natural").
 */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const min = Math.min(a.length, b.length);
  if (min < 3) return false;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  return min >= 5 && withinOneEdit(a, b);
}

/** Levenshtein distance ≤ 1, O(n) two-pointer check. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function tokenize(value: string): string[] {
  return normalizeSearchQuery(value)
    .split(/[^a-z0-9ñç]+/i)
    // Min 3 chars: drops stopwords (de, la, du, di...) and OCR debris that
    // would otherwise dilute the coverage score.
    .filter(t => t.length >= 3 && !/^\d+$/.test(t));
}
