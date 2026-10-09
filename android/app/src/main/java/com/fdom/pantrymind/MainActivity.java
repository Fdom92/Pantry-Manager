package com.fdom.pantrymind;

import android.content.res.Configuration;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before super.onCreate builds the bridge.
        registerPlugin(InstallSourcePlugin.class);
        registerPlugin(SystemBarsPlugin.class);
        super.onCreate(savedInstanceState);
        applyInsetsWithKeyboard();
    }

    /**
     * Capacitor's edge-to-edge handler (adjustMarginsForEdgeToEdge) only takes the system
     * bars and consumes the rest, so the keyboard stopped resizing the WebView: short bottom
     * sheets ended up behind it. Same margins, but the bottom one also follows the keyboard.
     */
    private void applyInsetsWithKeyboard() {
        final WebView webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) v.getLayoutParams();
            mlp.leftMargin = bars.left;
            mlp.topMargin = bars.top;
            mlp.rightMargin = bars.right;
            mlp.bottomMargin = Math.max(bars.bottom, ime.bottom);
            v.setLayoutParams(mlp);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(webView);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // The manifest handles uiMode itself, so a light/dark switch while the app is open
        // does not recreate the activity: the window background (the strips under the
        // transparent system bars) and the bar icon colours have to be resolved again.
        // The web side then overrides them with the app theme's own colours.
        getWindow().setBackgroundDrawableResource(R.drawable.window_background);
        boolean light = getResources().getBoolean(R.bool.light_system_bars);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(light);
        controller.setAppearanceLightNavigationBars(light);
    }
}
