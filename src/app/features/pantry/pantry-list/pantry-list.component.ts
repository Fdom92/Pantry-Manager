import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Item } from '@core/models/item.model';
import { SeedService } from '@core/services/seed.service';
import { StorageService } from '@core/services/storage.service';

@Component({
  selector: 'app-pantry-list',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './pantry-list.component.html',
  styleUrls: ['./pantry-list.component.scss'],
})
export class PantryListComponent {
  items: Item[] = [];

  constructor(
    private storage: StorageService<Item>,
    private seedService: SeedService,
  ) {}

  async ionViewWillEnter() {
    await this.seedService.ensureSeedData();
    this.items = await this.storage.all('item');
  }
}
