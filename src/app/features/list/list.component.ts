import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ListStateService } from '@core/services/list/list-state.service';
import { AlertController, IonicModule } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-list',
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    RouterLink,
    TranslateModule,
    EmptyStateComponent,
  ],
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
  providers: [ListStateService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListComponent {
  readonly facade = inject(ListStateService);
  private readonly alertController = inject(AlertController);
  private readonly translate = inject(TranslateService);

  private readonly collapsedGroups = signal<Set<string>>(new Set());
  private readonly collapsedBoughtSections = signal<Set<string>>(new Set());

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }

  async ionViewWillLeave(): Promise<void> {
    await this.facade.ionViewWillLeave();
    this.collapsedGroups.set(new Set());
    this.collapsedBoughtSections.set(new Set());
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

  toggleBoughtSection(key: string): void {
    this.collapsedBoughtSections.update(set => {
      const next = new Set(set);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  isBoughtSectionExpanded(key: string): boolean {
    return this.collapsedBoughtSections().has(key);
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
