export type AudioOutputMode = 'speaker' | 'earpiece' | 'bluetooth';

export interface PlatformService {
  readonly isNative: boolean;
  readonly platformName: 'web' | 'android' | 'ios';

  /**
   * Initialize platform-level services (foreground service, watchdogs, lifecycle hooks)
   */
  initialize(): Promise<void>;

  /**
   * Teardown platform-level services
   */
  teardown(): Promise<void>;

  /**
   * Request necessary device permissions (microphone, notifications, battery optimizations)
   */
  requestPermissions(): Promise<{ audio: boolean; notifications: boolean }>;

  /**
   * Route audio output to speaker, earpiece, or bluetooth
   */
  setAudioMode(mode: AudioOutputMode): Promise<boolean>;

  /**
   * Get current active audio routing mode
   */
  getAudioMode(): Promise<AudioOutputMode>;

  /**
   * Display an incoming call alert / notification
   */
  showIncomingCallNotification(callerPeerId: string): Promise<void>;

  /**
   * Dismiss incoming call notification
   */
  cancelIncomingCallNotification(): Promise<void>;

  /**
   * Add listener for app lifecycle state changes (foreground / background)
   */
  onAppStateChange(callback: (isActive: boolean) => void): () => void;

  /**
   * Add listener for hardware back button navigation
   */
  onBackButton(callback: (canGoBack: boolean) => boolean | void): () => void;
}
