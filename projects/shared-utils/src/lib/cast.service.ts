import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { ITrackItem } from './models';
import { buildPlayerUrl } from './domain/track';

/**
 * Lightweight ambient declarations for the Cast CAF Sender SDK globals
 * that are loaded at runtime from:
 *   https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1
 *
 * Full type definitions are available via @types/chromecast-caf-sender.
 */
declare namespace cast.framework {
  const CastContext: {
    getInstance(): CastContext;
  };
  const CastState: {
    NO_DEVICES_AVAILABLE: string;
    NOT_CONNECTED: string;
    CONNECTING: string;
    CONNECTED: string;
  };
  const SessionState: {
    SESSION_STARTED: string;
    SESSION_RESUMED: string;
    SESSION_ENDING: string;
    SESSION_ENDED: string;
  };
  const RemotePlayer: new () => RemotePlayer;
  const RemotePlayerController: new (player: RemotePlayer) => RemotePlayerController;
  const CastContextEventType: { SESSION_STATE_CHANGED: string };
  const RemotePlayerEventType: {
    IS_PLAYING_CHANGED: string;
    CURRENT_TIME_CHANGED: string;
    DURATION_CHANGED: string;
    PLAYER_STATE_CHANGED: string;
    VOLUME_LEVEL_CHANGED: string;
    IS_MUTED_CHANGED: string;
  };

  interface CastContext {
    setOptions(options: { receiverApplicationId: string; autoJoinPolicy: string }): void;
    getCastState(): string;
    getSessionState(): string;
    getCurrentSession(): CastSession | null;
    addEventListener(type: string, handler: (event: any) => void): void;
    requestSession(): Promise<void>;
    endCurrentSession(stopCasting: boolean): void;
  }

  interface CastSession {
    getSessionId(): string;
    loadMedia(loadRequest: chrome.cast.media.LoadRequest): Promise<void>;
    addMessageListener(namespace: string, listener: (ns: string, msg: string) => void): void;
    addEventListener(type: string, handler: (event: any) => void): void;
    receiver: { friendlyName: string };
  }

  interface RemotePlayer {
    isConnected: boolean;
    isPaused: boolean;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    volumeLevel: number;
    isMuted: boolean;
    playerState: string;
  }

  interface RemotePlayerController {
    addEventListener(type: string, handler: (event: any) => void): void;
    playOrPause(): void;
    seek(): void;
    setVolumeLevel(level: number): void;
  }
}

declare namespace chrome.cast.media {
  const MetadataType: { MUSIC_TRACK: number };
  class MediaInfo {
    constructor(contentId: string, contentType: string);
    metadata?: MusicTrackMediaMetadata;
    streamDuration?: number;
  }
  class MusicTrackMediaMetadata {
    metadataType: number;
    title?: string;
    artist?: string;
    albumName?: string;
    images?: chrome.cast.Image[];
  }
  class LoadRequest {
    constructor(mediaInfo: MediaInfo);
    autoplay?: boolean;
    currentTime?: number;
  }
}

declare namespace chrome.cast {
  class Image {
    constructor(url: string);
    url: string;
  }
}

// ── Constants ────────────────────────────────────────────────────────────────────

const RECEIVER_APP_ID = 'CC1AD845'; // Default Media Receiver

// ── Service ──────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class CastService {
  /** True when the Cast SDK loaded and Cast devices are available on the network. */
  readonly isAvailable$ = new BehaviorSubject(false);

  /** Exposed as a method for Angular template bindings that cannot reference `$`-suffixed names. */
  isAvailable(): boolean {
    return this.isAvailable$.value;
  }

  /** True while a Cast session is active (connected to a device). */
  readonly isConnected$ = new BehaviorSubject(false);

  /** Convenience getter for template bindings that cannot reference `$`-suffixed names. */
  isConnected(): boolean {
    return this.isConnected$.value;
  }

  /** Playback state on the Cast device. */
  readonly isPlaying$ = new BehaviorSubject(false);

  /** Current playback position (seconds) on the Cast device. */
  readonly currentTime$ = new BehaviorSubject(0);

  /** Duration (seconds) of the current media on the Cast device. */
  readonly duration$ = new BehaviorSubject(0);

  /** Human-readable name of the connected Cast device. */
  readonly deviceName$ = new BehaviorSubject('');

  /** Emits when the device name resolution attempt completes (success or failure). */
  readonly deviceNameResolved = new Subject<string>();

  /** Convenience getter for template bindings. */
  deviceName(): string {
    return this.deviceName$.value;
  }

  /**
   * Raw Cast player state. Possible values: IDLE, LOADING, LOADED, PLAYING,
   * PAUSED, STOPPED, BUFFERING, FINISHED. Consumers can detect FINISHED → IDLE
   * to auto-advance the queue.
   */
  readonly playerState$ = new BehaviorSubject('');

  private remotePlayer: cast.framework.RemotePlayer | null = null;
  private controller: cast.framework.RemotePlayerController | null = null;
  private timePollId: ReturnType<typeof setInterval> | null = null;
  private userInitiatedConnect = false;

  constructor(private zone: NgZone) {
    this.initWhenReady();
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /** Open the Cast dialog so the user can pick a device. */
  connect(): void {
    this.userInitiatedConnect = true;
    getContext()?.requestSession().catch(() => {});
  }

  /** Disconnect from the current Cast session. */
  disconnect(): void {
    getContext()?.endCurrentSession(true);
  }

  /** Toggle play/pause on the Cast device. */
  play(): void {
    this.controller?.playOrPause();
  }

  pause(): void {
    if (this.isPlaying$.value) {
      this.controller?.playOrPause();
    }
  }

  /** Seek to a specific time (seconds) on the Cast device. */
  seekTo(time: number): void {
    if (!this.remotePlayer || !this.controller) return;
    this.remotePlayer.currentTime = Math.max(0, time);
    this.controller.seek();
  }

  /** Set the volume (0–1) on the Cast device. */
  setVolume(level: number): void {
    if (!this.controller) return;
    this.controller.setVolumeLevel(Math.max(0, Math.min(1, level)));
  }

  /**
   * Load a track on the Cast device. Called by AudioPlayer when the user
   * selects a track while a Cast session is active.
   */
  loadTrack(track: ITrackItem): void {
    const ctx = getContext();
    const session = ctx?.getCurrentSession();
    if (!session) return;

    const audioUrl = buildPlayerUrl(track.FileKey);

    // Build media metadata
    const metadata = new chrome.cast.media.MusicTrackMediaMetadata();
    metadata.metadataType = chrome.cast.media.MetadataType.MUSIC_TRACK;
    metadata.title = track.Title;
    metadata.artist = track.artistName;
    metadata.albumName = track.albumName;
    if (track.albumImage) {
      metadata.images = [new chrome.cast.Image(track.albumImage)];
    }

    // Build media info
    const mediaInfo = new chrome.cast.media.MediaInfo(audioUrl, 'audio/mpeg');
    mediaInfo.metadata = metadata;
    if (track.trackTime) {
      mediaInfo.streamDuration = track.trackTime / 1000;
    }

    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    request.autoplay = true;

    session.loadMedia(request).catch(() => {});
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  private initWhenReady(): void {
    if (sdkLoaded()) {
      this.initialize();
      return;
    }

    // The Cast SDK <script> is in index.html.  If it hasn't arrived yet,
    // poll briefly (typically parsed within ~200 ms of DOMContentLoaded).
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      if (sdkLoaded()) {
        clearInterval(poll);
        this.zone.run(() => this.initialize());
      } else if (attempts > 100) {
        clearInterval(poll);
      }
    }, 100);
  }

  private initialize(): void {
    this.setupContext();
    this.setupRemotePlayer();

    // Deferred availability check — the SDK needs a moment to scan the network.
    setTimeout(() => this.syncAvailability(), 2000);
  }

  private setupContext(): void {
    const context = cast.framework.CastContext.getInstance();
    context.setOptions({
      receiverApplicationId: RECEIVER_APP_ID,
      autoJoinPolicy: 'origin_scoped',
    });

    // Listen for session connect / disconnect.
    context.addEventListener(
      cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
      (event: any) => this.zone.run(() => this.onSessionChanged(event)),
    );
  }

  private setupRemotePlayer(): void {
    this.remotePlayer = new cast.framework.RemotePlayer();
    this.controller = new cast.framework.RemotePlayerController(this.remotePlayer);

    this.controller.addEventListener(
      cast.framework.RemotePlayerEventType.IS_PLAYING_CHANGED,
      () => this.zone.run(() => this.isPlaying$.next(this.remotePlayer!.isPlaying)),
    );

    this.controller.addEventListener(
      cast.framework.RemotePlayerEventType.CURRENT_TIME_CHANGED,
      () => this.zone.run(() => this.currentTime$.next(this.remotePlayer!.currentTime)),
    );

    this.controller.addEventListener(
      cast.framework.RemotePlayerEventType.DURATION_CHANGED,
      () => this.zone.run(() => this.duration$.next(this.remotePlayer!.duration)),
    );

    this.controller.addEventListener(
      cast.framework.RemotePlayerEventType.PLAYER_STATE_CHANGED,
      () => this.zone.run(() => {
        const state = this.remotePlayer!.playerState;
        this.playerState$.next(state);

        if (state === 'PLAYING') {
          this.startTimePoll();
        } else {
          this.stopTimePoll();
        }
      }),
    );
  }

  // ── Session handling ─────────────────────────────────────────────────────────

  private onSessionChanged(event: any): void {
    const sessionState: string = event.sessionState;
    const session: cast.framework.CastSession | undefined = event.session;

    const connected =
      sessionState === cast.framework.SessionState.SESSION_STARTED ||
      sessionState === cast.framework.SessionState.SESSION_RESUMED;

    this.isConnected$.next(connected);

    if (connected) {
      // Only emit the toast signal for user-initiated connects, not auto-join.
      const emitToast = this.userInitiatedConnect;
      this.userInitiatedConnect = false;

      // Try the event's session first, then fall back to context lookup.
      // The property path varies across SDK versions and device types.
      const fromEvent = extractFriendlyName(session);
      if (fromEvent) {
        this.deviceName$.next(fromEvent);
        if (emitToast) this.deviceNameResolved.next(fromEvent);
      } else {
        // Retry from context after a brief delay for the SDK to hydrate
        setTimeout(() => this.zone.run(() => {
          const name = extractFriendlyName(getContext()?.getCurrentSession()) ?? '';
          this.deviceName$.next(name);
          if (emitToast) this.deviceNameResolved.next(name);
        }), 1500);
      }
    } else {
      this.deviceName$.next('');
      this.isPlaying$.next(false);
      this.currentTime$.next(0);
      this.duration$.next(0);
      this.playerState$.next('');
      this.stopTimePoll();
    }
  }

  private syncAvailability(): void {
    const ctx = getContext();
    if (!ctx) {
      this.isAvailable$.next(false);
      return;
    }
    const state = ctx.getCastState();
    this.isAvailable$.next(
      state === cast.framework.CastState.NOT_CONNECTED ||
        state === cast.framework.CastState.CONNECTING ||
        state === cast.framework.CastState.CONNECTED,
    );
  }

  // ── Time polling ─────────────────────────────────────────────────────────────

  private startTimePoll(): void {
    if (this.timePollId !== null) return;
    this.timePollId = setInterval(() => {
      if (this.remotePlayer) {
        this.currentTime$.next(this.remotePlayer.currentTime);
      }
    }, 1000);
  }

  private stopTimePoll(): void {
    if (this.timePollId !== null) {
      clearInterval(this.timePollId);
      this.timePollId = null;
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

function getContext(): cast.framework.CastContext | null {
  try {
    return cast?.framework?.CastContext?.getInstance?.() ?? null;
  } catch {
    return null;
  }
}

function sdkLoaded(): boolean {
  return (
    typeof cast !== 'undefined' &&
    typeof cast.framework !== 'undefined' &&
    typeof cast.framework.CastContext !== 'undefined'
  );
}

/** Try several common property paths for the Cast device name. */
function extractFriendlyName(session: any): string | null {
  if (!session) return null;
  return (
    session?.receiver?.friendlyName ??
    session?.receiver?.displayName ??
    session?.receiver?.name ??
    session?.friendlyName ??
    session?.displayName ??
    session?.name ??
    null
  );
}
