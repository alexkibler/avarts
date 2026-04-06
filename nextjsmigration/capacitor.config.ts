import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bikeapelago.app',
  appName: 'Bikeapelago',
  webDir: 'out',
  server: {
    androidScheme: 'https'
  }
};

export default config;