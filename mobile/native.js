import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';

if (Capacitor.isNativePlatform()) {
  window.GunplaNative = {
    storage: {
      async getItem(key) { return (await Preferences.get({ key })).value; },
      async setItem(key, value) { await Preferences.set({ key, value }); },
    },
    async exportBackup(data, filename) {
      const { uri } = await Filesystem.writeFile({
        path: filename, data, directory: Directory.Cache, encoding: Encoding.UTF8,
      });
      // Cache is shareable on both platforms without broad storage permission.
      // Keep the file until the receiving app has finished reading it.
      await Share.share({ title: '건프라 지출 백업', dialogTitle: '백업 파일 저장 또는 공유', files: [uri] });
    },
  };
  if (Capacitor.getPlatform() === 'android') {
    App.addListener('backButton', () => {
      const dialog = document.querySelector('[role="dialog"]:not(.hidden)');
      if (dialog) window.closeDialog(dialog.id);
      else if (!document.getElementById('view-stats').classList.contains('hidden')) window.switchTab('dashboard');
      else App.minimizeApp();
    }).catch(error => console.error('Back button initialization failed', error));
  }
}
