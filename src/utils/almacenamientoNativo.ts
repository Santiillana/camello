import { Capacitor, registerPlugin } from '@capacitor/core';

type CamelloStoragePlugin = {
  saveBackup(options: { filename: string; data: string; mimeType?: string; folderName?: string }): Promise<{ uri: string; filename: string }>;
};

export const camelloStorage = registerPlugin<CamelloStoragePlugin>('CamelloStorage');

export function puedeGuardarEnCarpetaCompartida(): boolean {
  return Capacitor.getPlatform() === 'android';
}
