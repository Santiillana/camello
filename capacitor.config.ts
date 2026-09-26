import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.combopitt.camello',
  appName: 'CAMELLO',
  webDir: 'dist',
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: true,
    },
  },
};

export default config;
