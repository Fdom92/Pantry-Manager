import { computed, inject, Injectable, signal } from '@angular/core';
import {
  SETUP_CATEGORY_OPTIONS,
  SETUP_LOCATION_OPTIONS,
  SETUP_STEPS,
  SETUP_STORAGE_KEY,
  SetupStepKey,
} from '@core/constants';
import { AppPreferencesService } from '@core/services/settings/app-preferences.service';
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
  private readonly preferences = inject(AppPreferencesService);
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
  readonly canContinue = computed(() => {
    const step = this.currentStep();
    if (step.key === 'categories') {
      return true;
    }
    return this.selectedLocations().size > 0;
  });
  readonly primaryActionLabelKey = computed(() =>
    this.isLastStep() ? 'setup.actions.finish' : 'setup.actions.continue',
  );
  readonly currentOptions = computed<SetupOptionViewModel[]>(() => {
    const step = this.currentStep();
    const selections = step.key === 'locations' ? this.selectedLocations() : this.selectedCategories();
    return step.options.map(option => ({
      id: option.id,
      label: this.translate.instant(option.labelKey),
      selected: selections.has(option.id),
    }));
  });

  toggleOption(optionId: string): void {
    const step = this.currentStep();
    if (step.key === 'locations') {
      this.selectedLocations.set(this.toggleSelection(this.selectedLocations(), optionId));
      return;
    }
    this.selectedCategories.set(this.toggleSelection(this.selectedCategories(), optionId));
  }

  async skipStep(): Promise<void> {
    this.clearSelections(this.currentStep().key);
    await this.advanceStep();
  }

  async continueStep(): Promise<void> {
    await this.advanceStep();
  }

  private async advanceStep(): Promise<void> {
    if (this.isLastStep()) {
      await this.persistSelections();
      this.persistSetupFlag();
      await this.navCtrl.navigateRoot('/dashboard');
      return;
    }
    this.currentStepIndex.update(value => value + 1);
  }

  private isLastStep(): boolean {
    return this.currentStepIndex() >= this.steps.length - 1;
  }

  private toggleSelection(current: Set<string>, optionId: string): Set<string> {
    const next = new Set(current);
    if (next.has(optionId)) {
      next.delete(optionId);
    } else {
      next.add(optionId);
    }
    return next;
  }

  private clearSelections(stepKey: SetupStepKey): void {
    if (stepKey === 'locations') {
      this.selectedLocations.set(new Set());
      return;
    }
    this.selectedCategories.set(new Set());
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
    const selections = stepKey === 'locations' ? this.selectedLocations() : this.selectedCategories();
    return options
      .filter(option => selections.has(option.id))
      .map(option => this.translate.instant(option.labelKey));
  }

  private persistSetupFlag(): void {
    try {
      localStorage.setItem(SETUP_STORAGE_KEY, 'true');
    } catch (err) {
      console.warn('[Setup] failed to persist setup flag', err);
    }
  }
}
