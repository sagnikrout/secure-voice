package com.securevoice.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public static final String CHANNEL_ID_FOREGROUND = "securevoice_foreground";
    public static final String CHANNEL_ID_CALLS = "securevoice_incoming_calls";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AudioRoutingPlugin.class);
        registerPlugin(KeepAlivePlugin.class);
        super.onCreate(savedInstanceState);
        configureLockScreenVisibility();
        createNotificationChannels();
    }

    @Override
    public void onBackPressed() {
        moveTaskToBack(true);
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }

    private void configureLockScreenVisibility() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            );
        }
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager == null) return;

            // Channel 1: Low-priority silent ongoing readiness
            NotificationChannel foregroundChannel = new NotificationChannel(
                CHANNEL_ID_FOREGROUND,
                "SecureVoice Background Readiness",
                NotificationManager.IMPORTANCE_LOW
            );
            foregroundChannel.setDescription("Maintains encrypted P2P connection readiness");
            foregroundChannel.setShowBadge(false);
            manager.createNotificationChannel(foregroundChannel);

            // Channel 2: High-priority heads-up channel for incoming calls
            NotificationChannel incomingCallChannel = new NotificationChannel(
                CHANNEL_ID_CALLS,
                "SecureVoice Incoming Calls",
                NotificationManager.IMPORTANCE_HIGH
            );
            incomingCallChannel.setDescription("High-priority incoming call alerts with sound and vibration");
            incomingCallChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            incomingCallChannel.enableVibration(true);
            incomingCallChannel.setBypassDnd(true);
            incomingCallChannel.setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            );
            manager.createNotificationChannel(incomingCallChannel);
        }
    }
}
