import { Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AudioPlayer } from './audio-player';
import { AudioVisualizer } from './audio-visualizer';
import { SettingsModal } from './settings-modal';
import { SettingsPanelService } from './settings-panel.service';
import { TrackQueue } from './track-queue';

type NavSection = 'home' | 'artist' | 'album' | 'genre' | 'playlist' | 'library' | null;

const GRID_TYPES = ['artist', 'album', 'genre', 'playlist'];

/** Resolves which nav button represents a URL, ignoring trailing page-number params. */
function resolveNavSection(url: string): NavSection {
  const segments = url.split('?')[0].split('/').filter(Boolean);

  if (segments.length === 0) {
    return 'home';
  }
  if (segments[0] === 'grid' && GRID_TYPES.includes(segments[1])) {
    return segments[1] as NavSection;
  }
  if (segments[0] === 'list') {
    if (segments.length === 2) {
      return 'library';
    }
    if (GRID_TYPES.includes(segments[1])) {
      return segments[1] as NavSection;
    }
  }
  return null;
}

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet, AudioPlayer, AudioVisualizer, TrackQueue, SettingsModal],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('host-app');

  private router = inject(Router);
  protected settingsPanel = inject(SettingsPanelService);
  activeSection = signal<NavSection>(resolveNavSection(this.router.url));
  searchOpen = signal(false);

  @ViewChild('searchInput') private searchInputRef?: ElementRef<HTMLInputElement>;

  constructor() {
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((event) => {
      this.activeSection.set(resolveNavSection((event as NavigationEnd).urlAfterRedirects));
      this.searchOpen.set(false);
    });
  }

  openSearch(): void {
    this.searchOpen.set(true);
    setTimeout(() => this.searchInputRef?.nativeElement.focus());
  }

  closeSearch(): void {
    this.searchOpen.set(false);
  }

  onSearch(event: Event, query: string): void {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      this.router.navigate(['/search', trimmed]);
      this.searchOpen.set(false);
    }
  }
}
