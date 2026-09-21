package com.fdom.pantrymind;

import android.content.pm.PackageManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Reports which package installed this APK ("com.android.vending" = Play).
 * Never rejects: any failure resolves with no installer, and the JS side
 * decides what that means.
 */
@CapacitorPlugin(name = "InstallSource")
public class InstallSourcePlugin extends Plugin {

    @PluginMethod
    public void getInstaller(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            ret.put("installer", readInstaller());
        } catch (Exception e) {
            ret.put("installer", JSObject.NULL);
        }
        call.resolve(ret);
    }

    @SuppressWarnings("deprecation")
    private Object readInstaller() throws PackageManager.NameNotFoundException {
        PackageManager pm = getContext().getPackageManager();
        String pkg = getContext().getPackageName();
        String installer;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            installer = pm.getInstallSourceInfo(pkg).getInstallingPackageName();
        } else {
            installer = pm.getInstallerPackageName(pkg);
        }
        return installer == null ? JSObject.NULL : installer;
    }
}
