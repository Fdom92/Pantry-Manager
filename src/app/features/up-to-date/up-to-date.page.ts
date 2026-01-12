import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { InsightPendingReviewProduct, PantryItem } from '@core/models';
import { InsightService, LanguageService, PantryStoreService } from '@core/services';
import { formatDateValue, formatQuantity } from '@core/utils/formatting.util';
import { NavController } from '@ionic/angular';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { EmptyStateGenericComponent } from '@shared/components/empty-states/empty-state-generic.component';

@Component({
  selector: 'app-up-to-date',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    EmptyStateGenericComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonText,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton,
    IonSpinner,
  ],
  templateUrl: './up-to-date.page.html',
  styleUrls: ['./up-to-date.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpToDatePage {
  // DI
  private readonly pantryStore = inject(PantryStoreService);
  private readonly insightService = inject(InsightService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly navCtrl = inject(NavController);

  // Signals
  readonly isLoading = signal(false);
  readonly hasLoaded = signal(false);
  readonly busyIds = signal<Set<string>>(new Set());
  readonly currentId = signal<string | null>(null);
  readonly processedIds = signal<Set<string>>(new Set());

  // Data
  readonly pantryItems = this.pantryStore.items;

  // Computed
  readonly pending = computed(() => this.insightService.getPendingReviewProducts(this.pantryItems()));
  readonly queue = computed(() => {
    const processed = this.processedIds();
    return this.pending().filter(entry => {
      const id = (entry.id ?? '').trim();
      return id && !processed.has(id);
    });
  });
  readonly pendingCount = computed(() => this.queue().length);
  readonly processedCount = computed(() => this.processedIds().size);
  readonly totalSteps = computed(() => this.processedCount() + this.pendingCount());
  readonly currentStep = computed(() => {
    if (this.pendingCount() <= 0) {
      return this.totalSteps();
    }
    return Math.min(this.processedCount() + 1, this.totalSteps());
  });
  readonly isDone = computed(() => this.hasLoaded() && this.pendingCount() === 0);
  readonly pantryItemsById = computed(() => {
    const map = new Map<string, PantryItem>();
    for (const item of this.pantryItems()) {
      if (item?._id) {
        map.set(item._id, item);
      }
    }
    return map;
  });
  readonly currentEntry = computed(() => {
    const entries = this.queue();
    const current = this.currentId();
    if (!entries.length) {
      return null;
    }
    if (current) {
      const match = entries.find(entry => entry.id === current);
      if (match) {
        return match;
      }
    }
    return entries[0] ?? null;
  });
  readonly currentItem = computed(() => this.getPantryItem(this.currentEntry()?.id ?? null));

  private doneRedirectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const entries = this.queue();
      if (!entries.length) {
        this.currentId.set(null);
        return;
      }
      const current = this.currentId();
      if (!current) {
        this.currentId.set(entries[0]?.id ?? null);
        return;
      }
      if (!entries.some(entry => entry.id === current)) {
        this.currentId.set(entries[0]?.id ?? null);
      }
    });

    effect(() => {
      if (!this.isDone()) {
        return;
      }
      if (this.doneRedirectTimeout) {
        return;
      }
      this.doneRedirectTimeout = setTimeout(() => {
        void this.navCtrl.navigateRoot('/dashboard');
      }, 1200);
    });
  }

  async ionViewWillEnter(): Promise<void> {
    this.isLoading.set(true);
    try {
      await this.pantryStore.loadAll();
    } finally {
      this.isLoading.set(false);
      this.hasLoaded.set(true);
    }
  }

  async ionViewWillLeave(): Promise<void> {
    if (this.doneRedirectTimeout) {
      clearTimeout(this.doneRedirectTimeout);
      this.doneRedirectTimeout = null;
    }
  }

  hasReason(pending: InsightPendingReviewProduct | null, reason: 'stale-update' | 'missing-info'): boolean {
    return pending?.reasons?.includes(reason) ?? false;
  }

  getPantryItem(id?: string | null): PantryItem | null {
    const key = (id ?? '').trim();
    if (!key) {
      return null;
    }
    return this.pantryItemsById().get(key) ?? null;
  }

  isBusy(id?: string | null): boolean {
    if (!id) {
      return false;
    }
    return this.busyIds().has(id);
  }

  async keep(pending: InsightPendingReviewProduct): Promise<void> {
    const id = pending?.id ?? null;
    const item = this.getPantryItem(id);
    if (!item) {
      return;
    }
    if (this.isBusy(item._id)) {
      return;
    }
    this.markBusy(item._id, true);
    const snapshot = this.queue();
    try {
      const now = new Date().toISOString();
      await this.pantryStore.updateItem({ ...item, updatedAt: now });
      this.completeAndAdvance(id, snapshot);
    } finally {
      this.markBusy(item._id, false);
    }
  }

  async remove(pending: InsightPendingReviewProduct): Promise<void> {
    const id = pending?.id ?? null;
    if (!id) {
      return;
    }
    if (this.isBusy(id)) {
      return;
    }
    this.markBusy(id, true);
    const snapshot = this.queue();
    try {
      await this.pantryStore.deleteItem(id);
      this.completeAndAdvance(id, snapshot);
    } finally {
      this.markBusy(id, false);
    }
  }

  edit(pending: InsightPendingReviewProduct): void {
    console.log('[UpToDate] edit requested', pending);
    const snapshot = this.queue();
    this.completeAndAdvance(pending?.id ?? null, snapshot);
  }

  formatItemDate(value?: string | null): string {
    return formatDateValue(value ?? null, this.languageService.getCurrentLocale(), { year: 'numeric', month: 'short', day: 'numeric' }, {
      fallback: this.translate.instant('common.dates.none'),
    });
  }

  formatCategory(item: PantryItem | null): string {
    if (!item) {
      return '';
    }
    const categoryId = (item.categoryId ?? '').trim();
    return categoryId || this.translate.instant('pantry.form.uncategorized');
  }

  formatQuantityLabel(item: PantryItem | null): string {
    if (!item) {
      return '';
    }
    const total = this.pantryStore.getItemTotalQuantity(item);
    const formatted = formatQuantity(total, this.languageService.getCurrentLocale(), { maximumFractionDigits: 1 });
    const unitLabel = this.pantryStore.getUnitLabel(this.pantryStore.getItemPrimaryUnit(item));
    return `${formatted} ${unitLabel}`.trim();
  }

  private markBusy(id: string, busy: boolean): void {
    this.busyIds.update(current => {
      const next = new Set(current);
      if (busy) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  private getNextPendingId(currentId: string | null, snapshot: InsightPendingReviewProduct[]): string | null {
    if (!Array.isArray(snapshot) || snapshot.length === 0) {
      return null;
    }
    const key = (currentId ?? '').trim();
    if (!key) {
      return snapshot[0]?.id ?? null;
    }
    const index = snapshot.findIndex(entry => entry.id === key);
    if (index < 0) {
      return snapshot[0]?.id ?? null;
    }
    return snapshot[index + 1]?.id ?? null;
  }

  private completeAndAdvance(currentId: string | null, snapshot: InsightPendingReviewProduct[]): void {
    const key = (currentId ?? '').trim();
    const nextId = this.getNextPendingId(key, snapshot);
    if (key) {
      this.processedIds.update(current => {
        const next = new Set(current);
        next.add(key);
        return next;
      });
    }
    this.currentId.set(nextId);
  }
}
