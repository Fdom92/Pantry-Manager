import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { DEFAULT_CATEGORY_OPTIONS, DEFAULT_LOCATION_OPTIONS, DEFAULT_SUPERMARKET_OPTIONS, TOAST_DURATION } from '@core/constants';
import {
  AppPreferencesService,
} from '@core/services';
import { ToastController } from '@ionic/angular';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonProgressBar,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { EmptyStateGenericComponent } from '@shared/components/empty-states/empty-state-generic.component';

@Component({
  selector: 'app-settings-catalogs',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonProgressBar,
    IonList,
    IonListHeader,
    IonLabel,
    IonItem,
    IonInput,
    IonButton,
    IonIcon,
    IonSpinner,
    CommonModule,
    TranslateModule,
    EmptyStateGenericComponent,
  ],
  templateUrl: './settings-catalogs.component.html',
  styleUrls: ['./settings-catalogs.component.scss'],
})
export class SettingsCatalogsComponent {
  // Signals
  readonly loading = signal(false);
  readonly savingCatalogs = signal(false);
  readonly locationOptionsDraft = signal<string[]>([]);
  readonly originalLocationOptions = signal<string[]>([]);
  readonly categoryOptionsDraft = signal<string[]>([]);
  readonly originalCategoryOptions = signal<string[]>([]);
  readonly supermarketOptionsDraft = signal<string[]>([]);
  readonly originalSupermarketOptions = signal<string[]>([]);
  // Computed Signals
  readonly hasLocationChanges = computed(() => {
    const draft = this.normalizeLocationOptions(this.locationOptionsDraft(), false);
    const original = this.originalLocationOptions();
    if (draft.length !== original.length) {
      return true;
    }
    return draft.some((value, index) => value !== original[index]);
  });
  readonly hasCategoryChanges = computed(() => {
    const draft = this.normalizeCategoryOptions(this.categoryOptionsDraft(), false);
    const original = this.originalCategoryOptions();
    if (draft.length !== original.length) {
      return true;
    }
    return draft.some((value, index) => value !== original[index]);
  });
  readonly hasSupermarketChanges = computed(() => {
    const draft = this.normalizeSupermarketOptions(this.supermarketOptionsDraft(), false);
    const original = this.originalSupermarketOptions();
    if (draft.length !== original.length) {
      return true;
    }
    return draft.some((value, index) => value !== original[index]);
  });
  readonly hasAnyChanges = computed(
    () =>
      this.hasLocationChanges() ||
      this.hasCategoryChanges() ||
      this.hasSupermarketChanges(),
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

  addCategoryOption(): void {
    this.categoryOptionsDraft.update(options => [...options, '']);
  }

  removeCategoryOption(index: number): void {
    this.categoryOptionsDraft.update(options => options.filter((_, i) => i !== index));
  }

  onCategoryOptionInput(index: number, event: Event): void {
    const value = (event as CustomEvent<{ value?: string | null }>).detail?.value ?? '';
    this.categoryOptionsDraft.update(options => {
      const next = [...options];
      next[index] = value ?? '';
      return next;
    });
  }

  restoreDefaultCategoryOptions(): void {
    this.categoryOptionsDraft.set([...DEFAULT_CATEGORY_OPTIONS]);
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
    const normalizedCategories = this.normalizeCategoryOptions(this.categoryOptionsDraft(), false);
    const normalizedSupermarkets = this.normalizeSupermarketOptions(
      this.supermarketOptionsDraft(),
      false,
    );

    const locationPayload = normalizedLocations.length
      ? normalizedLocations
      : [...DEFAULT_LOCATION_OPTIONS];
    const categoryPayload = normalizedCategories.length
      ? normalizedCategories
      : [...DEFAULT_CATEGORY_OPTIONS];
    const supermarketPayload = normalizedSupermarkets.length
      ? normalizedSupermarkets
      : [...DEFAULT_SUPERMARKET_OPTIONS];

    this.savingCatalogs.set(true);
    try {
      const current = await this.appPreferencesService.getPreferences();
      await this.appPreferencesService.savePreferences({
        ...current,
        locationOptions: locationPayload,
        categoryOptions: categoryPayload,
        supermarketOptions: supermarketPayload,
      });
      this.originalLocationOptions.set(locationPayload);
      this.originalCategoryOptions.set(categoryPayload);
      this.originalSupermarketOptions.set(supermarketPayload);
      this.locationOptionsDraft.set([...locationPayload]);
      this.categoryOptionsDraft.set([...categoryPayload]);
      this.supermarketOptionsDraft.set([...supermarketPayload]);
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
      this.syncCategoryOptionsFromPreferences();
      this.syncSupermarketOptionsFromPreferences();
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

  private syncCategoryOptionsFromPreferences(): void {
    const prefs = this.appPreferencesService.preferences();
    const current = this.normalizeCategoryOptions(prefs.categoryOptions);
    this.originalCategoryOptions.set(current);
    this.categoryOptionsDraft.set([...current]);
  }

  private syncSupermarketOptionsFromPreferences(): void {
    const prefs = this.appPreferencesService.preferences();
    const current = this.normalizeSupermarketOptions(prefs.supermarketOptions);
    this.originalSupermarketOptions.set(current);
    this.supermarketOptionsDraft.set([...current]);
  }

  private normalizeLocationOptions(
    values: readonly string[] | null | undefined,
    fallbackToDefault = true,
  ): string[] {
    return this.normalizeStringOptions(values, DEFAULT_LOCATION_OPTIONS, fallbackToDefault);
  }

  private normalizeCategoryOptions(
    values: readonly string[] | null | undefined,
    fallbackToDefault = true,
  ): string[] {
    return this.normalizeStringOptions(values, DEFAULT_CATEGORY_OPTIONS, fallbackToDefault);
  }

  private normalizeSupermarketOptions(
    values: readonly string[] | null | undefined,
    fallbackToDefault = true,
  ): string[] {
    return this.normalizeStringOptions(values, DEFAULT_SUPERMARKET_OPTIONS, fallbackToDefault);
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
