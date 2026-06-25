import { Injectable, signal } from '@angular/core';

export interface AnnouncerSettings {
  enabled: boolean;
  name: string;
  zip: string;
  chatType: 'deep' | 'announce' | 'claude';
}

const STORAGE_KEY = 'sky-tunes-announcer-settings';

const DEFAULT_SETTINGS: AnnouncerSettings = {
  enabled: true,
  name: 'Milton',
  zip: '',
  chatType: 'deep',
};

@Injectable({
  providedIn: 'root',
})
export class AnnouncerSettingsService {
  settings = signal<AnnouncerSettings>(loadSettings());

  update(next: AnnouncerSettings): void {
    this.settings.set(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
}

function loadSettings(): AnnouncerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}
