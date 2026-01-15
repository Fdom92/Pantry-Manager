import { Injectable, inject } from '@angular/core';
import { SettingsStateService } from '@core/services/settings';
import packageJson from '../../../../../package.json';

@Injectable()
export class SettingsFacade {
  private readonly state = inject(SettingsStateService);

  readonly appVersion = packageJson.version ?? '0.0.0';
  readonly isPro$ = this.state.isPro$;
  readonly themePreference = this.state.themePreference;
  readonly isExportingData = this.state.isExportingData;
  readonly isImportingData = this.state.isImportingData;
  readonly isResettingData = this.state.isResettingData;
  readonly isUpdatingTheme = this.state.isUpdatingTheme;

  async ionViewWillEnter(): Promise<void> {
    await this.state.ionViewWillEnter();
  }

  async resetApplicationData(): Promise<void> {
    await this.state.resetApplicationData();
  }

  triggerImportPicker(fileInput: HTMLInputElement | null): void {
    this.state.triggerImportPicker(fileInput);
  }

  async exportDataBackup(): Promise<void> {
    await this.state.exportDataBackup();
  }

  async handleImportFileSelection(event: Event): Promise<void> {
    await this.state.handleImportFileSelection(event);
  }

  async updateThemePreference(value: string | number | null | undefined): Promise<void> {
    await this.state.updateThemePreference(value);
  }

  navigateToUpgrade(): void {
    this.state.navigateToUpgrade();
  }
}

