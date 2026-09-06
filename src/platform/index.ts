import { Capacitor } from '@capacitor/core';
import { PlatformService } from './types';
import { webPlatform } from './webPlatform';
import { androidPlatform } from './androidPlatform';

function selectPlatform(): PlatformService {
  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      return androidPlatform;
    }
  } catch (e) {}
  return webPlatform;
}

export const platform: PlatformService = selectPlatform();
export * from './types';
