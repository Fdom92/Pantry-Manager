import { Component, signal, computed } from '@angular/core';
import { IonicModule, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import {
  AppPreferencesService,
  DEFAULT_LOCATION_OPTIONS,
  DEFAULT_SUPERMARKET_OPTIONS,
  DEFAULT_UNIT_OPTIONS,
} from '@core/services';
import { MeasurementUnit } from '@core/models';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

const TOAST_DURATION = 1800;

@Component({
  selector: 'app-settings-catalogs',
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule],
  templateUrl: './settings-catalogs.component.html',
  styleUrls: ['./settings-catalogs.component.scss'],
})
export class SettingsCatalogsComponent {
  readonly loading = signal(false);
  readonly savingCatalogs = signal(false);

  readonly locationOptionsDraft = signal<string[]>([]);
  readonly originalLocationOptions = signal<string[]>([]);
  readonly hasLocationChanges = computed(() => {
    const draft = this.normalizeLocationOptions(this.locationOptionsDraft(), false);
    const original = this.originalLocationOptions();
    if (draft.length !== original.length) {
      return true;
    }
    return draft.some((value, index) => value !== original[index]);
  });

  readonly supermarketOptionsDraft = signal<string[]>([]);
  readonly originalSupermarketOptions = signal<string[]>([]);
  readonly hasSupermarketChanges = computed(() => {
    const draft = this.normalizeSupermarketOptions(this.supermarketOptionsDraft(), false);
    const original = this.originalSupermarketOptions();
    if (draft.length !== original.length) {
      return true;
    }
    return draft.some((value, index) => value !== original[index]);
  });

  readonly unitOptionsDraft = signal<string[]>([]);
  readonly originalUnitOptions = signal<string[]>([]);
  readonly hasUnitChanges = computed(() => {
    const draft = this.normalizeUnitOptions(this.unitOptionsDraft(), false);
    const original = this.originalUnitOptions();
    if (draft.length !== original.length) {
      return true;
    }
    return draft.some((value, index) => value !== original[index]);
  });

  readonly hasAnyChanges = computed(
    () =>
      this.hasLocationChanges() ||
      this.hasSupermarketChanges() ||
      this.hasUnitChanges(),
  );

  constructor(
    private readonly toastCtrl: ToastController,
    private readonly appPreferencesService: AppPreferencesService,
    private readonly translate: TranslateService,
  ) {}

  async ionViewWillEnter(): Promise<void> {
    await this.loadPreferences();
  }

  addLocationOption(): void {
    this.locationOptionsDraft.update(options => [...options, '']);
  }

  removeLocationOption(index: number): void {
    this.locationOptionsDraft.update(options => options.filter((_, i) => i !== index));
  }

  onLocationOptionInput(index: number, event: Event): void {
    const value = (event as CustomEvent<{ value?: string | null }>).detail?.value ?? '';
    this.locationOptionsDraft.update(options => {
      const next = [...options];
      next[index] = value ?? '';
      return next;
    });
  }

  restoreDefaultLocationOptions(): void {
    this.locationOptionsDraft.set([...DEFAULT_LOCATION_OPTIONS]);
  }

  addUnitOption(): void {
    this.unitOptionsDraft.update(options => [...options, '']);
  }

  removeUnitOption(index: number): void {
    this.unitOptionsDraft.update(options => options.filter((_, i) => i !== index));
  }

  onUnitOptionInput(index: number, event: Event): void {
    const value = (event as CustomEvent<{ value?: string | null }>).detail?.value ?? '';
    this.unitOptionsDraft.update(options => {
      const next = [...options];
      next[index] = value ?? '';
      return next;
    });
  }

  restoreDefaultUnitOptions(): void {
    this.unitOptionsDraft.set([...DEFAULT_UNIT_OPTIONS]);
  }

  addSupermarketOption(): void {
    this.supermarketOptionsDraft.update(options => [...options, '']);
  }

  removeSupermarketOption(index: number): void {
    this.supermarketOptionsDraft.update(options => options.filter((_, i) => i !== index));
  }

  onSupermarketOptionInput(index: number, event: Event): void {
    const value = (event as CustomEvent<{ value?: string | null }>).detail?.value ?? '';
    this.supermarketOptionsDraft.update(options => {
      const next = [...options];
      next[index] = value ?? '';
      return next;
    });
  }

  restoreDefaultSupermarketOptions(): void {
    this.supermarketOptionsDraft.set([...DEFAULT_SUPERMARKET_OPTIONS]);
  }

  async saveCatalogs(): Promise<void> {
    if (this.savingCatalogs() || !this.hasAnyChanges()) {
      return;
    }

    const normalizedLocations = this.normalizeLocationOptions(this.locationOptionsDraft(), false);
    const normalizedSupermarkets = this.normalizeSupermarketOptions(
      this.supermarketOptionsDraft(),
      false,
    );
    const normalizedUnits = this.normalizeUnitOptions(this.unitOptionsDraft(), false);

    const locationPayload = normalizedLocations.length
      ? normalizedLocations
      : [...DEFAULT_LOCATION_OPTIONS];
    const supermarketPayload = normalizedSupermarkets.length
      ? normalizedSupermarkets
      : [...DEFAULT_SUPERMARKET_OPTIONS];
    const unitPayload = normalizedUnits.length
      ? normalizedUnits
      : [...DEFAULT_UNIT_OPTIONS];

    this.savingCatalogs.set(true);
    try {
      const current = await this.appPreferencesService.getPreferences();
      await this.appPreferencesService.savePreferences({
        ...current,
        locationOptions: locationPayload,
        supermarketOptions: supermarketPayload,
        unitOptions: unitPayload,
      });
      this.originalLocationOptions.set(locationPayload);
      this.originalSupermarketOptions.set(supermarketPayload);
      this.originalUnitOptions.set(unitPayload);
      this.locationOptionsDraft.set([...locationPayload]);
      this.supermarketOptionsDraft.set([...supermarketPayload]);
      this.unitOptionsDraft.set([...unitPayload]);
      await this.presentToast(this.translate.instant('settings.catalogs.saveSuccess'), 'success');
    } catch (err) {
      console.error('[SettingsCatalogsComponent] saveCatalogs error', err);
      await this.presentToast(this.translate.instant('settings.catalogs.saveError'), 'danger');
    } finally {
      this.savingCatalogs.set(false);
    }
  }

  private async loadPreferences(): Promise<void> {
    this.loading.set(true);
    try {
      await this.appPreferencesService.getPreferences();
      this.syncLocationOptionsFromPreferences();
      this.syncSupermarketOptionsFromPreferences();
      this.syncUnitOptionsFromPreferences();
    } catch (err) {
      console.error('[SettingsCatalogsComponent] loadPreferences error', err);
      await this.presentToast(this.translate.instant('settings.catalogs.loadError'), 'danger');
    } finally {
      this.loading.set(false);
    }
  }

  private syncLocationOptionsFromPreferences(): void {
    const prefs = this.appPreferencesService.preferences();
    const current = this.normalizeLocationOptions(prefs.locationOptions);
    this.originalLocationOptions.set(current);
    this.locationOptionsDraft.set([...current]);
  }

  private syncSupermarketOptionsFromPreferences(): void {
    const prefs = this.appPreferencesService.preferences();
    const current = this.normalizeSupermarketOptions(prefs.supermarketOptions);
    this.originalSupermarketOptions.set(current);
    this.supermarketOptionsDraft.set([...current]);
  }

  private syncUnitOptionsFromPreferences(): void {
    const prefs = this.appPreferencesService.preferences();
    const current = this.normalizeUnitOptions(prefs.unitOptions);
    this.originalUnitOptions.set(current);
    this.unitOptionsDraft.set([...current]);
  }

  private normalizeLocationOptions(
    values: readonly string[] | null | undefined,
    fallbackToDefault = true,
  ): string[] {
    return this.normalizeStringOptions(values, DEFAULT_LOCATION_OPTIONS, fallbackToDefault);
  }

  private normalizeSupermarketOptions(
    values: readonly string[] | null | undefined,
    fallbackToDefault = true,
  ): string[] {
    const normalized = this.normalizeStringOptions(values, DEFAULT_SUPERMARKET_OPTIONS, fallbackToDefault);
    if (!normalized.some(option => option.toLowerCase() === 'otro')) {
      normalized.push('Otro');
    }
    return normalized;
  }

  private normalizeUnitOptions(
    values: readonly string[] | null | undefined,
    fallbackToDefault = true,
  ): string[] {
    const normalized = this.normalizeStringOptions(values, DEFAULT_UNIT_OPTIONS, fallbackToDefault);
    if (!normalized.some(option => option.toLowerCase() === MeasurementUnit.UNIT.toLowerCase())) {
      normalized.push(MeasurementUnit.UNIT);
    }
    return normalized;
  }

  private normalizeStringOptions(
    values: readonly string[] | null | undefined,
    defaults: readonly string[],
    fallbackToDefault: boolean,
  ): string[] {
    if (!Array.isArray(values)) {
      return fallbackToDefault ? [...defaults] : [];
    }
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const option of values) {
      if (typeof option !== 'string') {
        continue;
      }
      const trimmed = option.trim();
      if (!trimmed) {
        continue;
      }
      const key = trimmed.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      normalized.push(trimmed);
    }
    if (!normalized.length) {
      return fallbackToDefault ? [...defaults] : [];
    }
    return normalized;
  }

  private async presentToast(
    message: string,
    color: 'success' | 'danger' | 'warning' | 'medium'
  ): Promise<void> {
    if (!message) {
      return;
    }
    const toast = await this.toastCtrl.create({
      message,
      color,
      duration: TOAST_DURATION,
      position: 'bottom',
    });
    await toast.present();
  }
}
