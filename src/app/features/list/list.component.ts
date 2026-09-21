import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ListStateService } from '@core/services/list/list-state.service';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonList,
  IonSkeletonText,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ShoppingBuySheetComponent } from './components/shopping-buy-sheet/shopping-buy-sheet.component';
import { ShoppingBuySheetStateService } from './components/shopping-buy-sheet/shopping-buy-sheet-state.service';
import { ShoppingManualAddSheetComponent } from './components/shopping-manual-add-sheet/shopping-manual-add-sheet.component';
import { ShoppingManualAddSheetStateService } from './components/shopping-manual-add-sheet/shopping-manual-add-sheet-state.service';
import { ShoppingReason } from '@core/models/list/list.model';
import type { ShoppingSuggestionGroupWithItem, ShoppingSuggestionWithItem } from '@core/models/list/list.model';
import { UNASSIGNED_SUPERMARKET_KEY } from '@core/constants';

@Component({
  selector: 'app-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TranslateModule,
    EmptyStateComponent,
    ShoppingBuySheetComponent,
    ShoppingManualAddSheetComponent,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonIcon, IonSpinner, IonSkeletonText, IonBadge,
    IonList, IonItem,
  ],
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
  providers: [ListStateService, ShoppingBuySheetStateService, ShoppingManualAddSheetStateService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListComponent {
  readonly facade = inject(ListStateService);
  readonly buySheet = inject(ShoppingBuySheetStateService);
  readonly manualAddSheet = inject(ShoppingManualAddSheetStateService);
  readonly UNASSIGNED_KEY = UNASSIGNED_SUPERMARKET_KEY;

  private readonly collapsedGroups = signal<Set<string>>(new Set());
  private readonly exitingItems = signal<Set<string>>(new Set());
  readonly globalBoughtExpanded = signal(false);
  readonly globalIgnoredExpanded = signal(false);

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }

  async ionViewWillLeave(): Promise<void> {
    await this.facade.ionViewWillLeave();
    this.collapsedGroups.set(new Set());
    this.globalBoughtExpanded.set(false);
    this.globalIgnoredExpanded.set(false);
  }

  toggleGroup(key: string): void {
    this.collapsedGroups.update(set => {
      const next = new Set(set);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  isGroupCollapsed(key: string): boolean {
    return this.collapsedGroups().has(key);
  }

  toggleGlobalBought(): void {
    this.globalBoughtExpanded.update(v => !v);
  }

  toggleGlobalIgnored(): void {
    this.globalIgnoredExpanded.update(v => !v);
  }

  isExiting(id: string): boolean {
    return this.exitingItems().has(id);
  }

  onBuyTap(suggestion: ShoppingSuggestionWithItem): void {
    const isFresh = suggestion.reason === ShoppingReason.FRESH_EMPTY
      || suggestion.reason === ShoppingReason.FRESH_LOW;
    if (isFresh) {
      void this.animateAndBuy(suggestion);
      return;
    }
    this.buySheet.openSheet(suggestion);
  }

  private async animateAndBuy(suggestion: ShoppingSuggestionWithItem): Promise<void> {
    const id = suggestion.item._id;
    this.exitingItems.update(s => new Set([...s, id]));
    await new Promise<void>(r => setTimeout(r, 260));
    void this.facade.markAsBought(suggestion);
    this.exitingItems.update(s => { const n = new Set(s); n.delete(id); return n; });
  }

  hasUnassignedAutoGroup(groups: ShoppingSuggestionGroupWithItem[]): boolean {
    for (const g of groups) {
      if (g.key === this.UNASSIGNED_KEY) return true;
    }
    return false;
  }

  openManualAdd(): void {
    this.manualAddSheet.open();
  }
}
