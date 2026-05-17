import type { BrowserWindow } from 'electron';
import type { TimeAuditStore } from './store';

type SchedulerOptions = {
  store: TimeAuditStore;
  showPrompt: () => void;
  getPromptWindow: () => BrowserWindow | null;
};

export class PromptScheduler {
  private readonly store: TimeAuditStore;
  private readonly showPrompt: () => void;
  private readonly getPromptWindow: () => BrowserWindow | null;
  private timer: NodeJS.Timeout | null = null;
  private snoozedUntil = 0;

  constructor(options: SchedulerOptions) {
    this.store = options.store;
    this.showPrompt = options.showPrompt;
    this.getPromptWindow = options.getPromptWindow;
  }

  start(): void {
    this.stop();
    this.tick();
    this.timer = setInterval(() => this.tick(), 30_000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  snooze(minutes: number): void {
    this.snoozedUntil = Date.now() + minutes * 60_000;
    this.getPromptWindow()?.hide();
  }

  tick(): void {
    const settings = this.store.getSettings();
    if (!settings.promptingEnabled || Date.now() < this.snoozedUntil) {
      return;
    }

    this.store.upsertDueBlocks();
    const promptState = this.store.getPromptState();
    if (promptState.block) {
      this.showPrompt();
    }
  }
}
