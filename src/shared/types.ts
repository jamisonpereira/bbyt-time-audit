export type AppMode = 'prompt' | 'settings' | 'summary' | 'merge';

export type BlockStatus = 'pending' | 'filled' | 'skipped' | 'deleted';

export type TimeBlock = {
  id: string;
  startAt: string;
  endAt: string;
  status: BlockStatus;
  entryId?: string;
  skippedAt?: string;
};

export type TimeEntry = {
  id: string;
  blockId: string;
  label: string;
  categoryId: string;
  createdAt: string;
};

export type CategoryValueTier = '$' | '$$' | '$$$' | '$$$$';

export type Category = {
  id: string;
  name: string;
  normalizedName: string;
  useCount: number;
  lastUsedAt: string;
  valueTier?: CategoryValueTier;
  hourlyRate?: number;
  sortOrder?: number;
};

export type CategoryAlias = {
  raw: string;
  normalizedRaw: string;
  categoryId: string;
};

export type AppSettings = {
  intervalMinutes: number;
  activeDays: number[];
  startTime: string;
  endTime: string;
  promptingEnabled: boolean;
  launchAtLogin: boolean;
  snoozeMinutes: number;
  apiKey?: string;
  aiEndpoint: string;
  aiModel: string;
  summarySections: SummarySectionSetting[];
};

export const summarySectionDefinitions = [
  { id: 'missedBlocks', label: 'Missed blocks' },
  { id: 'categoryTotals', label: 'Category totals' },
  { id: 'auditReport', label: 'Audit report' },
  { id: 'dailyTotals', label: 'Daily totals' },
  { id: 'dailyReview', label: 'Daily review' },
  { id: 'entries', label: 'Entries' },
  { id: 'archives', label: 'Archived audits' },
] as const;

export type SummarySectionId =
  (typeof summarySectionDefinitions)[number]['id'];

export type SummarySectionSetting = {
  id: SummarySectionId;
  visible: boolean;
};

export type AuditData = {
  version: number;
  createdAt: string;
  settings: AppSettings;
  blocks: TimeBlock[];
  entries: TimeEntry[];
  categories: Category[];
  aliases: CategoryAlias[];
  mergeUndo?: MergeUndoSnapshot;
};

export type PromptState = {
  block: TimeBlock | null;
  pendingCount: number;
  recentCategories: Category[];
  allCategories: Category[];
  previousFilledLabel: string | null;
};

export type SummaryRow = {
  categoryId: string;
  categoryName: string;
  minutes: number;
  percent: number;
};

export type DailySummary = {
  date: string;
  totalMinutes: number;
  rows: SummaryRow[];
};

export type DailyReview = {
  date: string;
  totalMinutes: number;
  entryCount: number;
  pendingCount: number;
  rows: SummaryRow[];
  entries: EntryReviewItem[];
  pendingBlocks: PendingBlockReviewItem[];
};

export type SummaryState = {
  totalMinutes: number;
  rows: SummaryRow[];
  days: DailySummary[];
  dayReviews: DailyReview[];
  auditReport: AuditReport;
  entries: EntryReviewItem[];
  pendingBlocks: PendingBlockReviewItem[];
  auditStartedAt: string;
  previousFilledLabel: string | null;
  canUndoMerge: boolean;
};

export type AuditReportRow = {
  categoryId: string;
  categoryName: string;
  scope: 'Work' | 'Personal' | 'Other';
  minutes: number;
  percent: number;
  valueTier?: CategoryValueTier;
  hourlyRate?: number;
  estimatedValue: number;
  sortOrder: number;
};

export type AuditReportScopeTotal = {
  scope: 'Work' | 'Personal' | 'Other';
  minutes: number;
  percent: number;
  estimatedValue: number;
};

export type AuditReport = {
  rows: AuditReportRow[];
  scopeTotals: AuditReportScopeTotal[];
  totalMinutes: number;
  totalEstimatedValue: number;
};

export type CategoryValueInput = {
  categoryId: string;
  valueTier?: CategoryValueTier;
  hourlyRate?: number;
};

export type CategoryRenameInput = {
  categoryId: string;
  name: string;
};

export type CategoryMergeInput = {
  sourceCategoryId: string;
  targetCategoryId: string;
};

export type CategoryMoveInput = {
  categoryId: string;
  direction: 'up' | 'down';
};

export type CategoryReorderInput = {
  sourceCategoryId: string;
  targetCategoryId: string;
  position: 'before' | 'after';
};

export type MergeUndoSnapshot = {
  createdAt: string;
  categories: Category[];
  aliases: CategoryAlias[];
  entryCategoryIds: Array<{
    entryId: string;
    categoryId: string;
  }>;
};

export type ArchiveInfo = {
  fileName: string;
  createdAt: string;
  entryCount: number;
  blockCount: number;
};

export type ManualEntryInput = {
  date: string;
  startTime: string;
  endTime: string;
  label: string;
};

export type ReleaseUpdateStatus =
  | 'available'
  | 'checking'
  | 'current'
  | 'downloaded'
  | 'downloading'
  | 'unavailable'
  | 'error';

export type ReleaseUpdateResult = {
  status: ReleaseUpdateStatus;
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseUrl?: string;
  message?: string;
};

export type FileActionResult = {
  ok: boolean;
  message: string;
  filePath?: string;
};

export type EntryReviewItem = {
  id: string;
  blockId: string;
  date: string;
  startAt: string;
  endAt: string;
  minutes: number;
  label: string;
  categoryName: string;
  createdAt: string;
};

export type PendingBlockReviewItem = {
  id: string;
  date: string;
  startAt: string;
  endAt: string;
  minutes: number;
};

export type MergeSuggestion = {
  canonical: string;
  action?: string;
  rationale?: string;
  labels: string[];
};
