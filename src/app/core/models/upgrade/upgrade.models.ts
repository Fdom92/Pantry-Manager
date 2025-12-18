import { PACKAGE_TYPE } from "@revenuecat/purchases-capacitor";

export interface PlanViewModel {
  id: string;
  type: PACKAGE_TYPE;
  title: string;
  subtitle: string;
  price: string;
  period: string;
  badge?: string | null;
  savings?: string | null;
  trialLabel?: string | null;
  ctaLabel: string;
  benefits: string[];
  highlight: boolean;
}
