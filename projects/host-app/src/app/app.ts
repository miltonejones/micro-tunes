import { Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Toast } from 'shared-utils';
import { AudioPlayer } from './audio-player';
import { AudioVisualizer } from './audio-visualizer';
import { SettingsModal } from './settings-modal';
import { SettingsPanelService } from './settings-panel.service';
import { TrackQueue } from './track-queue';

type NavSection = 'home' | 'artist' | 'album' | 'genre' | 'playlist' | 'library' | null;

const GRID_TYPES = ['artist', 'album', 'genre', 'playlist'];

const SECTION_LABELS: Record<string, string> = {
  artist: 'Artists',
  album: 'Albums',
  genre: 'Genres',
  playlist: 'Playlists',
  library: 'Library',
  home: 'Home',
};

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

/** Derives a breadcrumb-like page title from the current URL. */
function pageTitleFromUrl(url: string): string {
  const segments = url.split('?')[0].split('/').filter(Boolean);

  if (segments.length === 0) {
    return 'SkyTunes | Home';
  }

  if (segments[0] === 'search') {
    const query = decodeURIComponent(segments[1] ?? '');
    return `SkyTunes | Search: ${query}`;
  }

  if (segments[0] === 'grid' && GRID_TYPES.includes(segments[1])) {
    return `SkyTunes | Home > ${SECTION_LABELS[segments[1]]}`;
  }

  if (segments[0] === 'list') {
    if (segments.length === 2) {
      return 'SkyTunes | Home > Library';
    }
    if (GRID_TYPES.includes(segments[1])) {
      return `SkyTunes | Home > ${SECTION_LABELS[segments[1]]}`;
    }
  }

  return 'SkyTunes';
}

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet, AudioPlayer, AudioVisualizer, TrackQueue, SettingsModal, Toast],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private router = inject(Router);
  private titleService = inject(Title);
  protected settingsPanel = inject(SettingsPanelService);
  activeSection = signal<NavSection>(resolveNavSection(this.router.url));
  searchOpen = signal(false);

  @ViewChild('searchInput') private searchInputRef?: ElementRef<HTMLInputElement>;

  constructor() {
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((event) => {
      const navEvent = event as NavigationEnd;
      this.activeSection.set(resolveNavSection(navEvent.urlAfterRedirects));
      this.searchOpen.set(false);
      this.titleService.setTitle(pageTitleFromUrl(navEvent.urlAfterRedirects));
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
