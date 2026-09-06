import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { LocalNotifications } from '@capacitor/local-notifications';
import { AudioOutputMode, PlatformService } from './types';

interface KeepAlivePluginInterface {
  isBatteryOptimizationIgnored(): Promise<{ ignored: boolean }>;
  requestIgnoreBatteryOptimization(): Promise<void>;
  startKeepAliveWatchdog(): Promise<void>;
}

interface AudioRoutingPluginInterface {
  setAudioMode(options: { mode: string }): Promise<{ success: boolean; mode: string }>;
  getAudioMode?(): Promise<{ mode: string }>;
}

const KeepAlive = registerPlugin<KeepAlivePluginInterface>('KeepAlive');
const AudioRouting = registerPlugin<AudioRoutingPluginInterface>('AudioRouting');

const INCOMING_CALL_NOTIFICATION_ID = 911;

class AndroidPlatformService implements PlatformService {
  readonly isNative = true;
  readonly platformName = 'android' as const;

  private currentAudioMode: AudioOutputMode = 'speaker';

  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;

    // 1. Start Persistent Android Foreground Service
    try {
      await ForegroundService.startForegroundService({
        id: 112,
        title: 'SecureVoice Active',
        body: 'Waiting for P2P encrypted connections...',
        smallIcon: 'ic_launcher'
      });
    } catch (err: any) {
      console.warn('[AndroidPlatform] Foreground service start error:', err?.message || err);
    }

    // 2. Start Native KeepAlive Watchdog Service
    try {
      await KeepAlive.startKeepAliveWatchdog();
    } catch (err: any) {
      console.warn('[AndroidPlatform] KeepAlive watchdog error:', err?.message || err);
    }

    // 3. Prompt for Battery Optimization Exemption if not yet ignored
    try {
      const { ignored } = await KeepAlive.isBatteryOptimizationIgnored();
      if (!ignored) {
        await KeepAlive.requestIgnoreBatteryOptimization();
      }
    } catch (err: any) {
      console.warn('[AndroidPlatform] Battery optimization prompt error:', err?.message || err);
    }
  }

  async teardown(): Promise<void> {
    // Keep foreground service and watchdog alive for persistent background operation
    await this.cancelIncomingCallNotification();
  }

  async requestPermissions(): Promise<{ audio: boolean; notifications: boolean }> {
    let audioGranted = false;
    let notifGranted = false;

    // Request microphone access
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        audioGranted = true;
      } catch (e) {
        audioGranted = false;
      }
    }

    // Request Android 13+ POST_NOTIFICATIONS
    try {
      const perms = await LocalNotifications.checkPermissions();
      if (perms.display === 'granted') {
        notifGranted = true;
      } else {
        const req = await LocalNotifications.requestPermissions();
        notifGranted = req.display === 'granted';
      }
    } catch (e) {
      notifGranted = false;
    }

    return { audio: audioGranted, notifications: notifGranted };
  }

  async setAudioMode(mode: AudioOutputMode): Promise<boolean> {
    this.currentAudioMode = mode;
    try {
      const res = await AudioRouting.setAudioMode({ mode });
      return !!res?.success;
    } catch (err: any) {
      console.error('[AndroidPlatform] Failed to set native audio mode:', err);
      return false;
    }
  }

  async getAudioMode(): Promise<AudioOutputMode> {
    try {
      if (AudioRouting.getAudioMode) {
        const res = await AudioRouting.getAudioMode();
        if (res?.mode === 'earpiece' || res?.mode === 'speaker' || res?.mode === 'bluetooth') {
          this.currentAudioMode = res.mode;
        }
      }
    } catch (e) {}
    return this.currentAudioMode;
  }

  async showIncomingCallNotification(callerPeerId: string): Promise<void> {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: INCOMING_CALL_NOTIFICATION_ID,
            title: 'Incoming SecureVoice Call',
            body: `Encrypted call from ${callerPeerId}`,
            sound: undefined, // Ringtone is handled by audio engine
            ongoing: true,
            autoCancel: false,
            smallIcon: 'ic_launcher'
          }
        ]
      });
    } catch (err: any) {
      console.warn('[AndroidPlatform] Failed to schedule call notification:', err);
    }
  }

  async cancelIncomingCallNotification(): Promise<void> {
    try {
      await LocalNotifications.cancel({
        notifications: [{ id: INCOMING_CALL_NOTIFICATION_ID }]
      });
    } catch (e) {}
  }

  onAppStateChange(callback: (isActive: boolean) => void): () => void {
    let handle: any = null;
    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      callback(isActive);
    }).then(h => {
      handle = h;
    }).catch(() => {});

    return () => {
      if (handle?.remove) {
        handle.remove();
      }
    };
  }

  onBackButton(callback: (canGoBack: boolean) => boolean | void): () => void {
    let handle: any = null;
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      const handled = callback(canGoBack);
      if (!handled) {
        if (!canGoBack) {
          CapacitorApp.minimizeApp();
        } else {
          window.history.back();
        }
      }
    }).then(h => {
      handle = h;
    }).catch(() => {});

    return () => {
      if (handle?.remove) {
        handle.remove();
      }
    };
  }
}

export const androidPlatform = new AndroidPlatformService();
