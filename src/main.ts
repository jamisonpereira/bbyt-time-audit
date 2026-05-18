import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  MenuItemConstructorOptions,
  nativeImage,
  Notification,
  screen,
  shell,
  Tray,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { getMergeSuggestions } from './main/aiMerge';
import { checkLatestRelease } from './main/releaseUpdates';
import { PromptScheduler } from './main/scheduler';
import { TimeAuditStore } from './main/store';
import type {
  AppMode,
  AppSettings,
  CategoryMergeInput,
  CategoryMoveInput,
  CategoryReorderInput,
  CategoryRenameInput,
  CategoryValueInput,
  FileActionResult,
  ManualEntryInput,
  MergeSuggestion,
  ReleaseUpdateResult,
} from './shared/types';

if (started) {
  app.quit();
}

let tray: Tray | null = null;
let promptWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let summaryWindow: BrowserWindow | null = null;
let mergeWindow: BrowserWindow | null = null;
let scheduler: PromptScheduler;
let store: TimeAuditStore;
let isQuitting = false;
const appDisplayName = 'BBYT - Time Audit';
const releaseRepoOwner = 'jamisonpereira';
const releaseRepoName = 'bbyt-time-audit';
let latestReleaseCheck: ReleaseUpdateResult = {
  status: 'unavailable',
  currentVersion: app.getVersion(),
  message: 'No update check has run yet.',
};

const createAppUrl = (mode: AppMode): string => {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return `${MAIN_WINDOW_VITE_DEV_SERVER_URL}?mode=${mode}`;
  }

  return `file://${path.join(
    __dirname,
    `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
  )}?mode=${mode}`;
};

const baseWindowOptions = () => ({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
  },
});

const hideInsteadOfClose = (window: BrowserWindow) => {
  window.on('close', (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    window.hide();
  });
};

const showPromptWindow = () => {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const width = 360;
  const height = 420;
  const x = Math.round(display.workArea.x + display.workArea.width - width - 16);
  const y = Math.round(display.workArea.y + 16);

  if (!promptWindow) {
    promptWindow = new BrowserWindow({
      ...baseWindowOptions(),
      width,
      height,
      x,
      y,
      frame: false,
      resizable: true,
      minWidth: 340,
      minHeight: 260,
      maxHeight: Math.min(560, display.workArea.height - 32),
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      title: appDisplayName,
    });
    promptWindow.on('closed', () => {
      promptWindow = null;
    });
    hideInsteadOfClose(promptWindow);
    promptWindow.loadURL(createAppUrl('prompt'));
  } else {
    promptWindow.setBounds({ x, y, width, height });
  }

  promptWindow.once('ready-to-show', () => {
    promptWindow?.showInactive();
  });

  if (promptWindow.isVisible()) {
    promptWindow.webContents.send('prompt-state-changed');
  } else {
    promptWindow.showInactive();
    promptWindow.webContents.send('prompt-state-changed');
  }
};

const showSettingsWindow = () => {
  if (!settingsWindow) {
    settingsWindow = new BrowserWindow({
      ...baseWindowOptions(),
      width: 620,
      height: 680,
      minWidth: 560,
      minHeight: 560,
      title: `${appDisplayName} Settings`,
    });
    settingsWindow.on('closed', () => {
      settingsWindow = null;
    });
    hideInsteadOfClose(settingsWindow);
    settingsWindow.loadURL(createAppUrl('settings'));
  }

  settingsWindow.show();
  settingsWindow.focus();
};

const showSummaryWindow = () => {
  if (!summaryWindow) {
    summaryWindow = new BrowserWindow({
      ...baseWindowOptions(),
      width: 860,
      height: 720,
      minWidth: 760,
      minHeight: 560,
      title: `${appDisplayName} Summary`,
    });
    summaryWindow.on('closed', () => {
      summaryWindow = null;
    });
    hideInsteadOfClose(summaryWindow);
    summaryWindow.loadURL(createAppUrl('summary'));
  }

  summaryWindow.show();
  summaryWindow.focus();
};

const showMergeWindow = () => {
  if (!mergeWindow) {
    mergeWindow = new BrowserWindow({
      ...baseWindowOptions(),
      width: 680,
      height: 620,
      minWidth: 560,
      minHeight: 480,
      title: `${appDisplayName} Category Merge`,
    });
    mergeWindow.on('closed', () => {
      mergeWindow = null;
    });
    hideInsteadOfClose(mergeWindow);
    mergeWindow.loadURL(createAppUrl('merge'));
  }

  mergeWindow.show();
  mergeWindow.focus();
};

const refreshTrayMenu = () => {
  const settings = store.getSettings();
  const pendingCount = store.getPromptState().pendingCount;
  const template: MenuItemConstructorOptions[] = [
    { label: appDisplayName, enabled: false },
    {
      label: `Prompting: ${settings.promptingEnabled ? 'On' : 'Off'}`,
      enabled: false,
    },
    { type: 'separator' },
    { label: 'Open Summary', click: showSummaryWindow },
    { label: 'Log Last 15', click: createManualPrompt },
    { label: 'Settings', click: showSettingsWindow },
    ...(latestReleaseCheck.status === 'available'
      ? [
          {
            label: `Update Available (${latestReleaseCheck.latestVersion})`,
            click: openLatestRelease,
          },
        ]
      : [
          {
            label: 'Check for Updates',
            click: checkForReleaseUpdateWithDialog,
          },
        ]),
    { type: 'separator' },
    {
      label: settings.promptingEnabled ? 'Pause Prompting' : 'Start Prompting',
      click: () => {
        store.updateSettings({
          ...settings,
          promptingEnabled: !settings.promptingEnabled,
        });
        refreshTrayMenu();
        scheduler.tick();
      },
    },
    {
      label: `Fill Missed Entries (${pendingCount})`,
      enabled: pendingCount > 0,
      click: showPromptWindow,
    },
    {
      label: 'Export CSV...',
      click: async () => {
        const { canceled, filePath } = await dialog.showSaveDialog({
          defaultPath: `jamos-time-${new Date().toISOString().slice(0, 10)}.csv`,
          filters: [{ name: 'CSV', extensions: ['csv'] }],
        });

        if (!canceled && filePath) {
          fs.writeFileSync(filePath, store.exportCsv());
          shell.showItemInFolder(filePath);
        }
      },
    },
    {
      label: 'Backup JSON...',
      click: exportBackup,
    },
    {
      label: 'Reveal Data File',
      click: () => shell.showItemInFolder(store.getDataPath()),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ];
  const menu = Menu.buildFromTemplate(template);

  tray?.setContextMenu(menu);
};

const broadcastSummaryChanged = () => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('summary-state-changed');
  }
};

const applyLaunchAtLogin = () => {
  if (process.platform !== 'darwin') {
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: store.getSettings().launchAtLogin,
    openAsHidden: true,
  });
};

const createManualPrompt = () => {
  const state = store.createManualBlock();
  refreshTrayMenu();
  broadcastSummaryChanged();
  showPromptWindow();
  return state;
};

const checkForReleaseUpdate = async (): Promise<ReleaseUpdateResult> => {
  latestReleaseCheck = await checkLatestRelease(
    releaseRepoOwner,
    releaseRepoName,
    app.getVersion(),
  );
  refreshTrayMenu();

  if (latestReleaseCheck.status === 'available') {
    new Notification({
      title: `${appDisplayName} update available`,
      body: `Version ${latestReleaseCheck.latestVersion} is ready to download.`,
    }).show();
  }

  return latestReleaseCheck;
};

const checkForReleaseUpdateWithDialog =
  async (): Promise<ReleaseUpdateResult> => {
    const result = await checkForReleaseUpdate();
    await dialog.showMessageBox({
      type: result.status === 'error' ? 'error' : 'info',
      message:
        result.status === 'available'
          ? `Version ${result.latestVersion} is available`
          : 'No update available',
      detail:
        result.status === 'available'
          ? 'Opening the GitHub release page so you can download the new version.'
          : result.message ?? `You are running version ${result.currentVersion}.`,
    });

    if (result.status === 'available') {
      await openLatestRelease();
    }

    return result;
  };

const openLatestRelease = async (): Promise<void> => {
  if (!latestReleaseCheck.releaseUrl) {
    await checkForReleaseUpdate();
  }

  if (latestReleaseCheck.releaseUrl) {
    await shell.openExternal(latestReleaseCheck.releaseUrl);
    return;
  }

  await shell.openExternal(
    `https://github.com/${releaseRepoOwner}/${releaseRepoName}/releases`,
  );
};

const exportBackup = async (): Promise<FileActionResult> => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: `jamos-time-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (canceled || !filePath) {
    return { ok: false, message: 'Backup canceled.' };
  }

  fs.writeFileSync(filePath, store.createBackupJson());
  shell.showItemInFolder(filePath);
  return {
    ok: true,
    filePath,
    message: `Backup saved to ${filePath}.`,
  };
};

const importBackup = async (): Promise<FileActionResult> => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (canceled || filePaths.length === 0) {
    return { ok: false, message: 'Restore canceled.' };
  }

  const filePath = filePaths[0];
  try {
    store.importBackupJson(fs.readFileSync(filePath, 'utf8'));
    refreshTrayMenu();
    broadcastSummaryChanged();
    scheduler.tick();
    return {
      ok: true,
      filePath,
      message: `Restored backup from ${filePath}. Your previous current audit was archived first.`,
    };
  } catch (error) {
    return {
      ok: false,
      filePath,
      message: error instanceof Error ? error.message : 'Restore failed.',
    };
  }
};

const createTray = () => {
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <rect x="1" y="1" width="16" height="16" rx="4" fill="black"/>
      <path d="M4 5h5M6.5 5v8M10 13l2.3-8h1.1l2.3 8M11 10h3.7" stroke="white" stroke-width="1.45" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `);
  const image = nativeImage.createFromDataURL(`data:image/svg+xml,${svg}`);
  image.setTemplateImage(true);

  tray = new Tray(image);
  if (process.platform === 'darwin') {
    tray.setTitle('TA');
  }
  tray.setToolTip(appDisplayName);
  tray.on('click', showSummaryWindow);
  refreshTrayMenu();
};

const registerIpc = () => {
  ipcMain.handle('settings:get', () => store.getSettings());
  ipcMain.handle('settings:update', (_event, settings: AppSettings) => {
    const updated = store.updateSettings(settings);
    applyLaunchAtLogin();
    refreshTrayMenu();
    scheduler.tick();
    return updated;
  });
  ipcMain.handle('prompt:get', () => store.getPromptState());
  ipcMain.handle('prompt:createManual', createManualPrompt);
  ipcMain.handle('prompt:save', (_event, blockId: string, label: string) => {
    const state = store.saveEntry(blockId, label);
    refreshTrayMenu();
    broadcastSummaryChanged();
    scheduler.tick();
    return state;
  });
  ipcMain.handle('prompt:skip', (_event, blockId: string) => {
    const state = store.skipBlock(blockId);
    refreshTrayMenu();
    broadcastSummaryChanged();
    scheduler.tick();
    return state;
  });
  ipcMain.handle('prompt:snooze', (_event, minutes: number) => {
    scheduler.snooze(minutes);
  });
  ipcMain.handle('summary:get', () => store.getSummary());
  ipcMain.handle('summary:deleteEntry', (_event, entryId: string) => {
    const summary = store.deleteEntry(entryId);
    refreshTrayMenu();
    broadcastSummaryChanged();
    scheduler.tick();
    return summary;
  });
  ipcMain.handle('summary:deleteEntries', (_event, entryIds: string[]) => {
    const summary = store.deleteEntries(entryIds);
    refreshTrayMenu();
    broadcastSummaryChanged();
    scheduler.tick();
    return summary;
  });
  ipcMain.handle(
    'summary:fillPendingBlocks',
    (_event, blockIds: string[], label: string) => {
      const summary = store.fillPendingBlocks(blockIds, label);
      refreshTrayMenu();
      broadcastSummaryChanged();
      scheduler.tick();
      return summary;
    },
  );
  ipcMain.handle('summary:skipPendingBlocks', (_event, blockIds: string[]) => {
    const summary = store.skipPendingBlocks(blockIds);
    refreshTrayMenu();
    broadcastSummaryChanged();
    scheduler.tick();
    return summary;
  });
  ipcMain.handle('summary:deletePendingBlocks', (_event, blockIds: string[]) => {
    const summary = store.deletePendingBlocks(blockIds);
    refreshTrayMenu();
    broadcastSummaryChanged();
    scheduler.tick();
    return summary;
  });
  ipcMain.handle('summary:updateEntry', (_event, entryId: string, label: string) => {
    const summary = store.updateEntry(entryId, label);
    refreshTrayMenu();
    broadcastSummaryChanged();
    return summary;
  });
  ipcMain.handle(
    'summary:updateCategoryValue',
    (_event, input: CategoryValueInput) => {
      const summary = store.updateCategoryValue(input);
      broadcastSummaryChanged();
      return summary;
    },
  );
  ipcMain.handle(
    'summary:renameCategory',
    (_event, input: CategoryRenameInput) => {
      const summary = store.renameCategory(input);
      refreshTrayMenu();
      broadcastSummaryChanged();
      return summary;
    },
  );
  ipcMain.handle(
    'summary:mergeCategories',
    (_event, input: CategoryMergeInput) => {
      const summary = store.mergeCategories(input);
      refreshTrayMenu();
      broadcastSummaryChanged();
      return summary;
    },
  );
  ipcMain.handle('summary:moveCategory', (_event, input: CategoryMoveInput) => {
    const summary = store.moveCategory(input);
    broadcastSummaryChanged();
    return summary;
  });
  ipcMain.handle(
    'summary:reorderCategory',
    (_event, input: CategoryReorderInput) => {
      const summary = store.reorderCategory(input);
      broadcastSummaryChanged();
      return summary;
    },
  );
  ipcMain.handle('summary:addManualEntry', (_event, input: ManualEntryInput) => {
    const summary = store.addManualEntry(input);
    refreshTrayMenu();
    broadcastSummaryChanged();
    return summary;
  });
  ipcMain.handle('summary:startNewAudit', () => {
    const summary = store.startNewAudit();
    refreshTrayMenu();
    broadcastSummaryChanged();
    scheduler.tick();
    return summary;
  });
  ipcMain.handle('archives:get', () => store.getArchives());
  ipcMain.handle('archives:load', (_event, fileName: string) => {
    const summary = store.loadArchive(fileName);
    refreshTrayMenu();
    broadcastSummaryChanged();
    scheduler.tick();
    return summary;
  });
  ipcMain.handle('summary:exportCsv', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `jamos-time-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });

    if (canceled || !filePath) {
      return null;
    }

    fs.writeFileSync(filePath, store.exportCsv());
    shell.showItemInFolder(filePath);
    return filePath;
  });
  ipcMain.handle('summary:exportAuditReportCsv', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `jamos-time-audit-report-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });

    if (canceled || !filePath) {
      return null;
    }

    fs.writeFileSync(filePath, store.exportAuditReportCsv());
    shell.showItemInFolder(filePath);
    return filePath;
  });
  ipcMain.handle('backup:export', () => exportBackup());
  ipcMain.handle('backup:import', () => importBackup());
  ipcMain.handle('merge:suggest', () =>
    getMergeSuggestions(store.getSettings(), store.getPromptState().allCategories),
  );
  ipcMain.handle(
    'merge:apply',
    (_event, suggestions: MergeSuggestion[]) => {
      const summary = store.applyMergeSuggestions(suggestions);
      broadcastSummaryChanged();
      return summary;
    },
  );
  ipcMain.handle('merge:undoLast', () => {
    const summary = store.undoLastMerge();
    broadcastSummaryChanged();
    return summary;
  });
  ipcMain.handle('app:dataPath', () => store.getDataPath());
  ipcMain.handle('app:openSettings', () => showSettingsWindow());
  ipcMain.handle('app:openMerge', () => showMergeWindow());
  ipcMain.handle('app:checkForUpdates', () => checkForReleaseUpdate());
  ipcMain.handle('app:checkForUpdatesWithDialog', () =>
    checkForReleaseUpdateWithDialog(),
  );
  ipcMain.handle('app:openLatestRelease', () => openLatestRelease());
  ipcMain.handle('window:closePrompt', () => {
    promptWindow?.hide();
  });
};

app.on('ready', () => {
  store = new TimeAuditStore();
  registerIpc();
  applyLaunchAtLogin();
  createTray();
  setTimeout(() => {
    checkForReleaseUpdate().catch((error) => {
      latestReleaseCheck = {
        status: 'error',
        currentVersion: app.getVersion(),
        message: error instanceof Error ? error.message : 'Update check failed.',
      };
      refreshTrayMenu();
    });
  }, 5000);
  scheduler = new PromptScheduler({
    store,
    showPrompt: showPromptWindow,
    getPromptWindow: () => promptWindow,
  });
  scheduler.start();
  showSummaryWindow();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('activate', () => {
  showSummaryWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
  scheduler?.stop();
});
