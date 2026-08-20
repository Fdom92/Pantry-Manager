/**
 * Exhaustiveness guard for switches over a union or enum.
 *
 * Listing every case and ending with this makes TypeScript reject the call the
 * moment a new member is added, pointing at each switch that has not decided
 * what to do about it. Without it a `default` branch absorbs the new member
 * silently — which is how a new FoodType would have inherited strict expiry
 * and the fallback icon without anyone noticing.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
