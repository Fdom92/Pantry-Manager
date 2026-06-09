# PantryMind — ProGuard rules
# Structured by library/concern for easy auditing and future trimming.
# Paired with proguard-android-optimize.txt (more aggressive shrinker).
#
# Rollback: if a plugin crashes at runtime, flip minifyEnabled back to false
# in android/app/build.gradle and file a bug before the next release attempt.

# ─── Attribute preservation ────────────────────────────────────────────
# Annotations are resolved reflectively at runtime by Capacitor and AndroidX.
# SourceFile + LineNumberTable keep Sentry stack traces readable.
-keepattributes *Annotation*,InnerClasses,Signature,EnclosingMethod
-keepattributes RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations
-keepattributes SourceFile,LineNumberTable

# ─── Capacitor core ────────────────────────────────────────────────────
-keep public class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { *; }
-keepclassmembers @com.getcapacitor.annotation.CapacitorPlugin class * {
    @com.getcapacitor.annotation.PluginMethod *;
    @com.getcapacitor.PluginMethod *;
}
-keep public class * extends com.getcapacitor.BridgeActivity { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }
-keep class com.getcapacitor.JSValue { *; }
-keep class com.getcapacitor.JSObject { *; }
-keep class com.getcapacitor.JSArray { *; }
-keep class com.getcapacitor.PluginCall { *; }

# WebView JS bridge — @JavascriptInterface methods called by name from JS
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ─── Capacitor first-party plugins ─────────────────────────────────────
# @capacitor/app, @capacitor/device, @capacitor/keyboard, @capacitor/share,
# @capacitor/status-bar, @capacitor/preferences, @capacitor/haptics,
# @capacitor/browser, @capacitor/filesystem, @capacitor/local-notifications
-keep class com.capacitorjs.plugins.** { *; }
-keep class com.capacitorjs.** { *; }

# Ionic starter shell / MainActivity
-keep class io.ionic.starter.** { *; }

# ─── Capacitor community / third-party plugins ─────────────────────────
# @capacitor-community/in-app-review ^7.1.0
-keep class com.capacitorcommunity.inappreview.** { *; }

# @capawesome/capacitor-app-update ^7.2.0
-keep class io.capawesome.capacitorjs.** { *; }

# ─── RevenueCat — purchases-capacitor ^11.2.15 ─────────────────────────
-keep class com.revenuecat.** { *; }
-dontwarn com.revenuecat.**

# ─── Sentry — sentry/capacitor ^4 + sentry/angular ^10 ────────────────
# Keep fully: symbolication, ANR detection, and performance traces all need
# intact class names. Sentry ships its own consumer-rules.pro but we mirror
# the essentials here so the mapping upload is the sole post-build step.
-keep class io.sentry.** { *; }
-keep interface io.sentry.** { *; }
-keep class io.sentry.android.** { *; }
-dontwarn io.sentry.**

# ─── PostHog — posthog-js ^1 (JS only; no separate Android native lib) ─
# posthog-js runs in the WebView. Only guard the Android Capacitor bridge
# shim if PostHog ever adds a native Capacitor plugin.
-keep class com.posthog.** { *; }
-dontwarn com.posthog.**

# ─── Google Play services (dragged in by Capacitor plugins) ────────────
-keep class com.google.android.play.core.** { *; }
-keep interface com.google.android.play.core.** { *; }
-dontwarn com.google.android.play.core.**

-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# ─── Android Billing (RevenueCat transitive) ───────────────────────────
-keep class com.android.billingclient.** { *; }
-dontwarn com.android.billingclient.**

# ─── AndroidX lifecycle (release builds can over-strip these) ──────────
-keep class androidx.lifecycle.** { *; }
-dontwarn androidx.lifecycle.**

# ─── Kotlin standard library ───────────────────────────────────────────
-dontwarn kotlin.**
-dontwarn kotlinx.**

# ─── Defensive rules for common Android patterns ───────────────────────
# Native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Enums (Capacitor plugin JS-facing types use enums)
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Parcelables (Android intents, Capacitor plugin extras)
-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}

# ─── Suppress warnings for optional / shaded deps ──────────────────────
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
-dontwarn javax.annotation.**
