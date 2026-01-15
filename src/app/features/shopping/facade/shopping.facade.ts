import { Injectable, inject } from '@angular/core';
import type { MeasurementUnit } from '@core/models/shared';
import type { ShoppingReason, ShoppingSuggestionWithItem } from '@core/models/shopping';
import { ShoppingStateService } from '@core/services/shopping';

@Injectable()
export class ShoppingFacade {
  private readonly state = inject(ShoppingStateService);

  readonly loading = this.state.loading;
  readonly isSummaryExpanded = this.state.isSummaryExpanded;
  readonly processingSuggestionIds = this.state.processingSuggestionIds;
  readonly isSharingListInProgress = this.state.isSharingListInProgress;
  readonly shoppingAnalysis = this.state.shoppingAnalysis;

  // Purchase modal
  readonly isPurchaseModalOpen = this.state.isPurchaseModalOpen;
  readonly purchaseTarget = this.state.purchaseTarget;

  async ionViewWillEnter(): Promise<void> {
    await this.state.ionViewWillEnter();
  }

  toggleSummaryCard(): void {
    this.state.toggleSummaryCard();
  }

  isSuggestionProcessing(id: string | undefined): boolean {
    return this.state.isSuggestionProcessing(id);
  }

  openPurchaseModalForSuggestion(suggestion: ShoppingSuggestionWithItem): void {
    this.state.openPurchaseModalForSuggestion(suggestion);
  }

  closePurchaseModal(): void {
    this.state.closePurchaseModal();
  }

  async confirmPurchaseForTarget(payload: { quantity: number; expiryDate?: string | null; location: string }): Promise<void> {
    await this.state.confirmPurchaseForTarget(payload);
  }

  getBadgeColorByReason(reason: ShoppingReason): string {
    return this.state.getBadgeColorByReason(reason);
  }

  getUnitLabel(unit: MeasurementUnit | string): string {
    return this.state.getUnitLabel(unit);
  }

  getLocationLabel(locationId: string): string {
    return this.state.getLocationLabel(locationId);
  }

  getSuggestionTrackId(suggestion: ShoppingSuggestionWithItem): string {
    return this.state.getSuggestionTrackId(suggestion);
  }

  async shareShoppingListReport(): Promise<void> {
    await this.state.shareShoppingListReport();
  }
}
