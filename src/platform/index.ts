import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { LocalNotifications } from '@capacitor/local-notifications';

export type AudioOutputMode = 'speaker' | 'earpiece' | 'bluetooth';

export interface PlatformService {
  readonly isNative: boolean;
  readonly platformName: 'web' | 'android' | 'ios';
  initialize(): Promise<void>;
  teardown(): Promise<void>;
  requestPermissions(): Promise<{ audio: boolean; notifications: boolean }>;
  setAudioMode(mode: AudioOutputMode): Promise<boolean>;
  getAudioMode(): Promise<AudioOutputMode>;
  showIncomingCallNotification(callerPeerId: string): Promise<void>;
  cancelIncomingCallNotification(): Promise<void>;
  onAppStateChange(callback: (isActive: boolean) => void): () => void;
  onBackButton(callback: (canGoBack: boolean) => boolean | void): () => void;
  acquireWakeLock(): Promise<void>;
  releaseWakeLock(): Promise<void>;
}

class WebPlatformService implements PlatformService {
  readonly isNative = false;
  readonly platformName = 'web' as const;
  private currentAudioMode: AudioOutputMode = 'speaker';
  private activeNotification: Notification | null = null;

  async initialize(): Promise<void> {}
  async teardown(): Promise<void> { this.cancelIncomingCallNotification(); }

  async requestPermissions(): Promise<{ audio: boolean; notifications: boolean }> {
    let audio = false, notifications = false;
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        audio = true;
      } catch {}
    }
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        notifications = Notification.permission === 'granted' ||
          (Notification.permission !== 'denied' && (await Notification.requestPermission()) === 'granted');
      } catch {}
    }
    return { audio, notifications };
  }

  async setAudioMode(mode: AudioOutputMode): Promise<boolean> {
    this.currentAudioMode = mode;
    return true;
  }

  async getAudioMode(): Promise<AudioOutputMode> {
    return this.currentAudioMode;
  }

  async showIncomingCallNotification(callerPeerId: string): Promise<void> {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      this.cancelIncomingCallNotification();
      this.activeNotification = new Notification('SecureVoice Incoming Call', {
        body: `Incoming encrypted voice call from ${callerPeerId}`,
        icon: '/favicon.png',
        tag: 'securevoice-incoming-call',
        requireInteraction: true
      });
    } catch {}
  }

  async cancelIncomingCallNotification(): Promise<void> {
    if (this.activeNotification) {
      try { this.activeNotification.close(); } catch {}
      this.activeNotification = null;
    }
  }

  onAppStateChange(callback: (isActive: boolean) => void): () => void {
    if (typeof document === 'undefined') return () => {};
    const handler = () => callback(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }

  onBackButton(callback: (canGoBack: boolean) => boolean | void): () => void {
    if (typeof window === 'undefined') return () => {};
    const handler = () => callback(window.history.length > 1);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }

  async acquireWakeLock(): Promise<void> {}
  async releaseWakeLock(): Promise<void> {}
}

interface KeepAlivePlugin {
  isBatteryOptimizationIgnored(): Promise<{ ignored: boolean }>;
  requestIgnoreBatteryOptimization(): Promise<void>;
  startKeepAliveWatchdog(): Promise<void>;
  acquireWakeLock(): Promise<void>;
  releaseWakeLock(): Promise<void>;
}

interface AudioRoutingPlugin {
  setAudioMode(options: { mode: string }): Promise<{ success: boolean; mode: string }>;
  getAudioMode?(): Promise<{ mode: string }>;
}

const KeepAlive = registerPlugin<KeepAlivePlugin>('KeepAlive');
const AudioRouting = registerPlugin<AudioRoutingPlugin>('AudioRouting');
const INCOMING_CALL_NOTIFICATION_ID = 911;

class AndroidPlatformService implements PlatformService {
  readonly isNative = true;
  readonly platformName = 'android' as const;
  private currentAudioMode: AudioOutputMode = 'speaker';

  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    try {
      await ForegroundService.startForegroundService({
        id: 112,
        title: 'SecureVoice Active',
        body: 'Waiting for P2P encrypted connections...',
        smallIcon: 'ic_launcher'
      });
    } catch (e: any) {
      console.warn('[AndroidPlatform] Foreground service start error:', e?.message || e);
    }
    try {
      await KeepAlive.startKeepAliveWatchdog();
    } catch (e: any) {
      console.warn('[AndroidPlatform] KeepAlive watchdog error:', e?.message || e);
    }
    try {
      const { ignored } = await KeepAlive.isBatteryOptimizationIgnored();
      if (!ignored) await KeepAlive.requestIgnoreBatteryOptimization();
    } catch (e: any) {
      console.warn('[AndroidPlatform] Battery optimization prompt error:', e?.message || e);
    }
  }

  async teardown(): Promise<void> {
    await this.cancelIncomingCallNotification();
  }

  async requestPermissions(): Promise<{ audio: boolean; notifications: boolean }> {
    let audio = false, notifications = false;
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        audio = true;
      } catch {}
    }
    try {
      const perms = await LocalNotifications.checkPermissions();
      notifications = perms.display === 'granted' || (await LocalNotifications.requestPermissions()).display === 'granted';
    } catch {}
    return { audio, notifications };
  }

  async setAudioMode(mode: AudioOutputMode): Promise<boolean> {
    this.currentAudioMode = mode;
    try {
      const res = await AudioRouting.setAudioMode({ mode });
      return !!res?.success;
    } catch (e: any) {
      console.error('[AndroidPlatform] Failed to set native audio mode:', e);
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
    } catch {}
    return this.currentAudioMode;
  }

  async showIncomingCallNotification(callerPeerId: string): Promise<void> {
    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: INCOMING_CALL_NOTIFICATION_ID,
          title: 'Incoming SecureVoice Call',
          body: `Encrypted call from ${callerPeerId}`,
          ongoing: true,
          autoCancel: false,
          smallIcon: 'ic_launcher'
        }]
      });
    } catch (e: any) {
      console.warn('[AndroidPlatform] Failed to schedule call notification:', e);
    }
  }

  async cancelIncomingCallNotification(): Promise<void> {
    try {
      await LocalNotifications.cancel({ notifications: [{ id: INCOMING_CALL_NOTIFICATION_ID }] });
    } catch {}
  }

  onAppStateChange(callback: (isActive: boolean) => void): () => void {
    let handle: any = null;
    CapacitorApp.addListener('appStateChange', ({ isActive }) => callback(isActive))
      .then(h => { handle = h; })
      .catch(() => {});
    return () => { handle?.remove?.(); };
  }

  onBackButton(callback: (canGoBack: boolean) => boolean | void): () => void {
    let handle: any = null;
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (!callback(canGoBack)) {
        if (!canGoBack) CapacitorApp.minimizeApp();
        else window.history.back();
      }
    }).then(h => { handle = h; }).catch(() => {});
    return () => { handle?.remove?.(); };
  }

  async acquireWakeLock(): Promise<void> {
    try {
      await KeepAlive.acquireWakeLock();
    } catch (e) {
      console.warn('[AndroidPlatform] Failed to acquire wake lock:', e);
    }
  }

  async releaseWakeLock(): Promise<void> {
    try {
      await KeepAlive.releaseWakeLock();
    } catch (e) {
      console.warn('[AndroidPlatform] Failed to release wake lock:', e);
    }
  }
}

export const webPlatform: PlatformService = new WebPlatformService();
export const androidPlatform: PlatformService = new AndroidPlatformService();

function selectPlatform(): PlatformService {
  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      return androidPlatform;
    }
  } catch {}
  return webPlatform;
}

export const platform: PlatformService = selectPlatform();
