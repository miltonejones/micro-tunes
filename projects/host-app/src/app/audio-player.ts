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
  CastService,
  formatDuration,
  ImgFallbackDirective,
  ITrackItem,
  SpeechPlaybackService,
} from 'shared-utils';
import { AnnouncerSettingsService } from './announcer-settings.service';
import { AudioAnalyserService } from './audio-analyser.service';
import { AudioVisualizerPanelService } from './audio-visualizer-panel.service';
import { CastButton } from './cast-button';
import { TrackQueuePanelService } from './track-queue-panel.service';

const ANNOUNCING_VOLUME = 0.3;

@Component({
  selector: 'app-audio-player',
  imports: [CastButton, ImgFallbackDirective],
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
  private castService = inject(CastService);
  protected queuePanel = inject(TrackQueuePanelService);
  protected visualizerPanel = inject(AudioVisualizerPanelService);
  private subscriptions: Subscription[] = [];

  track = signal<ITrackItem | null>(null);
  isPlaying = signal(false);
  announcing = signal(false);
  currentTime = signal(0);
  duration = signal(0);
  isExpanded = signal(false);
  protected isCasting = signal(false);

  private playRequestId = 0;
  private corsRetryAttempted = false;

  progress = computed(() => (this.duration() ? (this.currentTime() / this.duration()) * 100 : 0));
  currentTimeLabel = computed(() => formatDuration(this.currentTime()));
  durationLabel = computed(() => formatDuration(this.duration()));

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    // Listen for track changes from the queue / global command service.
    this.subscriptions.push(
      this.audioPlayerCommand.currentTrack$.subscribe((track) => {
        this.track.set(track);
        if (track) {
          this.loadAndPlay(track);
        }
      }),
    );

    // Watch Cast connection state — hand off / reclaim playback.
    this.subscriptions.push(
      this.castService.isConnected$.subscribe((connected) => {
        const previouslyCasting = this.isCasting();
        this.isCasting.set(connected);

        if (connected && !previouslyCasting) {
          // User just connected to a Cast device while playing locally.
          this.onCastConnected();
        } else if (!connected && previouslyCasting) {
          // User just disconnected / session ended while Cast was playing.
          this.onCastDisconnected();
        }
      }),
    );

    // During Cast, drive UI from CastService observables instead of <audio> events.
    this.subscriptions.push(
      this.castService.isPlaying$.subscribe((v) => {
        if (this.isCasting()) this.isPlaying.set(v);
      }),
      this.castService.currentTime$.subscribe((v) => {
        if (this.isCasting()) this.currentTime.set(v);
      }),
      this.castService.duration$.subscribe((v) => {
        if (this.isCasting()) this.duration.set(v);
      }),
    );

    // Auto-advance when a track finishes on the Cast device.
    this.subscriptions.push(
      this.castService.playerState$.subscribe((state) => {
        if (this.isCasting() && state === 'IDLE' && this.castService.isConnected$.value) {
          this.advanceTrack(1);
        }
      }),
    );
  }

  ngOnDestroy(): void {
    for (const s of this.subscriptions) s.unsubscribe();
  }

  // ── Cast transition helpers ──────────────────────────────────────────────────

  /**
   * The user connected to a Cast device while something was playing locally.
   * Pause the native element, hand the current track + position to the Cast
   * device, then let CastService drive the UI.
   */
  private onCastConnected(): void {
    const currentTrack = this.track();
    const position = this.audioEl.currentTime;

    // Pause native playback
    this.audioEl.pause();
    this.speechPlayback.pause();

    if (currentTrack) {
      this.castService.loadTrack(currentTrack);
      if (position > 0) {
        // Small delay to let the Cast device start loading, then seek
        setTimeout(() => this.castService.seekTo(position), 500);
      }
      this.castService.play();
    }
  }

  /**
   * The Cast session ended while playing. Read the Cast position, load
   * the same track on the native <audio> element, seek to the position,
   * and resume local playback.
   */
  private onCastDisconnected(): void {
    const currentTrack = this.track();
    const castPosition = this.castService.currentTime$.value;

    if (currentTrack && castPosition > 0) {
      this.loadAudioElement(currentTrack, castPosition);
    }
  }

  // ─── Core playback ───────────────────────────────────────────────────────────

  private get audioEl(): HTMLAudioElement {
    return this.audioElRef.nativeElement;
  }

  private async loadAndPlay(track: ITrackItem): Promise<void> {
    const requestId = ++this.playRequestId;

    if (this.isCasting()) {
      this.castService.loadTrack(track);

      // Announcement — TTS plays locally while volume ducks on Cast.
      const settings = this.announcerSettings.settings();
      if (settings.enabled) {
        this.announcing.set(true);
        await this.announcementCommand.announceTrackChange(
          track.artistName, track.Title, track.trackTime,
          settings.name, settings.zip, settings.chatType,
          () => this.setVolume(ANNOUNCING_VOLUME),
          () => this.setVolume(1),
          () => this.setVolume(1),
        );
      }

      this.announcing.set(false);
      return;
    }

    // Local playback
    this.corsRetryAttempted = false;
    this.audioAnalyser.setAvailable(true);
    this.audioAnalyser.initialize(this.audioEl);
    this.audioEl.crossOrigin = 'anonymous';
    this.audioEl.src = buildPlayerUrl(track.FileKey);

    const settings = this.announcerSettings.settings();
    if (settings.enabled) {
      this.announcing.set(true);
      await this.announcementCommand.announceTrackChange(
        track.artistName, track.Title, track.trackTime,
        settings.name, settings.zip, settings.chatType,
        () => this.setVolume(ANNOUNCING_VOLUME),
        () => this.setVolume(1),
        () => this.setVolume(1),
      );
    }

    if (requestId !== this.playRequestId) return;

    this.announcing.set(false);
    this.play();
  }

  /** Load a track on the native <audio> element, optionally seeking to a position. */
  private loadAudioElement(track: ITrackItem, seekToPosition = 0): void {
    this.corsRetryAttempted = false;
    this.audioAnalyser.setAvailable(true);
    this.audioAnalyser.initialize(this.audioEl);
    this.audioEl.crossOrigin = 'anonymous';
    this.audioEl.src = buildPlayerUrl(track.FileKey);

    if (seekToPosition > 0) {
      const onLoaded = () => {
        this.audioEl.currentTime = Math.min(seekToPosition, this.audioEl.duration || seekToPosition);
        this.audioEl.removeEventListener('loadedmetadata', onLoaded);
      };
      this.audioEl.addEventListener('loadedmetadata', onLoaded);
    }

    this.play();
  }

  // ── Public methods ───────────────────────────────────────────────────────────

  play(): void {
    if (this.isCasting()) {
      this.castService.play();
      return;
    }

    const context = this.audioAnalyser.audioContext();
    if (context?.state === 'suspended') {
      context.resume();
    }
    this.audioEl.play().catch((error) => console.error('Play failed:', error));
    this.speechPlayback.resume();
  }

  pause(): void {
    if (this.isCasting()) {
      this.castService.pause();
      return;
    }
    this.audioEl.pause();
    this.speechPlayback.pause();
  }

  togglePlayPause(): void {
    this.isPlaying() ? this.pause() : this.play();
  }

  stop(): void {
    if (this.isCasting()) {
      this.castService.disconnect();
    }
    this.audioEl.pause();
    this.speechPlayback.stop();
    this.audioEl.currentTime = 0;
    this.audioPlayerCommand.clearQueue();
    this.isExpanded.set(false);
  }

  seekTo(time: number): void {
    if (this.isCasting()) {
      this.castService.seekTo(time);
      return;
    }
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

  // ── Template-bound <audio> event handlers ────────────────────────────────────

  onSeekInput(event: Event): void {
    const percent = Number((event.target as HTMLInputElement).value);
    const dur = this.isCasting() ? this.duration() : this.audioEl.duration;
    this.seekTo((percent / 100) * dur);
  }

  onPlay(): void {
    if (!this.isCasting()) this.isPlaying.set(true);
  }

  onPause(): void {
    if (!this.isCasting()) this.isPlaying.set(false);
  }

  onEnded(): void {
    if (!this.isCasting()) this.advanceTrack(1);
  }

  onTimeUpdate(): void {
    if (!this.isCasting()) this.currentTime.set(this.audioEl.currentTime);
  }

  onLoadedMetadata(): void {
    if (!this.isCasting()) this.duration.set(this.audioEl.duration);
  }

  /** Fires when the audio element fails to load/play its current source. The most
   * common cause is requesting with crossOrigin set against a track whose host
   * doesn't actually support CORS — fall back to a non-CORS load so playback still
   * works, at the cost of the analyser not getting readable data. */
  onAudioError(): void {
    if (this.isCasting() || this.corsRetryAttempted || this.audioEl.crossOrigin === null) {
      return;
    }

    this.corsRetryAttempted = true;
    this.audioAnalyser.setAvailable(false);
    this.audioEl.crossOrigin = null;
    this.audioEl.load();
    this.play();
  }
}
