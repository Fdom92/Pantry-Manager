import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fdom.pantrymind',
  appName: 'PantryMind',
  webDir: 'www',
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
