# ProGuard / R8 Rules for SecureVoice Android

# Preserve line numbers and source file for debugging crashes
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Capacitor Core & Plugin Interfaces
-keep public class * extends com.getcapacitor.Plugin
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod public *;
}
-keep class com.getcapacitor.** { *; }

# Audio Routing Plugin
-keep public class com.securevoice.app.AudioRoutingPlugin { *; }
-keepclassmembers class com.securevoice.app.AudioRoutingPlugin {
    @com.getcapacitor.PluginMethod public *;
}

# Capawesome Foreground Service Plugin
-keep public class com.capawesome.capacitorjs.plugins.foregroundservice.** { *; }

# Android WebKit & JavaScript Interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# WebRTC and Audio Services
-keep class android.media.** { *; }
-keep class android.net.** { *; }
