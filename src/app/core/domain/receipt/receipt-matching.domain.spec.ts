import {
  MATCH_AUTO_THRESHOLD,
  MATCH_SUGGEST_THRESHOLD,
  matchReceiptName,
  type MatchCandidate,
} from './receipt-matching.domain';

/**
 * The receipt matcher decides which pantry product a scanned line refers to.
 * Getting it wrong is not cosmetic: a false match adds a lot to the wrong
 * product, and a score above MATCH_AUTO_THRESHOLD is pre-selected in the review
 * sheet, so the user has to notice and undo it rather than opt in.
 */
describe('matchReceiptName', () => {
  const candidates = (...names: string[]): MatchCandidate[] =>
    names.map((name, i) => ({ id: `id-${i}`, name }));

  const scoreFor = (raw: string, ...names: string[]): number =>
    matchReceiptName(raw, candidates(...names))?.score ?? 0;

  describe('the cases receipts actually produce', () => {
    it('matches a line that is identical bar casing and accents', () => {
      const result = matchReceiptName('ATUN', candidates('Atún'));
      expect(result?.name).toBe('Atún');
      expect(result!.score).toBeGreaterThanOrEqual(MATCH_AUTO_THRESHOLD);
    });

    it('matches a truncated word back to the full one', () => {
      // Receipts cut words off: "AGUACAT" for aguacate.
      expect(scoreFor('AGUACAT', 'Aguacate')).toBeGreaterThanOrEqual(MATCH_AUTO_THRESHOLD);
    });

    it('matches an abbreviated multi-word line', () => {
      // The case the matcher was designed around.
      expect(scoreFor('PECH POLLO FIL', 'Pechuga de pollo'))
        .toBeGreaterThanOrEqual(MATCH_AUTO_THRESHOLD);
    });

    it('matches through a single garbled character', () => {
      // OCR swaps letters; tokens of 5+ tolerate one edit.
      expect(scoreFor('NATURAI', 'Natural')).toBeGreaterThanOrEqual(MATCH_SUGGEST_THRESHOLD);
    });

    it('tolerates a plural on either side', () => {
      expect(scoreFor('TOMATE', 'Tomates')).toBeGreaterThanOrEqual(MATCH_AUTO_THRESHOLD);
      expect(scoreFor('TOMATES', 'Tomate')).toBeGreaterThanOrEqual(MATCH_AUTO_THRESHOLD);
    });

    it('picks the strongest candidate, not the first that clears the bar', () => {
      const result = matchReceiptName('LECHE ENTERA', candidates('Leche', 'Leche entera', 'Leche desnatada'));
      expect(result?.name).toBe('Leche entera');
    });
  });

  describe('the cases it must refuse', () => {
    it('returns null when there are no candidates', () => {
      expect(matchReceiptName('LECHE', [])).toBeNull();
    });

    it('returns null when the line has no usable tokens', () => {
      // Tokens under 3 characters and bare numbers are dropped as OCR debris.
      expect(matchReceiptName('2 x 1', candidates('Leche'))).toBeNull();
      expect(matchReceiptName('', candidates('Leche'))).toBeNull();
    });

    it('does not match two unrelated products', () => {
      expect(matchReceiptName('DETERGENTE', candidates('Leche'))).toBeNull();
    });

    it('does not match on a shared stem alone', () => {
      // "leche"/"lechuga" and "aceite"/"aceitunas" share a stem but diverge
      // before either is a prefix of the other, which is what keeps them apart.
      expect(matchReceiptName('LECHE', candidates('Lechuga'))).toBeNull();
      expect(matchReceiptName('ACEITE', candidates('Aceitunas'))).toBeNull();
      expect(matchReceiptName('QUESO', candidates('Quesadillas'))).toBeNull();
    });

    it('ignores a candidate with no usable tokens of its own', () => {
      expect(matchReceiptName('LECHE', candidates('12', 'a'))).toBeNull();
    });
  });

  describe('KNOWN DEFECT — a short token that prefixes a longer name scores a perfect match', () => {
    // tokensMatch() treats any 3+ character prefix as a whole-token hit, so a
    // short receipt line scores 1.00 against a much longer product name and is
    // AUTO-SELECTED in the review sheet. Buying salt with sausages in the pantry
    // adds a lot of sausages.
    //
    // These assertions pin the CURRENT behaviour so a fix has to change them
    // deliberately rather than by accident. The fix is to weight a prefix hit by
    // how much of the longer token it covers instead of counting it in full —
    // it needs re-checking against real receipts from the chains this was tuned
    // on before it can land.
    const falsePositives: [string, string][] = [
      ['SAL', 'Salchichas'],
      ['PAN', 'Panga'],
      ['CREMA', 'Cremallera'],
      ['LIMON', 'Limonada'],
    ];

    for (const [line, product] of falsePositives) {
      it(`still auto-selects "${product}" for the line "${line}"`, () => {
        expect(scoreFor(line, product)).toBeGreaterThanOrEqual(MATCH_AUTO_THRESHOLD);
      });
    }

    it('does not let the exact match win — the tie goes to catalog order', () => {
      // Worse than it first looks. An exact hit and a loose prefix hit both
      // score 1.00, and the search keeps a candidate only on `score > best`, so
      // ties fall to whichever the pantry happens to list first. Owning "Sal"
      // does not protect you from the line "SAL" landing on "Salchichas".
      expect(matchReceiptName('SAL', candidates('Salchichas', 'Sal'))?.name).toBe('Salchichas');
      expect(matchReceiptName('SAL', candidates('Sal', 'Salchichas'))?.name).toBe('Sal');
    });
  });

  describe('thresholds', () => {
    it('keeps suggest below auto so there is a band that only suggests', () => {
      expect(MATCH_SUGGEST_THRESHOLD).toBeLessThan(MATCH_AUTO_THRESHOLD);
    });

    it('never returns a match below the suggest threshold', () => {
      const result = matchReceiptName('PAPEL HIGIENICO', candidates('Leche entera desnatada'));
      expect(result === null || result.score >= MATCH_SUGGEST_THRESHOLD).toBe(true);
    });
  });
});
