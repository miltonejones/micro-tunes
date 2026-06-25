import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Subscription } from 'rxjs';
import {
  AnnouncementCommandService,
  AudioPlayerCommandService,
  buildPlayerUrl,
  formatDuration,
  ImgFallbackDirective,
  ITrackItem,
  SpeechPlaybackService,
} from 'shared-utils';
import { AnnouncerSettingsService } from './announcer-settings.service';
import { AudioAnalyserService } from './audio-analyser.service';
import { AudioVisualizerPanelService } from './audio-visualizer-panel.service';
import { TrackQueuePanelService } from './track-queue-panel.service';

const ANNOUNCING_VOLUME = 0.3;

@Component({
  selector: 'app-audio-player',
  imports: [ImgFallbackDirective],
  templateUrl: './audio-player.html',
  styleUrl: './audio-player.css',
})
export class AudioPlayer implements OnInit, OnDestroy {
  @ViewChild('audioEl') private audioElRef!: ElementRef<HTMLAudioElement>;

  private audioPlayerCommand = inject(AudioPlayerCommandService);
  private announcementCommand = inject(AnnouncementCommandService);
  private announcerSettings = inject(AnnouncerSettingsService);
  private speechPlayback = inject(SpeechPlaybackService);
  private audioAnalyser = inject(AudioAnalyserService);
  protected queuePanel = inject(TrackQueuePanelService);
  protected visualizerPanel = inject(AudioVisualizerPanelService);
  private subscription?: Subscription;

  track = signal<ITrackItem | null>(null);
  isPlaying = signal(false);
  announcing = signal(false);
  currentTime = signal(0);
  duration = signal(0);
  isExpanded = signal(false);

  private playRequestId = 0;
  private corsRetryAttempted = false;

  progress = computed(() => (this.duration() ? (this.currentTime() / this.duration()) * 100 : 0));
  currentTimeLabel = computed(() => formatDuration(this.currentTime()));
  durationLabel = computed(() => formatDuration(this.duration()));

  ngOnInit(): void {
    this.subscription = this.audioPlayerCommand.currentTrack$.subscribe((track) => {
      this.track.set(track);
      if (track) {
        this.loadAndPlay(track);
      }
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private get audioEl(): HTMLAudioElement {
    return this.audioElRef.nativeElement;
  }

  private async loadAndPlay(track: ITrackItem): Promise<void> {
    const requestId = ++this.playRequestId;
    this.corsRetryAttempted = false;
    this.audioAnalyser.setAvailable(true);
    this.audioAnalyser.initialize(this.audioEl);
    this.audioEl.crossOrigin = 'anonymous';
    this.audioEl.src = buildPlayerUrl(track.FileKey);

    const settings = this.announcerSettings.settings();
    if (settings.enabled) {
      this.announcing.set(true);
      await this.announcementCommand.announceTrackChange(
        track.artistName,
        track.Title,
        track.trackTime,
        settings.name,
        settings.zip,
        settings.chatType,
        () => this.setVolume(ANNOUNCING_VOLUME),
        () => this.setVolume(1),
        () => this.setVolume(1),
      );
    }

    if (requestId !== this.playRequestId) {
      return;
    }

    this.announcing.set(false);
    this.play();
  }

  // Public methods for external control, mirroring a standard audio player API.

  play(): void {
    const context = this.audioAnalyser.audioContext();
    if (context?.state === 'suspended') {
      context.resume();
    }
    this.audioEl.play().catch((error) => console.error('Play failed:', error));
    this.speechPlayback.resume();
  }

  pause(): void {
    this.audioEl.pause();
    this.speechPlayback.pause();
  }

  togglePlayPause(): void {
    this.isPlaying() ? this.pause() : this.play();
  }

  stop(): void {
    this.audioEl.pause();
    this.speechPlayback.stop();
    this.audioEl.currentTime = 0;
    this.audioPlayerCommand.clearQueue();
    this.isExpanded.set(false);
  }

  seekTo(time: number): void {
    if (isFinite(this.audioEl.duration)) {
      this.audioEl.currentTime = Math.max(0, Math.min(time, this.audioEl.duration));
    }
  }

  setVolume(volume: number): void {
    this.audioEl.volume = Math.max(0, Math.min(1, volume));
  }

  advanceTrack(offset: number): void {
    if (!this.audioPlayerCommand.advance(offset)) {
      this.stop();
    }
  }

  getCurrentTime(): number {
    return this.audioEl.currentTime;
  }

  getDuration(): number {
    return this.audioEl.duration;
  }

  getIsPlaying(): boolean {
    return this.isPlaying();
  }

  onSeekInput(event: Event): void {
    const percent = Number((event.target as HTMLInputElement).value);
    this.seekTo((percent / 100) * this.audioEl.duration);
  }

  onPlay(): void {
    this.isPlaying.set(true);
  }

  onPause(): void {
    this.isPlaying.set(false);
  }

  onEnded(): void {
    this.advanceTrack(1);
  }

  onTimeUpdate(): void {
    this.currentTime.set(this.audioEl.currentTime);
  }

  onLoadedMetadata(): void {
    this.duration.set(this.audioEl.duration);
  }

  /**
   * Fires when the audio element fails to load/play its current source. The most common
   * cause is requesting with crossOrigin set against a track whose host doesn't actually
   * support CORS for that resource — the browser rejects the response outright rather than
   * just failing to read it. Fall back to a plain (non-CORS) load so playback still works,
   * accepting that the analyser won't get readable data for this track.
   */
  onAudioError(): void {
    if (this.corsRetryAttempted || this.audioEl.crossOrigin === null) {
      return;
    }

    this.corsRetryAttempted = true;
    this.audioAnalyser.setAvailable(false);
    this.audioEl.crossOrigin = null;
    this.audioEl.load();
    this.play();
  }
}
