import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { AudioPlayerCommandService, CastService } from 'shared-utils';
import { AudioAnalyserService } from './audio-analyser.service';
import { AudioVisualizerPanelService } from './audio-visualizer-panel.service';

const BAR_GRADIENT_START = '#4f46e5';
const BAR_GRADIENT_END = '#ec4899';
const GRID_LINE_SPACING = 20;

@Component({
  selector: 'app-audio-visualizer',
  imports: [],
  templateUrl: './audio-visualizer.html',
  styleUrl: './audio-visualizer.css',
})
export class AudioVisualizer implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('canvasEl') private canvasRef!: ElementRef<HTMLCanvasElement>;

  private audioAnalyserService = inject(AudioAnalyserService);
  private audioPlayerCommand = inject(AudioPlayerCommandService);
  private visualizerPanel = inject(AudioVisualizerPanelService);
  protected castService: CastService = inject(CastService);
  private animationFrameId?: number;
  private dataArray?: Uint8Array<ArrayBuffer>;

  hasTrack = signal(false);

  isVisible = computed(
    () => this.hasTrack() && this.audioAnalyserService.available() && this.visualizerPanel.isOpen(),
  );

  showPanel = computed(
    () =>
      this.isVisible() ||
      (this.hasTrack() && this.castService.isConnected() && this.visualizerPanel.isOpen()),
  );

  ngOnInit(): void {
    this.audioPlayerCommand.currentTrack$.subscribe((track) => {
      this.hasTrack.set(!!track);
    });
  }

  ngAfterViewInit(): void {
    const draw = () => {
      this.animationFrameId = requestAnimationFrame(draw);
      this.drawFrame();
    };
    draw();
  }

  ngOnDestroy(): void {
    if (this.animationFrameId !== undefined) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  private drawFrame(): void {
    const analyser = this.audioAnalyserService.analyser();
    const canvas = this.canvasRef?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!analyser || !ctx) {
      return;
    }

    if (!this.dataArray || this.dataArray.length !== analyser.frequencyBinCount) {
      this.dataArray = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    }
    analyser.getByteFrequencyData(this.dataArray);

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const bufferLength = this.dataArray.length;
    const barWidth = (width / bufferLength) * 2.5;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (this.dataArray[i] / 255) * height;
      const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
      gradient.addColorStop(0, BAR_GRADIENT_START);
      gradient.addColorStop(1, BAR_GRADIENT_END);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }

    this.drawGridOverlay(ctx, width, height);
  }

  private drawGridOverlay(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;

    for (let y = 0; y < height; y += GRID_LINE_SPACING) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }
}
