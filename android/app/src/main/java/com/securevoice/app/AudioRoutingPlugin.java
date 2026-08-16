package com.securevoice.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.PowerManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;

@CapacitorPlugin(name = "AudioRouting")
public class AudioRoutingPlugin extends Plugin {

    private AudioFocusRequest audioFocusRequest = null;
    private PowerManager.WakeLock proximityWakeLock = null;
    private AudioManager.OnAudioFocusChangeListener focusChangeListener = null;

    @Override
    public void load() {
        super.load();
        try {
            PowerManager powerManager = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            if (powerManager != null && powerManager.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) {
                proximityWakeLock = powerManager.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "securevoice:proximity");
                proximityWakeLock.setReferenceCounted(false);
            }
        } catch (Exception e) {
            // Proximity sensor not available
        }
    }

    @PluginMethod
    public void requestAudioFocus(PluginCall call) {
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) {
            call.reject("AudioManager not available");
            return;
        }

        try {
            if (focusChangeListener == null) {
                focusChangeListener = focusChange -> {
                    JSObject ret = new JSObject();
                    if (focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT || focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
                        ret.put("state", "loss_transient");
                        notifyListeners("audioFocusChange", ret);
                    } else if (focusChange == AudioManager.AUDIOFOCUS_LOSS) {
                        ret.put("state", "loss");
                        notifyListeners("audioFocusChange", ret);
                    } else if (focusChange == AudioManager.AUDIOFOCUS_GAIN) {
                        ret.put("state", "gain");
                        notifyListeners("audioFocusChange", ret);
                    }
                };
            }

            int res;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AudioAttributes playbackAttributes = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build();

                audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                        .setAudioAttributes(playbackAttributes)
                        .setAcceptsDelayedFocusGain(false)
                        .setOnAudioFocusChangeListener(focusChangeListener)
                        .build();

                res = audioManager.requestAudioFocus(audioFocusRequest);
            } else {
                res = audioManager.requestAudioFocus(focusChangeListener, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
            }

            JSObject result = new JSObject();
            result.put("granted", res == AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to request audio focus", e);
        }
    }

    @PluginMethod
    public void abandonAudioFocus(PluginCall call) {
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audioManager != null) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
                    audioManager.abandonAudioFocusRequest(audioFocusRequest);
                } else if (focusChangeListener != null) {
                    audioManager.abandonAudioFocus(focusChangeListener);
                }
            } catch (Exception ignored) {}
        }
        releaseProximityLock();
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void setAudioMode(PluginCall call) {
        String mode = call.getString("mode", "earpiece");
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);

        if (audioManager == null) {
            call.reject("AudioManager not available");
            return;
        }

        try {
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                List<AudioDeviceInfo> devices = audioManager.getAvailableCommunicationDevices();
                AudioDeviceInfo targetDevice = null;

                for (AudioDeviceInfo device : devices) {
                    if ("speaker".equals(mode) && device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                        targetDevice = device;
                        break;
                    } else if ("earpiece".equals(mode) && device.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) {
                        targetDevice = device;
                        break;
                    } else if ("bluetooth".equals(mode) && (device.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || device.getType() == AudioDeviceInfo.TYPE_BLE_HEADSET)) {
                        targetDevice = device;
                        break;
                    }
                }

                if (targetDevice != null) {
                    audioManager.setCommunicationDevice(targetDevice);
                } else {
                    audioManager.clearCommunicationDevice();
                }
            } else {
                // Legacy fallback
                if ("speaker".equals(mode)) {
                    if (audioManager.isBluetoothScoOn()) {
                        audioManager.stopBluetoothSco();
                        audioManager.setBluetoothScoOn(false);
                    }
                    audioManager.setSpeakerphoneOn(true);
                } else if ("bluetooth".equals(mode)) {
                    audioManager.setSpeakerphoneOn(false);
                    audioManager.startBluetoothSco();
                    audioManager.setBluetoothScoOn(true);
                } else { // earpiece
                    if (audioManager.isBluetoothScoOn()) {
                        audioManager.stopBluetoothSco();
                        audioManager.setBluetoothScoOn(false);
                    }
                    audioManager.setSpeakerphoneOn(false);
                }
            }

            // Manage Proximity Sensor WakeLock
            if ("earpiece".equals(mode)) {
                acquireProximityLock();
            } else {
                releaseProximityLock();
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("mode", mode);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to set audio mode", e);
        }
    }

    @PluginMethod
    public void getAvailableOutputs(PluginCall call) {
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) {
            call.reject("AudioManager not available");
            return;
        }

        JSArray outputs = new JSArray();
        outputs.put("earpiece");
        outputs.put("speaker");

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                List<AudioDeviceInfo> devices = audioManager.getAvailableCommunicationDevices();
                for (AudioDeviceInfo device : devices) {
                    if (device.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || device.getType() == AudioDeviceInfo.TYPE_BLE_HEADSET) {
                        outputs.put("bluetooth");
                        break;
                    }
                }
            } else {
                AudioDeviceInfo[] devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
                for (AudioDeviceInfo device : devices) {
                    if (device.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || device.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP) {
                        outputs.put("bluetooth");
                        break;
                    }
                }
            }
        } catch (Exception ignored) {}

        JSObject ret = new JSObject();
        ret.put("outputs", outputs);
        call.resolve(ret);
    }

    @PluginMethod
    public void getAudioOutputMode(PluginCall call) {
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) {
            call.reject("AudioManager not available");
            return;
        }

        String mode = "earpiece";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AudioDeviceInfo commDevice = audioManager.getCommunicationDevice();
            if (commDevice != null) {
                if (commDevice.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) mode = "speaker";
                else if (commDevice.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || commDevice.getType() == AudioDeviceInfo.TYPE_BLE_HEADSET) mode = "bluetooth";
                else if (commDevice.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) mode = "earpiece";
            }
        } else {
            if (audioManager.isSpeakerphoneOn()) mode = "speaker";
            else if (audioManager.isBluetoothScoOn()) mode = "bluetooth";
        }

        JSObject ret = new JSObject();
        ret.put("mode", mode);
        call.resolve(ret);
    }

    private void acquireProximityLock() {
        try {
            if (proximityWakeLock != null && !proximityWakeLock.isHeld()) {
                proximityWakeLock.acquire();
            }
        } catch (Exception ignored) {}
    }

    private void releaseProximityLock() {
        try {
            if (proximityWakeLock != null && proximityWakeLock.isHeld()) {
                proximityWakeLock.release();
            }
        } catch (Exception ignored) {}
    }

    @Override
    protected void handleOnDestroy() {
        releaseProximityLock();
        super.handleOnDestroy();
    }
}
