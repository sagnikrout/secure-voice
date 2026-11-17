package com.securevoice.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class CallActionReceiver extends BroadcastReceiver {
    private static final String TAG = "CallActionReceiver";
    public static final String ACTION_DECLINE = "io.github.sagnikrout.securevoice.DECLINE_CALL";
    public static final String ACTION_ANSWER = "io.github.sagnikrout.securevoice.ANSWER_CALL";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        Log.d(TAG, "CallActionReceiver received action: " + action);

        if (ACTION_DECLINE.equals(action)) {
            KeepAlivePlugin.stopAlertInternal(context);
            KeepAlivePlugin.notifyCallAction("decline");
        } else if (ACTION_ANSWER.equals(action)) {
            KeepAlivePlugin.stopAlertInternal(context);
            KeepAlivePlugin.notifyCallAction("answer");

            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.setAction(ACTION_ANSWER);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            try {
                context.startActivity(launchIntent);
            } catch (Exception e) {
                Log.e(TAG, "Failed to launch MainActivity on answer: " + e.getMessage(), e);
            }
        }
    }
}
