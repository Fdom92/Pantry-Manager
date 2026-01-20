import { Injectable, computed, inject, signal } from '@angular/core';
import { PLANNER_MEMORY_LIMIT } from '@core/constants';
import { ToastService, withSignalFlag } from '../../shared';
import { AppPreferencesService } from '../app-preferences.service';
import { TranslateService } from '@ngx-translate/core';

@Injectable()
export class SettingsAiStateService {
  private readonly appPreferences = inject(AppPreferencesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly plannerMemory = signal('');
  readonly originalPlannerMemory = signal('');
  readonly isSaving = signal(false);
  readonly isLoading = signal(false);
  readonly plannerMemoryLimit = PLANNER_MEMORY_LIMIT;

  readonly hasChanges = computed(() => this.plannerMemory() !== this.originalPlannerMemory());

  async ionViewWillEnter(): Promise<void> {
    await this.loadPlannerMemory();
  }

  onPlannerMemoryInput(value: string | null | undefined): void {
    const normalized = (value ?? '').slice(0, this.plannerMemoryLimit);
    this.plannerMemory.set(normalized);
  }

  async submitPlannerMemory(): Promise<void> {
    if (this.isSaving() || this.isLoading() || !this.hasChanges()) {
      return;
    }

    await withSignalFlag(this.isSaving, async () => {
      const current = await this.appPreferences.getPreferences();
      const next = (this.plannerMemory() ?? '').trim();
      await this.appPreferences.savePreferences({
        ...current,
        plannerMemory: next,
      });
      this.originalPlannerMemory.set(next);
      this.plannerMemory.set(next);
      await this.toast.present(this.translate.instant('settings.ai.saveSuccess'), { color: 'success' });
    }).catch(async err => {
      console.error('[SettingsAiStateService] submitPlannerMemory error', err);
      await this.toast.present(this.translate.instant('settings.ai.saveError'), { color: 'danger' });
    });
  }

  private async loadPlannerMemory(): Promise<void> {
    await withSignalFlag(this.isLoading, async () => {
      const prefs = await this.appPreferences.getPreferences();
      const stored = prefs.plannerMemory ?? '';
      this.plannerMemory.set(stored);
      this.originalPlannerMemory.set(stored);
    }).catch(async err => {
      console.error('[SettingsAiStateService] loadPlannerMemory error', err);
      await this.toast.present(this.translate.instant('settings.loadError'), { color: 'danger' });
    });
  }
}
