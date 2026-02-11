import { PACKAGE_TYPE } from '@revenuecat/purchases-capacitor';

// INTERFACES
export interface PlanViewModel {
  id: string;
  type: PACKAGE_TYPE;
  title: string;
  subtitle: string;
  price: string;
  periodLabel: string;
  badgeLabel?: string | null;
  savingsLabel?: string | null;
  trialLabel?: string | null;
  ctaLabel: string;
  benefits: string[];
  highlight: boolean;
}
// TYPES
export type PlanTrialMeta =
  | { kind: 'free' }
  | { kind: 'discount'; price: string; cycles: number };

export type PlanMeta = {
  id: string;
  type: PACKAGE_TYPE;
  titleKey: string;
  subtitle: string;
  price: string;
  periodKey: 'upgrade.plans.perYear' | 'upgrade.plans.perMonth';
  badgeKey?: string;
  savingsPercent?: number | null;
  trial: PlanTrialMeta | null;
  ctaKey: 'upgrade.actions.startTrial' | 'upgrade.actions.select';
  benefitsKeys: string[];
  highlight: boolean;
};
