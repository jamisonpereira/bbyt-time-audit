import {
  updateElectronApp,
  UpdateSourceType,
  type IUpdateElectronAppOptions,
  type ILogger,
} from 'update-electron-app';

export const automaticUpdateRepo = 'jamisonpereira/bbyt-time-audit';

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
