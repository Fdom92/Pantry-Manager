import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { SeedService } from '@core/services/seed.service';
import { PantryService } from '@core/services';
import { PantryItem, MeasurementUnit, StockStatus } from '@core/models';
import { createDocumentId } from '@core/utils';
import { DEFAULT_HOUSEHOLD_ID } from '@core/constants';

interface PantryGroup {
  key: string;
  name: string;
  items: PantryItem[];
  lowStockCount: number;
  expiringCount: number;
  expiredCount: number;
}

@Component({
  selector: 'app-pantry-list',
  standalone: true,
  imports: [IonicModule, CommonModule, ReactiveFormsModule],
  templateUrl: './pantry-list.component.html',
  styleUrls: ['./pantry-list.component.scss'],
})
export class PantryListComponent {
  items: PantryItem[] = [];
  showCreateModal = false;
  groups: PantryGroup[] = [];
  readonly nearExpiryDays = 3;
  readonly unitOptions = Object.values(MeasurementUnit);
  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    quantity: [1, [Validators.required, Validators.min(0)]],
    unit: [MeasurementUnit.UNIT, Validators.required],
    categoryId: [''],
    locationId: [''],
    minThreshold: [null],
    expirationDate: [''],
    notes: ['']
  });

  constructor(
    private readonly pantryService: PantryService,
    private seedService: SeedService,
    private readonly fb: FormBuilder,
  ) {}

  async ionViewWillEnter() {
    await this.seedService.ensureSeedData();
    await this.loadItems();
  }

  async loadItems(): Promise<void> {
    this.items = await this.pantryService.getAll();
    this.groups = this.buildGroups(this.items);
  }

  openNewItemModal(): void {
    this.form.reset({
      name: '',
      quantity: 1,
      unit: MeasurementUnit.UNIT,
      categoryId: '',
      locationId: '',
      minThreshold: null,
      expirationDate: '',
      notes: ''
    });
    this.showCreateModal = true;
  }

  closeNewItemModal(): void {
    this.showCreateModal = false;
  }

  async submitNewItem(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const {
      name,
      quantity,
      unit,
      categoryId,
      locationId,
      minThreshold,
      expirationDate,
      notes
    } = this.form.value;

    const now = new Date().toISOString();
    const normalizedExpiration = expirationDate
      ? new Date(expirationDate as string).toISOString()
      : undefined;

    const stock = {
      quantity: Number(quantity),
      unit: (unit ?? MeasurementUnit.UNIT) as MeasurementUnit,
      minThreshold: minThreshold != null ? Number(minThreshold) : undefined
    };
    const computedStatus = stock.minThreshold != null && stock.quantity <= stock.minThreshold
      ? StockStatus.LOW
      : StockStatus.NORMAL;

    const newItem: PantryItem = {
      _id: createDocumentId('item'),
      type: 'item',
      householdId: DEFAULT_HOUSEHOLD_ID,
      name: (name ?? '').trim(),
      categoryId: (categoryId ?? '').trim(),
      locationId: (locationId ?? '').trim(),
      stock: { ...stock, status: computedStatus },
      expirationDate: normalizedExpiration,
      createdAt: now,
      updatedAt: now
    };

    await this.pantryService.saveItem(newItem);
    await this.loadItems();
    this.closeNewItemModal();
  }

  getUnit(item: PantryItem): string {
    return item.stock?.unit ?? MeasurementUnit.UNIT;
  }

  isLowStock(item: PantryItem): boolean {
    const stock = item.stock;
    if (!stock) {
      return true;
    }
    if (stock.minThreshold == null) {
      return false;
    }
    return stock.quantity <= stock.minThreshold;
  }

  isExpired(item: PantryItem): boolean {
    if (!item.expirationDate) {
      return false;
    }
    const today = new Date();
    return new Date(item.expirationDate) < today;
  }

  isNearExpiry(item: PantryItem): boolean {
    if (!item.expirationDate) {
      return false;
    }
    if (this.isExpired(item)) {
      return false;
    }
    const today = new Date();
    const target = new Date(item.expirationDate);
    const diff = (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= this.nearExpiryDays;
  }

  private buildGroups(items: PantryItem[]): PantryGroup[] {
    const map = new Map<string, PantryGroup>();

    for (const item of items) {
      const key = item.categoryId?.trim() || 'uncategorized';
      const name = this.formatCategoryName(key);
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          name,
          items: [],
          lowStockCount: 0,
          expiringCount: 0,
          expiredCount: 0,
        };
        map.set(key, group);
      }

      group.items.push(item);
      if (this.isLowStock(item)) {
        group.lowStockCount += 1;
      }
      if (this.isExpired(item)) {
        group.expiredCount += 1;
      } else if (this.isNearExpiry(item)) {
        group.expiringCount += 1;
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  private formatCategoryName(key: string): string {
    if (!key || key === 'uncategorized') {
      return 'Uncategorized';
    }
    const plain = key.replace(/^category:/i, '');
    return plain
      .split(/[-_:]/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
