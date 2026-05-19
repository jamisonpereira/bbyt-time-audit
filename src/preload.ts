import { contextBridge, ipcRenderer } from 'electron';
import type {
  ArchiveInfo,
  AppSettings,
  CategoryMergeInput,
  CategoryMoveInput,
  CategoryReorderInput,
  CategoryRenameInput,
  CategoryValueInput,
  FileActionResult,
  ManualEntryInput,
  MergeSuggestion,
  PromptState,
  ReleaseUpdateResult,
  SummaryState,
} from './shared/types';

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings: AppSettings): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:update', settings),
  getPromptState: (): Promise<PromptState> => ipcRenderer.invoke('prompt:get'),
  createManualPrompt: (): Promise<PromptState> =>
    ipcRenderer.invoke('prompt:createManual'),
  savePrompt: (blockId: string, label: string): Promise<PromptState> =>
    ipcRenderer.invoke('prompt:save', blockId, label),
  skipPrompt: (blockId: string): Promise<PromptState> =>
    ipcRenderer.invoke('prompt:skip', blockId),
  snoozePrompt: (minutes: number): Promise<void> =>
    ipcRenderer.invoke('prompt:snooze', minutes),
  closePrompt: (): Promise<void> => ipcRenderer.invoke('window:closePrompt'),
  getSummary: (): Promise<SummaryState> => ipcRenderer.invoke('summary:get'),
  deleteEntry: (entryId: string): Promise<SummaryState> =>
    ipcRenderer.invoke('summary:deleteEntry', entryId),
  deleteEntries: (entryIds: string[]): Promise<SummaryState> =>
    ipcRenderer.invoke('summary:deleteEntries', entryIds),
  fillPendingBlocks: (
    blockIds: string[],
    label: string,
  ): Promise<SummaryState> =>
    ipcRenderer.invoke('summary:fillPendingBlocks', blockIds, label),
  skipPendingBlocks: (blockIds: string[]): Promise<SummaryState> =>
    ipcRenderer.invoke('summary:skipPendingBlocks', blockIds),
  deletePendingBlocks: (blockIds: string[]): Promise<SummaryState> =>
    ipcRenderer.invoke('summary:deletePendingBlocks', blockIds),
  updateEntry: (entryId: string, label: string): Promise<SummaryState> =>
    ipcRenderer.invoke('summary:updateEntry', entryId, label),
  updateCategoryValue: (input: CategoryValueInput): Promise<SummaryState> =>
    ipcRenderer.invoke('summary:updateCategoryValue', input),
  renameCategory: (input: CategoryRenameInput): Promise<SummaryState> =>
    ipcRenderer.invoke('summary:renameCategory', input),
  mergeCategories: (input: CategoryMergeInput): Promise<SummaryState> =>
    ipcRenderer.invoke('summary:mergeCategories', input),
  moveCategory: (input: CategoryMoveInput): Promise<SummaryState> =>
    ipcRenderer.invoke('summary:moveCategory', input),
  reorderCategory: (input: CategoryReorderInput): Promise<SummaryState> =>
    ipcRenderer.invoke('summary:reorderCategory', input),
  addManualEntry: (input: ManualEntryInput): Promise<SummaryState> =>
    ipcRenderer.invoke('summary:addManualEntry', input),
  startNewAudit: (): Promise<SummaryState> =>
    ipcRenderer.invoke('summary:startNewAudit'),
  getArchives: (): Promise<ArchiveInfo[]> => ipcRenderer.invoke('archives:get'),
  loadArchive: (fileName: string): Promise<SummaryState> =>
    ipcRenderer.invoke('archives:load', fileName),
  exportCsv: (): Promise<string | null> => ipcRenderer.invoke('summary:exportCsv'),
  exportAuditReportCsv: (): Promise<string | null> =>
    ipcRenderer.invoke('summary:exportAuditReportCsv'),
  exportBackup: (): Promise<FileActionResult> =>
    ipcRenderer.invoke('backup:export'),
  importBackup: (): Promise<FileActionResult> =>
    ipcRenderer.invoke('backup:import'),
  suggestMerges: (): Promise<MergeSuggestion[]> => ipcRenderer.invoke('merge:suggest'),
  applyMerges: (suggestions: MergeSuggestion[]): Promise<SummaryState> =>
    ipcRenderer.invoke('merge:apply', suggestions),
  undoLastMerge: (): Promise<SummaryState> => ipcRenderer.invoke('merge:undoLast'),
  getDataPath: (): Promise<string> => ipcRenderer.invoke('app:dataPath'),
  openSettings: (): Promise<void> => ipcRenderer.invoke('app:openSettings'),
  openMerge: (): Promise<void> => ipcRenderer.invoke('app:openMerge'),
  checkForUpdates: (): Promise<ReleaseUpdateResult> =>
    ipcRenderer.invoke('app:checkForUpdates'),
  checkForUpdatesWithDialog: (): Promise<ReleaseUpdateResult> =>
    ipcRenderer.invoke('app:checkForUpdatesWithDialog'),
  openLatestRelease: (): Promise<void> =>
    ipcRenderer.invoke('app:openLatestRelease'),
  onPromptStateChanged: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on('prompt-state-changed', listener);
    return () => ipcRenderer.removeListener('prompt-state-changed', listener);
  },
  onSummaryChanged: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on('summary-state-changed', listener);
    return () => ipcRenderer.removeListener('summary-state-changed', listener);
  },
  onReleaseUpdateChanged: (
    callback: (result: ReleaseUpdateResult) => void,
  ): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, result: ReleaseUpdateResult) =>
      callback(result);
    ipcRenderer.on('release-update-changed', listener);
    return () => ipcRenderer.removeListener('release-update-changed', listener);
  },
};

contextBridge.exposeInMainWorld('jamosTime', api);

export type JamosTimeApi = typeof api;
