import { AudioOutputMode, PlatformService } from './types';

class WebPlatformService implements PlatformService {
  readonly isNative = false;
  readonly platformName = 'web' as const;

  private currentAudioMode: AudioOutputMode = 'speaker';
  private activeNotification: Notification | null = null;

  async initialize(): Promise<void> {
    // Web requires no native background services
  }

  async teardown(): Promise<void> {
    this.cancelIncomingCallNotification();
  }

  async requestPermissions(): Promise<{ audio: boolean; notifications: boolean }> {
    let audioGranted = false;
    let notifGranted = false;

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        audioGranted = true;
      } catch (e) {
        audioGranted = false;
      }
    }

    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        if (Notification.permission === 'granted') {
          notifGranted = true;
        } else if (Notification.permission !== 'denied') {
          const res = await Notification.requestPermission();
          notifGranted = res === 'granted';
        }
      } catch (e) {
        notifGranted = false;
      }
    }

    return { audio: audioGranted, notifications: notifGranted };
  }

  async setAudioMode(mode: AudioOutputMode): Promise<boolean> {
    this.currentAudioMode = mode;
    return true;
  }

  async getAudioMode(): Promise<AudioOutputMode> {
    return this.currentAudioMode;
  }

  async showIncomingCallNotification(callerPeerId: string): Promise<void> {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      this.cancelIncomingCallNotification();
      this.activeNotification = new Notification('SecureVoice Incoming Call', {
        body: `Incoming encrypted voice call from ${callerPeerId}`,
        icon: '/favicon.png',
        tag: 'securevoice-incoming-call',
        requireInteraction: true
      });
    } catch (e) {}
  }

  async cancelIncomingCallNotification(): Promise<void> {
    if (this.activeNotification) {
      try {
        this.activeNotification.close();
      } catch (e) {}
      this.activeNotification = null;
    }
  }

  onAppStateChange(callback: (isActive: boolean) => void): () => void {
    if (typeof document === 'undefined') return () => {};

    const handler = () => {
      callback(document.visibilityState === 'visible');
    };

    document.addEventListener('visibilitychange', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
    };
  }

  onBackButton(callback: (canGoBack: boolean) => boolean | void): () => void {
    if (typeof window === 'undefined') return () => {};

    const handler = () => {
      const canGoBack = window.history.length > 1;
      callback(canGoBack);
    };

    window.addEventListener('popstate', handler);
    return () => {
      window.removeEventListener('popstate', handler);
    };
  }
}

export const webPlatform = new WebPlatformService();
