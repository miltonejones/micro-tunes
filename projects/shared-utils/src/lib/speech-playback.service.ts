import { Injectable } from '@angular/core';
import { SpeechCallback } from './models';

@Injectable({
  providedIn: 'root',
})
export class SpeechPlaybackService {
  speak(
    messageContent: string,
    onSpeechStart: SpeechCallback | null = null,
    onSpeechEnd: SpeechCallback | null = null,
  ): void {
    const utterance = new SpeechSynthesisUtterance(messageContent);

    utterance.onstart = (event) => onSpeechStart?.(event, messageContent);
    utterance.onend = (event) => onSpeechEnd?.(event, messageContent);
    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event.error);
      onSpeechEnd?.();
    };

    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = 'en-US';

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    window.speechSynthesis.speak(utterance);
  }

  stop(): void {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
  }

  pause(): void {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
    }
  }

  resume(): void {
    window.speechSynthesis.resume();
  }

  isSpeaking(): boolean {
    return window.speechSynthesis.speaking;
  }

  getAvailableVoices(): SpeechSynthesisVoice[] {
    return window.speechSynthesis.getVoices();
  }
}
