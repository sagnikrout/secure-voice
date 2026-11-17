package com.securevoice.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "KeepAlive")
public class KeepAlivePlugin extends Plugin {
    private static final String TAG = "KeepAlivePlugin";
    public static final int INCOMING_CALL_NOTIFICATION_ID = 911;

    private static KeepAlivePlugin sInstance;
    private static Ringtone sRingtone;
    private static Vibrator sVibrator;
    private static PowerManager.WakeLock sScreenWakeLock;
    private PowerManager.WakeLock wakeLock;

    @Override
    public void load() {
        super.load();
        sInstance = this;
    }

    @Override
    protected void handleOnDestroy() {
        stopAlertInternal(getContext());
        if (sInstance == this) {
            sInstance = null;
        }
        super.handleOnDestroy();
    }

    public static void notifyCallAction(String action) {
        if (sInstance != null) {
            JSObject ret = new JSObject();
            ret.put("action", action);
            sInstance.notifyListeners("callAction", ret);
            Log.d(TAG, "Notified TypeScript listeners of call action: " + action);
        }
    }

    @PluginMethod
    public void isBatteryOptimizationIgnored(PluginCall call) {
        Context context = getContext();
        boolean isIgnored = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                isIgnored = pm.isIgnoringBatteryOptimizations(context.getPackageName());
            }
        }
        JSObject ret = new JSObject();
        ret.put("ignored", isIgnored);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimization(PluginCall call) {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(context.getPackageName())) {
                try {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + context.getPackageName()));
                    getActivity().startActivity(intent);
                    call.resolve();
                    return;
                } catch (Exception e) {
                    Log.w(TAG, "ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS failed, opening settings: " + e.getMessage());
                    try {
                        Intent fallbackIntent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                        getActivity().startActivity(fallbackIntent);
                    } catch (Exception ex) {
                        Log.e(TAG, "Fallback settings open failed: " + ex.getMessage());
                    }
                }
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void acquireWakeLock(PluginCall call) {
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SecureVoice:CallWakeLock");
                wakeLock.acquire();
                Log.d(TAG, "Partial wake lock acquired");
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void releaseWakeLock(PluginCall call) {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
            wakeLock = null;
            Log.d(TAG, "Partial wake lock released");
        }
        call.resolve();
    }

    @PluginMethod
    public void startKeepAliveWatchdog(PluginCall call) {
        Context context = getContext();
        try {
            Intent serviceIntent = new Intent(context, KeepAliveService.class);
            context.startService(serviceIntent);
            Log.d(TAG, "KeepAliveService watchdog started");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start KeepAliveService: " + e.getMessage(), e);
        }
        call.resolve();
    }

    @PluginMethod
    public void triggerIncomingCallAlert(PluginCall call) {
        String callerPeer = call.getString("callerPeer", "Unknown Caller");
        startAlertInternal(getContext(), callerPeer);
        call.resolve();
    }

    @PluginMethod
    public void stopIncomingCallAlert(PluginCall call) {
        stopAlertInternal(getContext());
        call.resolve();
    }

    public static synchronized void startAlertInternal(Context context, String callerPeer) {
        if (context == null) return;
        Log.d(TAG, "Starting native incoming call alert for: " + callerPeer);

        // 1. Wake screen up immediately
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                if (sScreenWakeLock != null && sScreenWakeLock.isHeld()) {
                    sScreenWakeLock.release();
                }
                sScreenWakeLock = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK |
                    PowerManager.ACQUIRE_CAUSES_WAKEUP |
                    PowerManager.ON_AFTER_RELEASE,
                    "SecureVoice:IncomingCallScreenWake"
                );
                sScreenWakeLock.acquire(30000); // Auto-release after 30s
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to acquire screen wake lock: " + e.getMessage());
        }

        // 2. Play native system ringtone
        try {
            if (sRingtone == null) {
                Uri alertUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                if (alertUri == null) {
                    alertUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                }
                sRingtone = RingtoneManager.getRingtone(context, alertUri);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && sRingtone != null) {
                    sRingtone.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
                }
            }
            if (sRingtone != null && !sRingtone.isPlaying()) {
                sRingtone.play();
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to play native ringtone: " + e.getMessage());
        }

        // 3. Native vibration waveform
        try {
            sVibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            if (sVibrator != null && sVibrator.hasVibrator()) {
                long[] pattern = { 0, 1000, 1000 };
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    sVibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    sVibrator.vibrate(pattern, 0);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to start vibrator: " + e.getMessage());
        }

        // 4. Build and dispatch high-priority heads-up & full-screen notification
        try {
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }

            // Full-screen launch intent
            Intent fullScreenIntent = new Intent(context, MainActivity.class);
            fullScreenIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            fullScreenIntent.putExtra("callerPeer", callerPeer);
            fullScreenIntent.putExtra("action", "incoming_call");
            PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(context, 1001, fullScreenIntent, flags);

            // Decline action intent
            Intent declineIntent = new Intent(context, CallActionReceiver.class);
            declineIntent.setAction(CallActionReceiver.ACTION_DECLINE);
            PendingIntent declinePendingIntent = PendingIntent.getBroadcast(context, 1002, declineIntent, flags);

            // Answer action intent
            Intent answerIntent = new Intent(context, CallActionReceiver.class);
            answerIntent.setAction(CallActionReceiver.ACTION_ANSWER);
            PendingIntent answerPendingIntent = PendingIntent.getBroadcast(context, 1003, answerIntent, flags);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, MainActivity.CHANNEL_ID_CALLS)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Incoming SecureVoice Call")
                .setContentText("Encrypted call from " + callerPeer)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(fullScreenPendingIntent)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Decline", declinePendingIntent)
                .addAction(android.R.drawable.ic_menu_call, "Answer", answerPendingIntent);

            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.notify(INCOMING_CALL_NOTIFICATION_ID, builder.build());
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to dispatch incoming call notification: " + e.getMessage(), e);
        }
    }

    public static synchronized void stopAlertInternal(Context context) {
        Log.d(TAG, "Stopping native incoming call alert");

        // Stop ringtone
        try {
            if (sRingtone != null && sRingtone.isPlaying()) {
                sRingtone.stop();
            }
        } catch (Exception e) {
            Log.w(TAG, "Error stopping ringtone: " + e.getMessage());
        }
        sRingtone = null;

        // Stop vibration
        try {
            if (sVibrator != null) {
                sVibrator.cancel();
            }
        } catch (Exception e) {
            Log.w(TAG, "Error stopping vibrator: " + e.getMessage());
        }
        sVibrator = null;

        // Release screen wake lock
        try {
            if (sScreenWakeLock != null && sScreenWakeLock.isHeld()) {
                sScreenWakeLock.release();
            }
        } catch (Exception e) {
            Log.w(TAG, "Error releasing screen wake lock: " + e.getMessage());
        }
        sScreenWakeLock = null;

        // Cancel notification
        if (context != null) {
            try {
                NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (manager != null) {
                    manager.cancel(INCOMING_CALL_NOTIFICATION_ID);
                }
            } catch (Exception e) {
                Log.w(TAG, "Error cancelling call notification: " + e.getMessage());
            }
        }
    }
}
