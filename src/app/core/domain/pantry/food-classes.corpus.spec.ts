import { FOOD_CLASS_CORPUS } from './food-classes.corpus';
import { FOOD_CLASS_BY_KEY } from './food-classes.data';
import { matchFoodClass } from './food-class-resolution.domain';

const GOAL = 0.9;

describe('FOOD_CLASS_CORPUS coverage', () => {
  it('names only classes that exist', () => {
    const unknown = [...new Set(FOOD_CLASS_CORPUS.map((e) => e.classKey))].filter((k) => !FOOD_CLASS_BY_KEY.has(k));
    expect(unknown).toEqual([]);
  });

  it(`recognises at least ${GOAL * 100} % of the corpus with the right class`, () => {
    const misses = FOOD_CLASS_CORPUS.filter((e) => matchFoodClass(e.name)?.key !== e.classKey).map(
      (e) => `${e.name} → ${matchFoodClass(e.name)?.key ?? 'null'} / ${e.classKey}`,
    );
    const hit = 1 - misses.length / FOOD_CLASS_CORPUS.length;
    const summary = `${(hit * 100).toFixed(1)} % of ${FOOD_CLASS_CORPUS.length}; misses:\n${misses.join('\n')}`;
    if (hit < GOAL) fail(summary); // a matcher message may truncate; fail() keeps the full list
    expect(hit).toBeGreaterThanOrEqual(GOAL);
  });
});
