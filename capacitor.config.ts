import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fdom.pantrymind',
  appName: 'PantryMind',
  webDir: 'www',
  android: {
    // targetSdk 36 forces edge-to-edge on Android 15+: without this the WebView draws
    // under the status and navigation bars, and the bottom buttons of every sheet end
    // up behind the 3-button nav bar. Capacitor defaults to 'disable' until v8.
    adjustMarginsForEdgeToEdge: 'auto',
  },
  plugins: {
    LocalNotifications: {
      // ic_stat_icon_notification must be a white-on-transparent PNG in android/app/src/main/res/drawable/
      smallIcon: 'ic_stat_icon_notification',
      iconColor: '#4CAF50',
      sound: 'default',
    },
  },
};

export default config;
