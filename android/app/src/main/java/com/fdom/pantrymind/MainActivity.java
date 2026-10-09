package com.fdom.pantrymind;

import android.content.res.Configuration;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before super.onCreate builds the bridge.
        registerPlugin(InstallSourcePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // The manifest handles uiMode itself, so a light/dark switch while the app is open
        // does not recreate the activity: the window background (the strips under the
        // transparent system bars) and the bar icon colours have to be resolved again.
        getWindow().setBackgroundDrawableResource(R.drawable.window_background);
        boolean light = getResources().getBoolean(R.bool.light_system_bars);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(light);
        controller.setAppearanceLightNavigationBars(light);
    }
}
