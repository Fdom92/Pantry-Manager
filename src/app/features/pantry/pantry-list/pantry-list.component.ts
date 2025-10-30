import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { SeedService } from '@core/services/seed.service';
import { PantryService } from '@core/services';
import { PantryItem, MeasurementUnit, StockStatus } from '@core/models';
import { createDocumentId } from '@core/utils';
import { DEFAULT_HOUSEHOLD_ID } from '@core/constants';

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
}
