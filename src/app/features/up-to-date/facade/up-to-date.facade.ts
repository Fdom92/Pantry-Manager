import { Injectable, inject } from '@angular/core';
import type { InsightPendingReviewProduct, PantryItem } from '@core/models';
import type { UpToDateReason } from '@core/models/up-to-date';
import { UpToDateStateService } from '@core/services/up-to-date';

@Injectable()
export class UpToDateFacade {
  private readonly state = inject(UpToDateStateService);

  // Signals/computed
  readonly isLoading = this.state.isLoading;
  readonly hasLoaded = this.state.hasLoaded;
  readonly isDone = this.state.isDone;
  readonly currentStep = this.state.currentStep;
  readonly totalSteps = this.state.totalSteps;
  readonly currentEntry = this.state.currentEntry;
  readonly currentItem = this.state.currentItem;
  readonly isEditingCurrent = this.state.isEditingCurrent;
  readonly isSavingEdit = this.state.isSavingEdit;
  readonly editCategory = this.state.editCategory;
  readonly editLocation = this.state.editLocation;
  readonly editHasExpiry = this.state.editHasExpiry;
  readonly editExpiryDate = this.state.editExpiryDate;
  readonly editNeedsCategory = this.state.editNeedsCategory;
  readonly editNeedsLocation = this.state.editNeedsLocation;
  readonly editNeedsExpiry = this.state.editNeedsExpiry;
  readonly canSaveEdit = this.state.canSaveEdit;
  readonly categoryOptions = this.state.categoryOptions;
  readonly locationOptions = this.state.locationOptions;

  async ionViewWillEnter(): Promise<void> {
    await this.state.ionViewWillEnter();
  }

  ionViewWillLeave(): void {
    this.state.ionViewWillLeave();
  }

  hasReason(pending: InsightPendingReviewProduct | null, reason: UpToDateReason): boolean {
    return this.state.hasReason(pending, reason);
  }

  isBusy(id?: string | null): boolean {
    return this.state.isBusy(id);
  }

  async keep(entry: InsightPendingReviewProduct): Promise<void> {
    await this.state.keep(entry);
  }

  async remove(entry: InsightPendingReviewProduct): Promise<void> {
    await this.state.remove(entry);
  }

  skip(entry: InsightPendingReviewProduct): void {
    this.state.skip(entry);
  }

  edit(entry: InsightPendingReviewProduct): void {
    this.state.edit(entry);
  }

  formatItemDate(value?: string | null): string {
    return this.state.formatItemDate(value);
  }

  formatCategory(item: PantryItem | null): string {
    return this.state.formatCategory(item);
  }

  formatQuantityLabel(item: PantryItem | null): string {
    return this.state.formatQuantityLabel(item);
  }

  closeEditModal(): void {
    this.state.closeEditModal();
  }

  onEditCategoryChange(event: CustomEvent): void {
    this.state.onEditCategoryChange(event);
  }

  onEditLocationChange(event: CustomEvent): void {
    this.state.onEditLocationChange(event);
  }

  onEditExpiryChange(event: CustomEvent): void {
    this.state.onEditExpiryChange(event);
  }

  onEditHasExpiryToggle(event: CustomEvent): void {
    this.state.onEditHasExpiryToggle(event);
  }

  async saveEditModal(): Promise<void> {
    await this.state.saveEditModal();
  }
}

