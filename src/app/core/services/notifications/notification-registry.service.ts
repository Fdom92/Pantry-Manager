import { Injectable } from '@angular/core';
import type { NotificationDefinition } from '@core/models/notifications';
import { ExpiredItemsNotification } from './definitions/expired-items.notification';
import { NearExpiryNotification } from './definitions/near-expiry.notification';
import { LowStockNotification } from './definitions/low-stock.notification';

@Injectable({ providedIn: 'root' })
export class NotificationRegistryService {
  private readonly definitions: NotificationDefinition[] = [
    new ExpiredItemsNotification(),
    new NearExpiryNotification(),
    new LowStockNotification(),
  ];

  getAll(): readonly NotificationDefinition[] {
    return this.definitions;
  }

  /** Register an additional definition at runtime. Adding a new notification type = create a class + call this. */
  register(definition: NotificationDefinition): void {
    const exists = this.definitions.some(d => d.id === definition.id);
    if (exists) {
      console.warn(`[NotificationRegistry] Definition with id ${definition.id} already registered`);
      return;
    }
    this.definitions.push(definition);
  }
}
