import {
  updateElectronApp,
  UpdateSourceType,
  type IUpdateElectronAppOptions,
  type ILogger,
} from 'update-electron-app';

export const automaticUpdateRepo = 'jamisonpereira/bbyt-time-audit';

export type AutomaticUpdatePhase =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'downloaded';

export type UpdateDialogOptions = {
  type: 'info';
  buttons: string[];
  defaultId: number;
  cancelId: number;
  title: string;
  message: string;
  detail: string;
};

type AutomaticUpdateEnvironment = {
  isPackaged: boolean;
  platform: NodeJS.Platform;
};

type StartAutomaticUpdatesInput = AutomaticUpdateEnvironment & {
  logger?: ILogger;
  updater?: (options: IUpdateElectronAppOptions<ILogger>) => void;
};

export const shouldUseAutomaticUpdates = ({
  isPackaged,
  platform,
}: AutomaticUpdateEnvironment): boolean =>
  isPackaged && platform === 'darwin';

export const createAutoUpdateOptions = (
  logger: ILogger = console,
): IUpdateElectronAppOptions<ILogger> => ({
  updateSource: {
    type: UpdateSourceType.ElectronPublicUpdateService,
    repo: automaticUpdateRepo,
  },
  updateInterval: '1 hour',
  logger,
  notifyUser: false,
});

export const createDownloadingUpdateDialog = (
  appDisplayName: string,
): UpdateDialogOptions => ({
  type: 'info',
  buttons: ['OK'],
  defaultId: 0,
  cancelId: 0,
  title: `${appDisplayName} Update`,
  message: 'Update found',
  detail:
    'Downloading the update now. You will be prompted to restart when it is ready.',
});

export const isAutomaticUpdateBusy = (phase: AutomaticUpdatePhase): boolean =>
  phase === 'checking' || phase === 'downloading';

export const startAutomaticUpdates = ({
  isPackaged,
  platform,
  logger = console,
  updater = updateElectronApp,
}: StartAutomaticUpdatesInput): boolean => {
  if (!shouldUseAutomaticUpdates({ isPackaged, platform })) {
    return false;
  }

  updater(createAutoUpdateOptions(logger));
  return true;
};
