package com.fdom.pantrymind;

import android.animation.ArgbEvaluator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.LayerDrawable;
import android.view.Gravity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Paints the strips under the transparent system bars (the window background is all that
 * shows there once Capacitor adds the edge-to-edge margins) with the colours the web side
 * resolved from the app theme, and tells Android whether the bar icons should be dark.
 * The web side also dims them while an Ionic overlay is open, because its backdrop only
 * covers the WebView and not these strips.
 */
@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {

    // Taller than any status bar; whatever the WebView covers past it is invisible anyway.
    private static final int TOP_STRIP_DP = 120;

    // Once the web side has sent its colours it owns the strips; the native fallback in
    // MainActivity (system light/dark switch) must stop repainting them with resource colours,
    // or the bars follow the phone's mode while the app, fixed to the other theme, does not.
    private static volatile boolean webControlled = false;

    public static boolean isWebControlled() {
        return webControlled;
    }

    private int currentTop = Color.TRANSPARENT;
    private int currentBottom = Color.TRANSPARENT;
    private boolean hasColors = false;
    private ValueAnimator animator;

    @PluginMethod
    public void setStrips(PluginCall call) {
        final Activity activity = getActivity();
        final String top = call.getString("top");
        final String bottom = call.getString("bottom");
        if (activity == null || top == null || bottom == null) {
            call.resolve();
            return;
        }
        final int toTop;
        final int toBottom;
        try {
            toTop = Color.parseColor(top);
            toBottom = Color.parseColor(bottom);
        } catch (IllegalArgumentException e) {
            call.reject("Invalid colour");
            return;
        }
        final Boolean lightIcons = call.getBoolean("lightBars");
        final int duration = call.getInt("durationMs", 0);

        webControlled = true;
        activity.runOnUiThread(() -> {
            if (lightIcons != null) {
                applyIconAppearance(activity, lightIcons);
            }
            transition(activity, toTop, toBottom, duration);
            call.resolve();
        });
    }

    private void transition(Activity activity, int toTop, int toBottom, int durationMs) {
        if (animator != null) {
            animator.cancel();
        }
        if (!hasColors || durationMs <= 0) {
            paint(activity, toTop, toBottom);
            return;
        }
        final int fromTop = currentTop;
        final int fromBottom = currentBottom;
        final ArgbEvaluator evaluator = new ArgbEvaluator();
        animator = ValueAnimator.ofFloat(0f, 1f);
        animator.setDuration(durationMs);
        animator.addUpdateListener(a -> {
            float t = (float) a.getAnimatedValue();
            paint(
                activity,
                (int) evaluator.evaluate(t, fromTop, toTop),
                (int) evaluator.evaluate(t, fromBottom, toBottom)
            );
        });
        animator.start();
    }

    private void paint(Activity activity, int top, int bottom) {
        currentTop = top;
        currentBottom = bottom;
        hasColors = true;
        activity.getWindow().setBackgroundDrawable(build(activity, top, bottom));
    }

    private Drawable build(Activity activity, int top, int bottom) {
        LayerDrawable layers = new LayerDrawable(new Drawable[] { new ColorDrawable(bottom), new ColorDrawable(top) });
        float density = activity.getResources().getDisplayMetrics().density;
        layers.setLayerGravity(1, Gravity.TOP);
        layers.setLayerHeight(1, Math.round(TOP_STRIP_DP * density));
        return layers;
    }

    private void applyIconAppearance(Activity activity, boolean lightBackground) {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
            activity.getWindow(),
            activity.getWindow().getDecorView()
        );
        controller.setAppearanceLightStatusBars(lightBackground);
        controller.setAppearanceLightNavigationBars(lightBackground);
    }
}
