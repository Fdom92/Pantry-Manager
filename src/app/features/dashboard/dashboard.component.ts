import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { PantryService, SeedService } from '@core/services';
import { PantryItem } from '@core/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent {
  totalItems = 0;
  categoryCount = 0;
  locationCount = 0;
  lowStockItems: PantryItem[] = [];
  nearExpiryItems: PantryItem[] = [];
  expiredItems: PantryItem[] = [];
  recentItems: PantryItem[] = [];
  lastUpdated: string | null = null;

  private readonly NEAR_EXPIRY_DAYS = 7;

  constructor(
    private readonly pantryService: PantryService,
    private readonly seedService: SeedService
  ) {}

  async ionViewWillEnter(): Promise<void> {
    await this.seedService.ensureSeedData();
    await this.loadInsights();
  }

  get alertCount(): number {
    return this.lowStockItems.length + this.nearExpiryItems.length + this.expiredItems.length;
  }

  get nearExpiryWindow(): number {
    return this.NEAR_EXPIRY_DAYS;
  }

  private async loadInsights(): Promise<void> {
    const items = await this.pantryService.getAll();
    const now = new Date();
    this.totalItems = items.length;
    this.categoryCount = this.countDistinct(items.map(item => item.categoryId));
    this.locationCount = this.countDistinct(items.map(item => item.locationId));

    this.nearExpiryItems = this.extractNearExpiry(items, now);
    this.expiredItems = this.extractExpired(items, now);
    this.lowStockItems = this.extractLowStock(items);
    this.recentItems = this.extractRecent(items);

    this.lastUpdated = new Date().toISOString();
  }

  private extractNearExpiry(items: PantryItem[], now: Date): PantryItem[] {
    return items
      .filter(item => item.expirationDate && this.daysUntil(item.expirationDate, now) > 0)
      .filter(item => this.daysUntil(item.expirationDate!, now) <= this.NEAR_EXPIRY_DAYS)
      .sort((a, b) => this.compareDates(a.expirationDate, b.expirationDate))
      .slice(0, 5);
  }

  private extractExpired(items: PantryItem[], now: Date): PantryItem[] {
    return items
      .filter(item => item.expirationDate && this.daysUntil(item.expirationDate, now) <= 0)
      .sort((a, b) => this.compareDates(a.expirationDate, b.expirationDate))
      .slice(0, 5);
  }

  private extractLowStock(items: PantryItem[]): PantryItem[] {
    return items
      .filter(item => {
        const stock = item.stock;
        return stock?.minThreshold != null && stock.quantity <= stock.minThreshold;
      })
      .sort((a, b) => (a.stock?.quantity ?? 0) - (b.stock?.quantity ?? 0))
      .slice(0, 5);
  }

  private extractRecent(items: PantryItem[]): PantryItem[] {
    return [...items]
      .sort((a, b) => this.compareDates(b.updatedAt, a.updatedAt))
      .slice(0, 5);
  }

  private daysUntil(dateStr: string, from: Date): number {
    const target = new Date(dateStr);
    return Math.floor((target.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  }

  private compareDates(a?: string, b?: string): number {
    const aTime = a ? new Date(a).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b ? new Date(b).getTime() : Number.POSITIVE_INFINITY;
    return aTime - bTime;
  }

  private countDistinct(values: (string | undefined)[]): number {
    return new Set(values.filter(Boolean)).size;
  }
}
