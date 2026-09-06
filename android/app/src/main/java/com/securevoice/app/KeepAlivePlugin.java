package com.securevoice.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "KeepAlive")
public class KeepAlivePlugin extends Plugin {
    private static final String TAG = "KeepAlivePlugin";

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
}
