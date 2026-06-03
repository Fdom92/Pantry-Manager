import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ListStateService } from '@core/services/list/list-state.service';
import {
  AlertController,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonList,
  IonSkeletonText,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ShoppingBuySheetComponent } from './components/shopping-buy-sheet/shopping-buy-sheet.component';
import { ShoppingBuySheetStateService } from './components/shopping-buy-sheet/shopping-buy-sheet-state.service';
import { ShoppingReason } from '@core/models/list/list.model';
import type { ShoppingSuggestionWithItem } from '@core/models/list/list.model';

@Component({
  selector: 'app-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TranslateModule,
    EmptyStateComponent,
    ShoppingBuySheetComponent,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonIcon, IonSpinner, IonSkeletonText, IonBadge,
    IonList, IonItem, IonItemSliding, IonItemOptions, IonItemOption,
  ],
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
  providers: [ListStateService, ShoppingBuySheetStateService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListComponent {
  readonly facade = inject(ListStateService);
  readonly buySheet = inject(ShoppingBuySheetStateService);
  private readonly alertController = inject(AlertController);
  private readonly translate = inject(TranslateService);

  private readonly collapsedGroups = signal<Set<string>>(new Set());
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
      next.has(key) ? next.delete(key) : next.add(key);
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

  onBuyTap(suggestion: ShoppingSuggestionWithItem): void {
    const isFresh = suggestion.reason === ShoppingReason.FRESH_EMPTY
      || suggestion.reason === ShoppingReason.FRESH_LOW;
    if (isFresh) {
      void this.facade.markAsBought(suggestion);
      return;
    }
    this.buySheet.openSheet(suggestion);
  }

  async openManualAdd(): Promise<void> {
    const alert = await this.alertController.create({
      header: this.translate.instant('shopping.manualAdd.alertTitle'),
      inputs: [
        {
          type: 'text',
          placeholder: this.translate.instant('shopping.manualAdd.placeholder'),
        },
      ],
      buttons: [
        { text: this.translate.instant('common.actions.cancel'), role: 'cancel' },
        {
          text: this.translate.instant('shopping.manualAdd.alertButton'),
          handler: (data: Record<number, string>) => {
            const name = (data[0] ?? '').trim();
            if (name) {
              this.facade.addManualItem(name);
            }
          },
        },
      ],
    });
    await alert.present();
  }
}
