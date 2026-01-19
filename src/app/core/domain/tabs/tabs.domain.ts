export function computeCanUseAgent(isPro: boolean, isProduction: boolean): boolean {
  return !isProduction || isPro;
}

