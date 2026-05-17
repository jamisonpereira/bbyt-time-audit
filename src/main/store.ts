import electron from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AppSettings,
  ArchiveInfo,
  AuditReport,
  AuditData,
  Category,
  CategoryMergeInput,
  CategoryRenameInput,
  CategoryValueInput,
  CategoryValueTier,
  DailyReview,
  DailySummary,
  EntryReviewItem,
  ManualEntryInput,
  MergeSuggestion,
  PendingBlockReviewItem,
  PromptState,
  SummaryRow,
  SummaryState,
  TimeBlock,
  TimeEntry,
} from '../shared/types';

const dataFileName = 'jamos-time-data.json';
const { app } = electron;
const defaultTierRates: Record<CategoryValueTier, number> = {
  $: 25,
  $$: 100,
  $$$: 250,
  $$$$: 500,
};

const defaultSettings: AppSettings = {
  intervalMinutes: 15,
  activeDays: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '17:00',
  promptingEnabled: true,
  launchAtLogin: false,
  snoozeMinutes: 5,
  aiEndpoint: 'https://api.openai.com/v1/chat/completions',
  aiModel: 'gpt-4.1-mini',
};

const defaultData: AuditData = {
  version: 1,
  createdAt: new Date().toISOString(),
  settings: defaultSettings,
  blocks: [],
  entries: [],
  categories: [],
  aliases: [],
};

export class TimeAuditStore {
  private readonly filePath: string;
  private data: AuditData;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.join(app.getPath('userData'), dataFileName);
    this.data = this.load();
  }

  getDataPath(): string {
    return this.filePath;
  }

  getSettings(): AppSettings {
    return { ...this.data.settings };
  }

  updateSettings(settings: AppSettings): AppSettings {
    this.data.settings = normalizeSettings(settings);
    this.save();
    return this.getSettings();
  }

  getPromptState(): PromptState {
    return {
      block: this.getNextPendingBlock(),
      pendingCount: this.getPendingBlocks().length,
      recentCategories: [...this.data.categories]
        .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
        .slice(0, 5),
      allCategories: [...this.data.categories].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      previousFilledLabel: this.getPreviousFilledLabel(),
    };
  }

  getPendingBlocks(): TimeBlock[] {
    return this.data.blocks
      .filter((block) => block.status === 'pending')
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }

  getNextPendingBlock(): TimeBlock | null {
    return this.getPendingBlocks()[0] ?? null;
  }

  createManualBlock(now = new Date()): PromptState {
    if (this.getPendingBlocks().length > 0) {
      return this.getPromptState();
    }

    const settings = this.getSettings();
    const end = new Date(now);
    end.setSeconds(0, 0);
    const start = new Date(end);
    start.setMinutes(start.getMinutes() - settings.intervalMinutes);

    const block: TimeBlock = {
      id: createId('manual-block'),
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      status: 'pending',
    };

    this.data.blocks.push(block);
    this.save();
    return this.getPromptState();
  }

  upsertDueBlocks(now = new Date()): number {
    const existing = new Set(this.data.blocks.map((block) => block.id));
    const generated = buildDueBlocks(this.data.settings, this.data.createdAt, now);
    let added = 0;

    for (const block of generated) {
      if (!existing.has(block.id)) {
        this.data.blocks.push(block);
        added += 1;
      }
    }

    if (added > 0) {
      this.save();
    }

    return added;
  }

  saveEntry(blockId: string, label: string): PromptState {
    const cleanLabel = label.trim();
    const block = this.data.blocks.find((candidate) => candidate.id === blockId);

    if (!block || block.status !== 'pending' || cleanLabel.length === 0) {
      return this.getPromptState();
    }

    const category = this.findOrCreateCategory(cleanLabel);
    const entry: TimeEntry = {
      id: createId('entry'),
      blockId,
      label: cleanLabel,
      categoryId: category.id,
      createdAt: new Date().toISOString(),
    };

    block.status = 'filled';
    block.entryId = entry.id;
    this.data.entries.push(entry);
    this.save();
    return this.getPromptState();
  }

  skipBlock(blockId: string): PromptState {
    const block = this.data.blocks.find((candidate) => candidate.id === blockId);

    if (block && block.status === 'pending') {
      block.status = 'skipped';
      block.skippedAt = new Date().toISOString();
      this.save();
    }

    return this.getPromptState();
  }

  fillPendingBlocks(blockIds: string[], label: string): SummaryState {
    const cleanLabel = label.trim();
    const ids = new Set(blockIds);
    if (!cleanLabel || ids.size === 0) {
      return this.getSummary();
    }

    const category = this.findOrCreateCategory(cleanLabel);
    for (const block of this.data.blocks) {
      if (!ids.has(block.id) || block.status !== 'pending') {
        continue;
      }

      const entry: TimeEntry = {
        id: createId('entry'),
        blockId: block.id,
        label: cleanLabel,
        categoryId: category.id,
        createdAt: new Date().toISOString(),
      };
      block.status = 'filled';
      block.entryId = entry.id;
      this.data.entries.push(entry);
    }

    this.recalculateCategoryUsage();
    this.save();
    return this.getSummary();
  }

  skipPendingBlocks(blockIds: string[]): SummaryState {
    const ids = new Set(blockIds);
    if (ids.size === 0) {
      return this.getSummary();
    }

    for (const block of this.data.blocks) {
      if (ids.has(block.id) && block.status === 'pending') {
        block.status = 'skipped';
        block.skippedAt = new Date().toISOString();
      }
    }

    this.save();
    return this.getSummary();
  }

  deletePendingBlocks(blockIds: string[]): SummaryState {
    const ids = new Set(blockIds);
    if (ids.size === 0) {
      return this.getSummary();
    }

    for (const block of this.data.blocks) {
      if (ids.has(block.id) && block.status === 'pending') {
        block.status = 'deleted';
      }
    }

    this.save();
    return this.getSummary();
  }

  deleteEntry(entryId: string): SummaryState {
    return this.deleteEntries([entryId]);
  }

  deleteEntries(entryIds: string[]): SummaryState {
    const ids = new Set(entryIds);
    if (ids.size === 0) {
      return this.getSummary();
    }

    const entries = this.data.entries.filter((entry) => ids.has(entry.id));
    if (entries.length === 0) {
      return this.getSummary();
    }

    this.data.entries = this.data.entries.filter((entry) => !ids.has(entry.id));

    for (const entry of entries) {
      const block = this.data.blocks.find(
        (candidate) => candidate.id === entry.blockId,
      );
      if (block) {
        block.status = 'deleted';
        delete block.entryId;
      }
    }

    this.recalculateCategoryUsage();
    this.save();
    return this.getSummary();
  }

  updateEntry(entryId: string, label: string): SummaryState {
    const cleanLabel = label.trim();
    if (!cleanLabel) {
      return this.getSummary();
    }

    const entry = this.data.entries.find((candidate) => candidate.id === entryId);
    if (!entry) {
      return this.getSummary();
    }

    const category = this.findOrCreateCategory(cleanLabel);
    entry.label = cleanLabel;
    entry.categoryId = category.id;
    this.recalculateCategoryUsage();
    this.save();
    return this.getSummary();
  }

  updateCategoryValue(input: CategoryValueInput): SummaryState {
    const category = this.data.categories.find(
      (candidate) => candidate.id === input.categoryId,
    );

    if (!category) {
      return this.getSummary();
    }

    category.valueTier = input.valueTier;
    category.hourlyRate = normalizeHourlyRate(input.hourlyRate);
    this.save();
    return this.getSummary();
  }

  renameCategory(input: CategoryRenameInput): SummaryState {
    const cleanName = input.name.trim();
    const category = this.data.categories.find(
      (candidate) => candidate.id === input.categoryId,
    );

    if (!category || !cleanName) {
      return this.getSummary();
    }

    const normalizedName = normalizeLabel(cleanName);
    const duplicate = this.data.categories.find(
      (candidate) =>
        candidate.id !== category.id &&
        candidate.normalizedName === normalizedName,
    );

    if (duplicate) {
      return this.mergeCategories({
        sourceCategoryId: category.id,
        targetCategoryId: duplicate.id,
      });
    }

    this.addAlias(category.name, category.id);
    category.name = cleanName;
    category.normalizedName = normalizedName;
    this.save();
    return this.getSummary();
  }

  mergeCategories(input: CategoryMergeInput): SummaryState {
    if (input.sourceCategoryId === input.targetCategoryId) {
      return this.getSummary();
    }

    const source = this.data.categories.find(
      (candidate) => candidate.id === input.sourceCategoryId,
    );
    const target = this.data.categories.find(
      (candidate) => candidate.id === input.targetCategoryId,
    );

    if (!source || !target) {
      return this.getSummary();
    }

    for (const entry of this.data.entries) {
      if (entry.categoryId === source.id) {
        entry.categoryId = target.id;
      }
    }

    for (const alias of this.data.aliases) {
      if (alias.categoryId === source.id) {
        alias.categoryId = target.id;
      }
    }

    this.addAlias(source.name, target.id);
    this.recalculateCategoryUsage();
    this.save();
    return this.getSummary();
  }

  addManualEntry(input: ManualEntryInput): SummaryState {
    const label = input.label.trim();
    const startAt = parseLocalDateTime(input.date, input.startTime);
    const endAt = parseLocalDateTime(input.date, input.endTime);

    if (!label || !startAt || !endAt || endAt <= startAt) {
      return this.getSummary();
    }

    const category = this.findOrCreateCategory(label);
    const blockId = createId('manual-past-block');
    const entryId = createId('entry');
    const block: TimeBlock = {
      id: blockId,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      status: 'filled',
      entryId,
    };
    const entry: TimeEntry = {
      id: entryId,
      blockId,
      label,
      categoryId: category.id,
      createdAt: new Date().toISOString(),
    };

    this.data.blocks.push(block);
    this.data.entries.push(entry);
    this.save();
    return this.getSummary();
  }

  startNewAudit(): SummaryState {
    this.archiveCurrentAudit();

    this.data = {
      version: 1,
      createdAt: new Date().toISOString(),
      settings: this.data.settings,
      blocks: [],
      entries: [],
      categories: [],
      aliases: [],
    };
    this.save();
    return this.getSummary();
  }

  getArchives(): ArchiveInfo[] {
    const archiveDir = this.getArchiveDir();
    if (!fs.existsSync(archiveDir)) {
      return [];
    }

    return fs
      .readdirSync(archiveDir)
      .filter((fileName) => fileName.endsWith('.json'))
      .map((fileName) => {
        const archivePath = path.join(archiveDir, fileName);
        try {
          const archive = normalizeData(
            JSON.parse(fs.readFileSync(archivePath, 'utf8')) as AuditData,
          );
          return {
            fileName,
            createdAt: archive.createdAt,
            entryCount: archive.entries.length,
            blockCount: archive.blocks.length,
          };
        } catch {
          return null;
        }
      })
      .filter((archive): archive is ArchiveInfo => archive !== null)
      .sort((a, b) => b.fileName.localeCompare(a.fileName));
  }

  loadArchive(fileName: string): SummaryState {
    const archivePath = path.join(this.getArchiveDir(), path.basename(fileName));
    if (!fs.existsSync(archivePath)) {
      return this.getSummary();
    }

    this.archiveCurrentAudit();
    const archive = normalizeData(
      JSON.parse(fs.readFileSync(archivePath, 'utf8')) as AuditData,
    );
    this.data = archive;
    this.save();
    return this.getSummary();
  }

  getSummary(): SummaryState {
    const filledBlocks = new Map(
      this.data.blocks
        .filter((block) => block.status === 'filled')
        .map((block) => [block.id, block]),
    );
    const categoryById = new Map(
      this.data.categories.map((category) => [category.id, category]),
    );
    const minutesByCategory = new Map<string, number>();
    const minutesByDay = new Map<string, Map<string, number>>();

    for (const entry of this.data.entries) {
      const block = filledBlocks.get(entry.blockId);
      if (!block) {
        continue;
      }

      const minutes = minutesBetween(block.startAt, block.endAt);
      const dateKey = formatLocalDate(block.startAt);

      minutesByCategory.set(
        entry.categoryId,
        (minutesByCategory.get(entry.categoryId) ?? 0) + minutes,
      );

      const dayMap = minutesByDay.get(dateKey) ?? new Map<string, number>();
      dayMap.set(entry.categoryId, (dayMap.get(entry.categoryId) ?? 0) + minutes);
      minutesByDay.set(dateKey, dayMap);
    }

    const totalMinutes = sum([...minutesByCategory.values()]);
    const rows = buildRows(minutesByCategory, categoryById, totalMinutes);
    const days: DailySummary[] = [...minutesByDay.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, dayMap]) => {
        const dayTotal = sum([...dayMap.values()]);
        return {
          date,
          totalMinutes: dayTotal,
          rows: buildRows(dayMap, categoryById, dayTotal),
        };
      });

    return {
      totalMinutes,
      rows,
      days,
      dayReviews: this.getDailyReviews(days),
      auditReport: buildAuditReport(rows, categoryById, totalMinutes),
      entries: this.getEntryReviewItems(filledBlocks, categoryById),
      pendingBlocks: this.getPendingBlockReviewItems(),
      auditStartedAt: this.data.createdAt,
      previousFilledLabel: this.getPreviousFilledLabel(),
    };
  }

  createBackupJson(): string {
    return JSON.stringify(this.data, null, 2);
  }

  importBackupJson(raw: string): SummaryState {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Invalid backup: file is not valid JSON.');
    }

    if (!isCompleteAuditBackup(parsed)) {
      throw new Error('Invalid backup: file is missing required audit data.');
    }

    this.archiveCurrentAudit();
    this.data = normalizeData(parsed);
    this.save();
    return this.getSummary();
  }

  exportCsv(): string {
    const categoryById = new Map(
      this.data.categories.map((category) => [category.id, category]),
    );
    const entryByBlockId = new Map(
      this.data.entries.map((entry) => [entry.blockId, entry]),
    );
    const rows = [['date', 'start', 'end', 'minutes', 'category', 'raw_label']];

    for (const block of [...this.data.blocks].sort((a, b) =>
      a.startAt.localeCompare(b.startAt),
    )) {
      if (block.status !== 'filled') {
        continue;
      }

      const entry = entryByBlockId.get(block.id);
      const category = entry ? categoryById.get(entry.categoryId) : undefined;
      rows.push([
        formatLocalDate(block.startAt),
        formatLocalTime(block.startAt),
        formatLocalTime(block.endAt),
        String(minutesBetween(block.startAt, block.endAt)),
        category?.name ?? '',
        entry?.label ?? '',
      ]);
    }

    return rows.map((row) => row.map(csvCell).join(',')).join('\n');
  }

  exportAuditReportCsv(): string {
    const summary = this.getSummary();
    const rows = [
      [
        'category',
        'scope',
        'minutes',
        'hours',
        'percent',
        'value_tier',
        'hourly_rate',
        'estimated_value',
      ],
    ];

    for (const row of summary.auditReport.rows) {
      rows.push([
        row.categoryName,
        row.scope,
        String(row.minutes),
        String(Math.round((row.minutes / 60) * 100) / 100),
        String(row.percent),
        row.valueTier ?? '',
        row.hourlyRate === undefined ? '' : String(row.hourlyRate),
        String(row.estimatedValue),
      ]);
    }

    return rows.map((row) => row.map(csvCell).join(',')).join('\n');
  }

  applyMergeSuggestions(suggestions: MergeSuggestion[]): SummaryState {
    for (const suggestion of suggestions) {
      const canonical = suggestion.canonical.trim();
      if (!canonical) {
        continue;
      }

      const canonicalCategory = this.findOrCreateCategory(canonical);

      for (const label of suggestion.labels) {
        const normalizedLabel = normalizeLabel(label);
        const category = this.data.categories.find(
          (candidate) => candidate.normalizedName === normalizedLabel,
        );

        if (!category || category.id === canonicalCategory.id) {
          continue;
        }

        for (const entry of this.data.entries) {
          if (entry.categoryId === category.id) {
            entry.categoryId = canonicalCategory.id;
          }
        }

        const aliasExists = this.data.aliases.some(
          (alias) => alias.normalizedRaw === normalizedLabel,
        );

        if (!aliasExists) {
          this.data.aliases.push({
            raw: label,
            normalizedRaw: normalizedLabel,
            categoryId: canonicalCategory.id,
          });
        }
      }
    }

    this.recalculateCategoryUsage();
    this.save();
    return this.getSummary();
  }

  private findOrCreateCategory(label: string): Category {
    const normalized = normalizeLabel(label);
    const alias = this.data.aliases.find(
      (candidate) => candidate.normalizedRaw === normalized,
    );

    const existing = alias
      ? this.data.categories.find((category) => category.id === alias.categoryId)
      : this.data.categories.find(
          (category) => category.normalizedName === normalized,
        );

    if (existing) {
      existing.useCount += 1;
      existing.lastUsedAt = new Date().toISOString();
      return existing;
    }

    const category: Category = {
      id: createId('category'),
      name: label,
      normalizedName: normalized,
      useCount: 1,
      lastUsedAt: new Date().toISOString(),
    };
    this.data.categories.push(category);
    return category;
  }

  private addAlias(raw: string, categoryId: string): void {
    const normalizedRaw = normalizeLabel(raw);
    const existing = this.data.aliases.find(
      (alias) => alias.normalizedRaw === normalizedRaw,
    );

    if (existing) {
      existing.categoryId = categoryId;
      return;
    }

    this.data.aliases.push({
      raw,
      normalizedRaw,
      categoryId,
    });
  }

  private recalculateCategoryUsage(): void {
    for (const category of this.data.categories) {
      const entries = this.data.entries.filter(
        (entry) => entry.categoryId === category.id,
      );
      category.useCount = entries.length;
      const entryDates = entries.map((entry) => entry.createdAt).sort();
      category.lastUsedAt = entryDates[entryDates.length - 1] ?? category.lastUsedAt;
    }

    this.data.categories = this.data.categories.filter(
      (category) => category.useCount > 0,
    );
  }

  private getEntryReviewItems(
    filledBlocks: Map<string, TimeBlock>,
    categoryById: Map<string, Category>,
  ): EntryReviewItem[] {
    return this.data.entries
      .map((entry) => {
        const block = filledBlocks.get(entry.blockId);
        if (!block) {
          return null;
        }

        return {
          id: entry.id,
          blockId: entry.blockId,
          date: formatLocalDate(block.startAt),
          startAt: block.startAt,
          endAt: block.endAt,
          minutes: minutesBetween(block.startAt, block.endAt),
          label: entry.label,
          categoryName: categoryById.get(entry.categoryId)?.name ?? 'Unknown',
          createdAt: entry.createdAt,
        };
      })
      .filter((entry): entry is EntryReviewItem => entry !== null)
      .sort((a, b) => b.startAt.localeCompare(a.startAt));
  }

  private getPendingBlockReviewItems(): PendingBlockReviewItem[] {
    return this.getPendingBlocks().map((block) => ({
      id: block.id,
      date: formatLocalDate(block.startAt),
      startAt: block.startAt,
      endAt: block.endAt,
      minutes: minutesBetween(block.startAt, block.endAt),
    }));
  }

  private getDailyReviews(days: DailySummary[]): DailyReview[] {
    const entries = this.getEntryReviewItems(
      new Map(
        this.data.blocks
          .filter((block) => block.status === 'filled')
          .map((block) => [block.id, block]),
      ),
      new Map(this.data.categories.map((category) => [category.id, category])),
    );
    const pendingBlocks = this.getPendingBlockReviewItems();
    const dayByDate = new Map(days.map((day) => [day.date, day]));
    const dates = new Set<string>([
      ...days.map((day) => day.date),
      ...pendingBlocks.map((block) => block.date),
    ]);

    return [...dates]
      .sort((a, b) => b.localeCompare(a))
      .map((date) => {
        const day = dayByDate.get(date);
        const dayEntries = entries.filter((entry) => entry.date === date);
        const dayPendingBlocks = pendingBlocks.filter((block) => block.date === date);
        return {
          date,
          totalMinutes: day?.totalMinutes ?? 0,
          entryCount: dayEntries.length,
          pendingCount: dayPendingBlocks.length,
          rows: day?.rows ?? [],
          entries: dayEntries,
          pendingBlocks: dayPendingBlocks,
        };
      });
  }

  private getPreviousFilledLabel(): string | null {
    const filledBlocks = new Map(
      this.data.blocks
        .filter((block) => block.status === 'filled')
        .map((block) => [block.id, block]),
    );
    const latestEntry = [...this.data.entries].sort((a, b) => {
      const blockA = filledBlocks.get(a.blockId);
      const blockB = filledBlocks.get(b.blockId);
      return (blockB?.endAt ?? '').localeCompare(blockA?.endAt ?? '');
    })[0];
    return latestEntry?.label ?? null;
  }

  private archiveCurrentAudit(): void {
    const hasData =
      this.data.blocks.length > 0 ||
      this.data.entries.length > 0 ||
      this.data.categories.length > 0;

    if (!hasData) {
      return;
    }

    const archiveDir = this.getArchiveDir();
    fs.mkdirSync(archiveDir, { recursive: true });
    const archivePath = path.join(
      archiveDir,
      `jamos-time-${formatArchiveTimestamp(new Date())}.json`,
    );
    fs.writeFileSync(archivePath, JSON.stringify(this.data, null, 2));
  }

  private getArchiveDir(): string {
    return path.join(path.dirname(this.filePath), 'archives');
  }

  private load(): AuditData {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      return normalizeData(JSON.parse(raw) as AuditData);
    } catch {
      return normalizeData(defaultData);
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmpPath, this.filePath);
  }
}

export function normalizeLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .replace(/[^\w ]+/g, '')
    .trim();
}

function normalizeData(input: AuditData): AuditData {
  return {
    version: 1,
    createdAt: input.createdAt ?? new Date().toISOString(),
    settings: normalizeSettings(input.settings ?? defaultSettings),
    blocks: input.blocks ?? [],
    entries: input.entries ?? [],
    categories: normalizeCategories(input.categories ?? []),
    aliases: input.aliases ?? [],
  };
}

function normalizeCategories(categories: Category[]): Category[] {
  return categories.map((category) => ({
    ...category,
    valueTier: isCategoryValueTier(category.valueTier)
      ? category.valueTier
      : undefined,
    hourlyRate: normalizeHourlyRate(category.hourlyRate),
  }));
}

function isCategoryValueTier(
  value: string | undefined,
): value is CategoryValueTier {
  return value === '$' || value === '$$' || value === '$$$' || value === '$$$$';
}

function isCompleteAuditBackup(input: unknown): input is AuditData {
  if (!input || typeof input !== 'object') {
    return false;
  }

  const candidate = input as Partial<AuditData>;
  return (
    typeof candidate.createdAt === 'string' &&
    Boolean(candidate.settings) &&
    Array.isArray(candidate.blocks) &&
    Array.isArray(candidate.entries) &&
    Array.isArray(candidate.categories) &&
    Array.isArray(candidate.aliases)
  );
}

function normalizeSettings(input: AppSettings): AppSettings {
  return {
    intervalMinutes: clamp(Number(input.intervalMinutes) || 15, 1, 240),
    activeDays: (input.activeDays ?? defaultSettings.activeDays)
      .map(Number)
      .filter((day) => day >= 0 && day <= 6),
    startTime: input.startTime || defaultSettings.startTime,
    endTime: input.endTime || defaultSettings.endTime,
    promptingEnabled: Boolean(input.promptingEnabled),
    launchAtLogin: Boolean(input.launchAtLogin),
    snoozeMinutes: clamp(Number(input.snoozeMinutes) || 5, 1, 240),
    apiKey: input.apiKey,
    aiEndpoint: input.aiEndpoint || defaultSettings.aiEndpoint,
    aiModel: input.aiModel || defaultSettings.aiModel,
  };
}

function buildDueBlocks(
  settings: AppSettings,
  createdAt: string,
  now: Date,
): TimeBlock[] {
  const blocks: TimeBlock[] = [];
  const start = new Date(now);
  start.setDate(start.getDate() - 21);
  start.setHours(0, 0, 0, 0);
  const auditStart = new Date(createdAt);
  const auditStartDay = startOfLocalDay(auditStart);
  if (start < auditStartDay) {
    start.setTime(auditStartDay.getTime());
  }

  for (
    const cursor = new Date(start);
    cursor <= now;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    if (!settings.activeDays.includes(cursor.getDay())) {
      continue;
    }

    const dayStart = withTime(cursor, settings.startTime);
    const dayEnd = withTime(cursor, settings.endTime);

    for (
      const blockStart = new Date(dayStart);
      blockStart < dayEnd;
      blockStart.setMinutes(blockStart.getMinutes() + settings.intervalMinutes)
    ) {
      const blockEnd = new Date(blockStart);
      blockEnd.setMinutes(blockEnd.getMinutes() + settings.intervalMinutes);

      if (blockEnd > dayEnd || blockEnd > now || blockEnd <= auditStart) {
        continue;
      }

      const startAt = blockStart.toISOString();
      const endAt = blockEnd.toISOString();
      blocks.push({
        id: `block-${startAt}`,
        startAt,
        endAt,
        status: 'pending',
      });
    }
  }

  return blocks;
}

function withTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const output = new Date(date);
  output.setHours(hours || 0, minutes || 0, 0, 0);
  return output;
}

function startOfLocalDay(date: Date): Date {
  const output = new Date(date);
  output.setHours(0, 0, 0, 0);
  return output;
}

function buildRows(
  values: Map<string, number>,
  categoryById: Map<string, Category>,
  totalMinutes: number,
): SummaryRow[] {
  return [...values.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([categoryId, minutes]) => ({
      categoryId,
      categoryName: categoryById.get(categoryId)?.name ?? 'Unknown',
      minutes,
      percent: totalMinutes === 0 ? 0 : Math.round((minutes / totalMinutes) * 100),
    }));
}

function buildAuditReport(
  rows: SummaryRow[],
  categoryById: Map<string, Category>,
  totalMinutes: number,
): AuditReport {
  const reportRows = rows
    .map((row) => {
      const category = categoryById.get(row.categoryId);
      const hourlyRate =
        category?.hourlyRate ??
        (category?.valueTier ? defaultTierRates[category.valueTier] : undefined);
      const estimatedValue =
        hourlyRate === undefined
          ? 0
          : Math.round((row.minutes / 60) * hourlyRate * 100) / 100;

      return {
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        scope: getCategoryScope(row.categoryName),
        minutes: row.minutes,
        percent: row.percent,
        valueTier: category?.valueTier,
        hourlyRate,
        estimatedValue,
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  return {
    rows: reportRows,
    scopeTotals: buildScopeTotals(reportRows, totalMinutes),
    totalMinutes,
    totalEstimatedValue:
      Math.round(sum(reportRows.map((row) => row.estimatedValue)) * 100) / 100,
  };
}

function buildScopeTotals(
  rows: AuditReport['rows'],
  totalMinutes: number,
): AuditReport['scopeTotals'] {
  return (['Work', 'Personal', 'Other'] as const).map((scope) => {
    const scopeRows = rows.filter((row) => row.scope === scope);
    const minutes = sum(scopeRows.map((row) => row.minutes));
    const estimatedValue =
      Math.round(sum(scopeRows.map((row) => row.estimatedValue)) * 100) / 100;

    return {
      scope,
      minutes,
      estimatedValue,
      percent: totalMinutes === 0 ? 0 : Math.round((minutes / totalMinutes) * 100),
    };
  });
}

function getCategoryScope(categoryName: string): 'Work' | 'Personal' | 'Other' {
  const normalized = categoryName.toLowerCase();
  if (normalized.startsWith('work -')) {
    return 'Work';
  }

  if (normalized.startsWith('personal -')) {
    return 'Personal';
  }

  return 'Other';
}

function normalizeHourlyRate(value: number | undefined): number | undefined {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return undefined;
  }

  return Math.max(0, Math.round(Number(value) * 100) / 100);
}

function minutesBetween(startAt: string, endAt: string): number {
  return Math.round(
    (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000,
  );
}

function formatLocalDate(value: string): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLocalTime(value: string): string {
  const date = new Date(value);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatArchiveTimestamp(date: Date): string {
  const day = formatLocalDate(date.toISOString());
  const time = `${formatLocalTime(date.toISOString()).replace(':', '')}${String(
    date.getSeconds(),
  ).padStart(2, '0')}`;
  return `${day}-${time}`;
}

function parseLocalDateTime(date: string, time: string): Date | null {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);

  if (!year || !month || !day || Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
