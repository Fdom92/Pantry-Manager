import { Injectable, computed, inject, signal } from '@angular/core';
import { PLANNER_MEMORY_MAX_LENGTH } from '@core/constants';
import { withSignalFlag } from '../shared';
import { SettingsPreferencesService } from './settings-preferences.service';
import { TranslateService } from '@ngx-translate/core';
import { normalizeTrim } from '@core/utils/normalization.util';

@Injectable()
export class SettingsAiStateService {
  private readonly appPreferences = inject(SettingsPreferencesService);
  private readonly translate = inject(TranslateService);

  readonly plannerMemory = signal('');
  readonly originalPlannerMemory = signal('');
  readonly isSaving = signal(false);
  readonly isLoading = signal(false);
  readonly plannerMemoryLimit = PLANNER_MEMORY_MAX_LENGTH;

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
      const next = normalizeTrim(this.plannerMemory());
      await this.appPreferences.savePreferences({
        ...current,
        plannerMemory: next,
      });
      this.originalPlannerMemory.set(next);
      this.plannerMemory.set(next);
    }).catch(async (err: unknown) => {
      console.error('[SettingsAiStateService] submitPlannerMemory error', err);
    });
  }

  private async loadPlannerMemory(): Promise<void> {
    await withSignalFlag(this.isLoading, async () => {
      const prefs = await this.appPreferences.getPreferences();
      const stored = prefs.plannerMemory ?? '';
      this.plannerMemory.set(stored);
      this.originalPlannerMemory.set(stored);
    }).catch(async (err: unknown) => {
      console.error('[SettingsAiStateService] loadPlannerMemory error', err);
    });
  }
}
