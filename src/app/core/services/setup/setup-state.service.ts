import { computed, inject, Injectable, signal } from '@angular/core';
import {
  SETUP_CATEGORY_OPTIONS,
  SETUP_LOCATION_OPTIONS,
  SETUP_STEPS,
  SETUP_STORAGE_KEY,
} from '@core/constants';
import { SetupStepKey } from '@core/models/setup';
import { SettingsPreferencesService } from '@core/services/settings/settings-preferences.service';
import { setBooleanFlag } from '@core/utils/storage-flag.util';
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';

interface SetupOptionViewModel {
  id: string;
  label: string;
  selected: boolean;
}

@Injectable()
export class SetupStateService {
  private readonly navCtrl = inject(NavController);
  private readonly preferences = inject(SettingsPreferencesService);
  private readonly translate = inject(TranslateService);

  readonly steps = SETUP_STEPS;
  readonly currentStepIndex = signal(0);

  private readonly selectedLocations = signal<Set<string>>(new Set());
  private readonly selectedCategories = signal<Set<string>>(new Set());

  readonly currentStep = computed(() => this.steps[this.currentStepIndex()]);
  readonly currentStepIndicator = computed(() =>
    this.translate.instant('setup.stepIndicator', {
      current: this.currentStepIndex() + 1,
      total: this.steps.length,
    }),
  );
  readonly primaryActionLabelKey = computed(() =>
    this.currentStepIndex() >= this.steps.length - 1 ? 'setup.actions.finish' : 'setup.actions.continue',
  );
  readonly currentOptions = computed<SetupOptionViewModel[]>(() => {
    const step = this.currentStep();
    const selections = this.getSelections(step.key);
    return step.options.map(option => ({
      id: option.id,
      label: this.translate.instant(option.labelKey),
      selected: selections.has(option.id),
    }));
  });

  toggleOption(optionId: string): void {
    const step = this.currentStep();
    const selections = new Set(this.getSelections(step.key));
    if (selections.has(optionId)) {
      selections.delete(optionId);
    } else {
      selections.add(optionId);
    }
    this.setSelections(step.key, selections);
  }

  async skipStep(): Promise<void> {
    this.setSelections(this.currentStep().key, new Set());
    await this.advanceStep();
  }

  async continueStep(): Promise<void> {
    await this.advanceStep();
  }

  private async advanceStep(): Promise<void> {
    if (this.currentStepIndex() >= this.steps.length - 1) {
      await this.persistSelections();
      setBooleanFlag(SETUP_STORAGE_KEY, true);
      await this.navCtrl.navigateRoot('/dashboard');
      return;
    }
    this.currentStepIndex.update(value => value + 1);
  }

  private async persistSelections(): Promise<void> {
    const current = await this.preferences.getPreferences();
    const hasLocations = (current.locationOptions ?? []).length > 0;
    const hasCategories = (current.categoryOptions ?? []).length > 0;
    await this.preferences.savePreferences({
      ...current,
      locationOptions: hasLocations ? current.locationOptions : this.getSelectedLabels('locations'),
      categoryOptions: hasCategories ? current.categoryOptions : this.getSelectedLabels('categories'),
    });
  }

  private getSelectedLabels(stepKey: SetupStepKey): string[] {
    const options = stepKey === 'locations' ? SETUP_LOCATION_OPTIONS : SETUP_CATEGORY_OPTIONS;
    const selections = this.getSelections(stepKey);
    return options
      .filter(option => selections.has(option.id))
      .map(option => this.translate.instant(option.labelKey));
  }

  private getSelections(stepKey: SetupStepKey): Set<string> {
    return stepKey === 'locations' ? this.selectedLocations() : this.selectedCategories();
  }

  private setSelections(stepKey: SetupStepKey, selections: Set<string>): void {
    if (stepKey === 'locations') {
      this.selectedLocations.set(selections);
      return;
    }
    this.selectedCategories.set(selections);
  }

}
