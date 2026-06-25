import { Component, effect, inject, signal } from '@angular/core';
import { AnnouncerSettings, AnnouncerSettingsService } from './announcer-settings.service';
import { SettingsPanelService } from './settings-panel.service';

@Component({
  selector: 'app-settings-modal',
  imports: [],
  templateUrl: './settings-modal.html',
  styleUrl: './settings-modal.css',
})
export class SettingsModal {
  private announcerSettings = inject(AnnouncerSettingsService);
  protected panel = inject(SettingsPanelService);

  form = signal<AnnouncerSettings>(this.announcerSettings.settings());

  constructor() {
    effect(() => {
      if (this.panel.isOpen()) {
        this.form.set(this.announcerSettings.settings());
      }
    });
  }

  setField<K extends keyof AnnouncerSettings>(key: K, event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    this.form.update((current) => ({ ...current, [key]: value }) as AnnouncerSettings);
  }

  save(): void {
    this.announcerSettings.update(this.form());
    this.panel.close();
  }

  close(): void {
    this.panel.close();
  }
}
