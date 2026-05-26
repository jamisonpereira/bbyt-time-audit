import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { updateRangeSelection } from './shared/selection';
import {
  summarySectionDefinitions,
  type AppMode,
  type ArchiveInfo,
  type AppSettings,
  type CategoryValueTier,
  type MergeSuggestion,
  type PromptState,
  type ReleaseUpdateResult,
  type SummarySectionId,
  type SummaryState,
  type TimeBlock,
} from './shared/types';
import type { JamosTimeApi } from './preload';

declare global {
  interface Window {
    jamosTime: JamosTimeApi;
  }
}

const dayOptions = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const valueTierOptions: Array<{ value: CategoryValueTier; label: string }> = [
  { value: '$', label: '$' },
  { value: '$$', label: '$$' },
  { value: '$$$', label: '$$$' },
  { value: '$$$$', label: '$$$$' },
];

type ReportSortColumn = 'time' | 'tier' | 'name';

type ReportDropTarget = {
  categoryId: string;
  action: 'before' | 'after' | 'merge';
};

type ReportDragState = {
  categoryId: string;
  startX: number;
  startY: number;
  isDragging: boolean;
};

const mode = (new URLSearchParams(window.location.search).get('mode') ??
  'summary') as AppMode;
const appDisplayName = 'BBYT - Time Audit';
const summarySectionLabels = new Map(
  summarySectionDefinitions.map((section) => [section.id, section.label]),
);

const isReleaseUpdateBusy = (result: ReleaseUpdateResult | null): boolean =>
  result?.status === 'checking' || result?.status === 'downloading';

const getUpdateButtonLabel = (
  checkingUpdate: boolean,
  releaseUpdate: ReleaseUpdateResult | null,
): string => {
  if (checkingUpdate || releaseUpdate?.status === 'checking') {
    return 'Checking...';
  }

  if (releaseUpdate?.status === 'downloading') {
    return 'Downloading...';
  }

  if (releaseUpdate?.status === 'downloaded') {
    return 'Install Update';
  }

  if (releaseUpdate?.status === 'available') {
    return 'Update Available';
  }

  return 'Check Updates';
};

const getUpdateNotice = (
  releaseUpdate: ReleaseUpdateResult | null,
): string | null => {
  if (releaseUpdate?.status === 'checking') {
    return 'Checking for updates...';
  }

  if (releaseUpdate?.status === 'downloading') {
    return 'Downloading update. You can keep using the app, and you will be prompted to restart when it is ready.';
  }

  if (releaseUpdate?.status === 'downloaded') {
    return 'Update downloaded. Click Install Update to restart and apply it.';
  }

  return null;
};

function App() {
  if (mode === 'prompt') {
    return <PromptView />;
  }

  if (mode === 'settings') {
    return <SettingsView />;
  }

  if (mode === 'merge') {
    return <MergeView />;
  }

  return <SummaryView />;
}

function PromptView() {
  const [state, setState] = useState<PromptState | null>(null);
  const [text, setText] = useState('');
  const activeBlockId = useRef<string | null>(null);

  const load = async () => {
    const next = await window.jamosTime.getPromptState();
    const nextBlockId = next.block?.id ?? null;
    if (activeBlockId.current !== nextBlockId) {
      setText('');
      activeBlockId.current = nextBlockId;
    }
    setState(next);
    if (!next.block) {
      window.jamosTime.closePrompt();
    }
  };

  useEffect(() => {
    load();
    return window.jamosTime.onPromptStateChanged(load);
  }, []);

  const suggestions = useMemo(() => {
    const allCategories = state?.allCategories ?? [];
    const query = text.trim().toLowerCase();
    if (!query) {
      return [];
    }

    const recentIds = new Set(
      (state?.recentCategories ?? []).map((category) => category.id),
    );
    return allCategories
      .filter(
        (category) =>
          !recentIds.has(category.id) &&
          category.name.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [state, text]);

  const save = async (label: string) => {
    if (!state?.block || !label.trim()) {
      return;
    }

    const next = await window.jamosTime.savePrompt(state.block.id, label);
    activeBlockId.current = next.block?.id ?? null;
    setState(next);
    setText('');
    if (!next.block) {
      window.jamosTime.closePrompt();
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        window.jamosTime.closePrompt();
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        save(text);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state?.block?.id, text]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save(text);
  };

  if (!state?.block) {
    return (
      <div className="prompt-shell empty-prompt">
        <div>
          <div className="eyebrow">{appDisplayName}</div>
          <h1>All caught up.</h1>
        </div>
        <button onClick={() => window.jamosTime.closePrompt()}>Close</button>
      </div>
    );
  }

  return (
    <div className="prompt-shell">
      <div className="prompt-header">
        <div>
          <div className="eyebrow">{appDisplayName}</div>
          <h1>{formatBlock(state.block)}</h1>
        </div>
        <button
          className="icon-button"
          title="Backfill later"
          onClick={() => window.jamosTime.closePrompt()}
        >
          x
        </button>
      </div>

      <div
        aria-hidden={state.pendingCount <= 1}
        className={`pending-pill ${
          state.pendingCount > 1 ? '' : 'prompt-placeholder'
        }`}
      >
        {state.pendingCount > 1
          ? `${state.pendingCount} unfilled blocks`
          : 'No unfilled blocks'}
      </div>

      <button
        aria-hidden={!state.previousFilledLabel}
        className={`same-button ${
          state.previousFilledLabel ? '' : 'prompt-placeholder'
        }`}
        disabled={!state.previousFilledLabel}
        onClick={() => save(state.previousFilledLabel ?? '')}
      >
        Same as previous: {state.previousFilledLabel ?? 'Last entry'}
      </button>

      <div className="quick-row">
        {state.recentCategories.map((category) => (
          <button
            key={category.id}
            className="quick-button"
            onClick={() => save(category.name)}
          >
            {category.name}
          </button>
        ))}
      </div>

      <form className="entry-form" onSubmit={submit}>
        <input
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              window.jamosTime.closePrompt();
            }
          }}
          placeholder="What were you doing?"
        />
        <button type="submit">Save</button>
      </form>

      <div className="suggestions" aria-live="polite">
        {suggestions.map((category) => (
          <button key={category.id} onClick={() => save(category.name)}>
            {category.name}
          </button>
        ))}
      </div>

      <div className="prompt-actions">
        <button
          onClick={async () => {
            await window.jamosTime.snoozePrompt(5);
          }}
        >
          Snooze
        </button>
        <button
          onClick={async () => {
            if (state.block) {
              const next = await window.jamosTime.skipPrompt(state.block.id);
              activeBlockId.current = next.block?.id ?? null;
              setText('');
              setState(next);
            }
          }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}

function SettingsView() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dataPath, setDataPath] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.jamosTime.getSettings().then(setSettings);
    window.jamosTime.getDataPath().then(setDataPath);
  }, []);

  if (!settings) {
    return <div className="page-shell">Loading...</div>;
  }

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings({ ...settings, [key]: value });
    setSaved(false);
  };

  const toggleDay = (day: number) => {
    const activeDays = settings.activeDays.includes(day)
      ? settings.activeDays.filter((candidate) => candidate !== day)
      : [...settings.activeDays, day].sort();
    update('activeDays', activeDays);
  };

  const moveSummarySection = (
    sectionId: SummarySectionId,
    direction: 'up' | 'down',
  ) => {
    const currentIndex = settings.summarySections.findIndex(
      (section) => section.id === sectionId,
    );
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= settings.summarySections.length
    ) {
      return;
    }

    const nextSections = [...settings.summarySections];
    const [section] = nextSections.splice(currentIndex, 1);
    nextSections.splice(targetIndex, 0, section);
    update('summarySections', nextSections);
  };

  const toggleSummarySection = (
    sectionId: SummarySectionId,
    visible: boolean,
  ) => {
    update(
      'summarySections',
      settings.summarySections.map((section) =>
        section.id === sectionId ? { ...section, visible } : section,
      ),
    );
  };

  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <div className="eyebrow">Settings</div>
          <h1>{appDisplayName}</h1>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.promptingEnabled}
            onChange={(event) => update('promptingEnabled', event.target.checked)}
          />
          <span>Prompting</span>
        </label>
      </header>

      <section className="panel">
        <h2>App</h2>
        <label className="switch setting-row">
          <input
            type="checkbox"
            checked={settings.launchAtLogin}
            onChange={(event) => update('launchAtLogin', event.target.checked)}
          />
          <span>Launch at login</span>
        </label>
      </section>

      <section className="panel">
        <h2>Schedule</h2>
        <div className="day-grid">
          {dayOptions.map((day) => (
            <button
              key={day.value}
              className={settings.activeDays.includes(day.value) ? 'selected' : ''}
              onClick={() => toggleDay(day.value)}
            >
              {day.label}
            </button>
          ))}
        </div>

        <div className="field-grid">
          <label>
            Start
            <input
              type="time"
              value={settings.startTime}
              onChange={(event) => update('startTime', event.target.value)}
            />
          </label>
          <label>
            End
            <input
              type="time"
              value={settings.endTime}
              onChange={(event) => update('endTime', event.target.value)}
            />
          </label>
          <label>
            Interval
            <input
              type="number"
              min="1"
              max="240"
              value={settings.intervalMinutes}
              onChange={(event) =>
                update('intervalMinutes', Number(event.target.value))
              }
            />
          </label>
          <label>
            Snooze
            <input
              type="number"
              min="1"
              max="240"
              value={settings.snoozeMinutes}
              onChange={(event) =>
                update('snoozeMinutes', Number(event.target.value))
              }
            />
            <span className="field-help">
              Minutes to hide the prompt before it asks again.
            </span>
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>AI Merge</h2>
        <label>
          API key
          <input
            type="password"
            value={settings.apiKey ?? ''}
            onChange={(event) => update('apiKey', event.target.value)}
            placeholder="Optional"
          />
        </label>
        <div className="field-grid">
          <label>
            Endpoint
            <input
              value={settings.aiEndpoint}
              onChange={(event) => update('aiEndpoint', event.target.value)}
            />
          </label>
          <label>
            Model
            <input
              value={settings.aiModel}
              onChange={(event) => update('aiModel', event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>Summary page</h2>
        <div className="summary-section-list">
          {settings.summarySections.map((section, index) => (
            <div className="summary-section-row" key={section.id}>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={section.visible}
                  onChange={(event) =>
                    toggleSummarySection(section.id, event.target.checked)
                  }
                />
                <span>{summarySectionLabels.get(section.id) ?? section.id}</span>
              </label>
              <div className="summary-section-actions">
                <button
                  disabled={index === 0}
                  onClick={() => moveSummarySection(section.id, 'up')}
                >
                  Up
                </button>
                <button
                  disabled={index === settings.summarySections.length - 1}
                  onClick={() => moveSummarySection(section.id, 'down')}
                >
                  Down
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel compact">
        <h2>Local data</h2>
        <code>{dataPath}</code>
      </section>

      <div className="sticky-actions">
        <button
          className="primary"
          onClick={async () => {
            const updated = await window.jamosTime.updateSettings(settings);
            setSettings(updated);
            setSaved(true);
          }}
        >
          Save Settings
        </button>
        {saved ? <span>Saved</span> : null}
      </div>
    </div>
  );
}

function SummaryView() {
  const [summary, setSummary] = useState<SummaryState | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dataPath, setDataPath] = useState('');
  const [archives, setArchives] = useState<ArchiveInfo[]>([]);
  const [fileMessage, setFileMessage] = useState('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [releaseUpdate, setReleaseUpdate] =
    useState<ReleaseUpdateResult | null>(null);

  const load = async () => {
    const [nextSummary, nextSettings, nextDataPath, nextArchives] =
      await Promise.all([
        window.jamosTime.getSummary(),
        window.jamosTime.getSettings(),
        window.jamosTime.getDataPath(),
        window.jamosTime.getArchives(),
      ]);
    setSummary(nextSummary);
    setSettings(nextSettings);
    setDataPath(nextDataPath);
    setArchives(nextArchives);
  };

  useEffect(() => {
    load();
    return window.jamosTime.onSummaryChanged(load);
  }, []);

  useEffect(
    () =>
      window.jamosTime.onReleaseUpdateChanged((result) => {
        setReleaseUpdate(result);
        if (!isReleaseUpdateBusy(result)) {
          setCheckingUpdate(false);
        }
      }),
    [],
  );

  if (!summary || !settings) {
    return <div className="page-shell">Loading...</div>;
  }

  const renderSummarySection = (sectionId: SummarySectionId) => {
    switch (sectionId) {
      case 'missedBlocks':
        return (
          <AccordionSection defaultOpen key={sectionId} title="Missed blocks">
            <PendingBlocksTable
              pendingBlocks={summary.pendingBlocks}
              previousFilledLabel={summary.previousFilledLabel}
              onFill={async (blockIds, label) => {
                const next = await window.jamosTime.fillPendingBlocks(
                  blockIds,
                  label,
                );
                setSummary(next);
              }}
              onSkip={async (blockIds) => {
                const next = await window.jamosTime.skipPendingBlocks(blockIds);
                setSummary(next);
              }}
              onDelete={async (blockIds) => {
                const next = await window.jamosTime.deletePendingBlocks(blockIds);
                setSummary(next);
              }}
            />
          </AccordionSection>
        );

      case 'categoryTotals':
        return (
          <AccordionSection
            action={
              <button onClick={() => window.jamosTime.openMerge()}>AI Merge</button>
            }
            defaultOpen
            key={sectionId}
            title="Category totals"
          >
            <SummaryTable rows={summary.rows} totalMinutes={summary.totalMinutes} />
          </AccordionSection>
        );

      case 'auditReport':
        return (
          <AccordionSection defaultOpen key={sectionId} title="Audit report">
            <AuditReportView
              report={summary.auditReport}
              onExport={() => window.jamosTime.exportAuditReportCsv()}
              onUpdateValue={async (input) => {
                const next = await window.jamosTime.updateCategoryValue(input);
                setSummary(next);
              }}
              onRenameCategory={async (input) => {
                const next = await window.jamosTime.renameCategory(input);
                setSummary(next);
              }}
              onMergeCategories={async (input) => {
                const next = await window.jamosTime.mergeCategories(input);
                setSummary(next);
              }}
              onReorderCategory={async (input) => {
                const next = await window.jamosTime.reorderCategory(input);
                setSummary(next);
              }}
            />
          </AccordionSection>
        );

      case 'dailyTotals':
        return (
          <AccordionSection defaultOpen key={sectionId} title="Daily totals">
            <div className="daily-list">
              {summary.days.map((day) => (
                <details key={day.date} open>
                  <summary>
                    <span>{day.date}</span>
                    <strong>{formatMinutes(day.totalMinutes)}</strong>
                  </summary>
                  <SummaryTable rows={day.rows} totalMinutes={day.totalMinutes} />
                </details>
              ))}
            </div>
          </AccordionSection>
        );

      case 'dailyReview':
        return (
          <AccordionSection defaultOpen key={sectionId} title="Daily review">
            <DailyReviewList dayReviews={summary.dayReviews} />
          </AccordionSection>
        );

      case 'entries':
        return (
          <AccordionSection defaultOpen key={sectionId} title="Entries">
            <ManualEntryForm
              onAdd={async (input) => {
                const next = await window.jamosTime.addManualEntry(input);
                setSummary(next);
              }}
            />
            <EntryTable
              entries={summary.entries}
              onDelete={async (entryIds) => {
                const next = await window.jamosTime.deleteEntries(entryIds);
                setSummary(next);
              }}
              onUpdate={async (entryId, label) => {
                const next = await window.jamosTime.updateEntry(entryId, label);
                setSummary(next);
              }}
            />
          </AccordionSection>
        );

      case 'archives':
        return (
          <AccordionSection key={sectionId} title="Archived audits">
            <ArchiveList
              archives={archives}
              onLoad={async (fileName) => {
                const confirmed = window.confirm(
                  'Load this archive? Your current audit will be archived first.',
                );
                if (confirmed) {
                  const next = await window.jamosTime.loadArchive(fileName);
                  setSummary(next);
                  setArchives(await window.jamosTime.getArchives());
                }
              }}
            />
          </AccordionSection>
        );
    }
  };

  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <div className="eyebrow">Summary</div>
          <h1>{appDisplayName}</h1>
        </div>
        <div className="header-actions">
          <button onClick={() => window.jamosTime.createManualPrompt()}>
            Log Last 15
          </button>
          <button onClick={() => window.jamosTime.openSettings()}>Settings</button>
          <button
            disabled={checkingUpdate || isReleaseUpdateBusy(releaseUpdate)}
            onClick={async () => {
              setCheckingUpdate(true);
              try {
                const result = await window.jamosTime.checkForUpdatesWithDialog();
                setReleaseUpdate(result);
              } finally {
                setCheckingUpdate(false);
              }
            }}
          >
            {getUpdateButtonLabel(checkingUpdate, releaseUpdate)}
          </button>
          <button onClick={() => window.jamosTime.exportCsv()}>Export CSV</button>
          <button
            onClick={async () => {
              const result = await window.jamosTime.exportBackup();
              setFileMessage(result.message);
            }}
          >
            Backup JSON
          </button>
          <button
            onClick={async () => {
              const confirmed = window.confirm(
                'Restore from a JSON backup? Your current audit will be archived first.',
              );
              if (!confirmed) {
                return;
              }

              const result = await window.jamosTime.importBackup();
              setFileMessage(result.message);
              if (result.ok) {
                await load();
              }
            }}
          >
            Restore JSON
          </button>
          <button
            className="danger"
            onClick={async () => {
              const confirmed = window.confirm(
                'Archive this audit and start a new blank audit?',
              );
              if (confirmed) {
                const next = await window.jamosTime.startNewAudit();
                setSummary(next);
                setArchives(await window.jamosTime.getArchives());
              }
            }}
          >
            New Audit
          </button>
          <button onClick={load}>Refresh</button>
        </div>
      </header>

      <section className="summary-strip">
        <div>
          <span>Audit started</span>
          <strong>{formatDate(summary.auditStartedAt)}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>{formatMinutes(summary.totalMinutes)}</strong>
        </div>
        <div>
          <span>Categories</span>
          <strong>{summary.rows.length}</strong>
        </div>
        <div>
          <span>Data</span>
          <code>{dataPath}</code>
        </div>
      </section>

      {getUpdateNotice(releaseUpdate) ? (
        <div className="notice">{getUpdateNotice(releaseUpdate)}</div>
      ) : null}
      {fileMessage ? <div className="notice">{fileMessage}</div> : null}

      {settings.summarySections
        .filter((section) => section.visible)
        .map((section) => renderSummarySection(section.id))}
    </div>
  );
}

function AccordionSection({
  title,
  action,
  defaultOpen = false,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="panel accordion-panel" open={defaultOpen}>
      <summary className="accordion-summary">
        <span>{title}</span>
        <div className="accordion-actions">
          {action}
          <span className="accordion-chevron">⌄</span>
        </div>
      </summary>
      <div className="accordion-content">{children}</div>
    </details>
  );
}

function MergeView() {
  const [suggestions, setSuggestions] = useState<MergeSuggestion[] | null>(null);
  const [error, setError] = useState('');
  const [selectedSuggestions, setSelectedSuggestions] = useState<string[]>([]);
  const [canUndoMerge, setCanUndoMerge] = useState(false);

  const load = async () => {
    setError('');
    setSuggestions(null);
    try {
      const [nextSuggestions, summary] = await Promise.all([
        window.jamosTime.suggestMerges(),
        window.jamosTime.getSummary(),
      ]);
      setSuggestions(nextSuggestions);
      setSelectedSuggestions(nextSuggestions.map(mergeSuggestionKey));
      setCanUndoMerge(summary.canUndoMerge);
    } catch (innerError) {
      setError(innerError instanceof Error ? innerError.message : 'Merge failed');
      setSuggestions([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <div className="eyebrow">AI Merge</div>
          <h1>Review Categories</h1>
        </div>
        <div className="header-actions">
          <button
            disabled={!canUndoMerge}
            onClick={async () => {
              const summary = await window.jamosTime.undoLastMerge();
              setCanUndoMerge(summary.canUndoMerge);
            }}
          >
            Undo Last Merge
          </button>
          <button onClick={load}>Retry</button>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}
      {suggestions === null ? <div className="panel">Checking labels...</div> : null}
      {suggestions?.length === 0 ? (
        <div className="panel">No merge suggestions.</div>
      ) : null}
      {suggestions && suggestions.length > 0 ? (
        <section className="panel">
          {suggestions.map((suggestion) => (
            <div className="merge-card" key={suggestion.canonical}>
              <label className="merge-select-row">
                <input
                  checked={selectedSuggestions.includes(
                    mergeSuggestionKey(suggestion),
                  )}
                  type="checkbox"
                  onChange={(event) => {
                    const key = mergeSuggestionKey(suggestion);
                    setSelectedSuggestions((current) =>
                      event.target.checked
                        ? [...current, key]
                        : current.filter((candidate) => candidate !== key),
                    );
                  }}
                />
                <h2>{suggestion.canonical}</h2>
              </label>
              {suggestion.action || suggestion.rationale ? (
                <div className="merge-guidance">
                  {suggestion.action ? <strong>{suggestion.action}</strong> : null}
                  {suggestion.rationale ? <span>{suggestion.rationale}</span> : null}
                </div>
              ) : null}
              <div className="quick-row">
                {suggestion.labels.map((label) => (
                  <span key={label} className="tag">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <button
            className="primary"
            disabled={selectedSuggestions.length === 0}
            onClick={async () => {
              await window.jamosTime.applyMerges(
                suggestions.filter((suggestion) =>
                  selectedSuggestions.includes(mergeSuggestionKey(suggestion)),
                ),
              );
              window.close();
            }}
          >
            Apply Selected Merges
          </button>
        </section>
      ) : null}
    </div>
  );
}

function SummaryTable({
  rows,
  totalMinutes,
}: {
  rows: SummaryState['rows'];
  totalMinutes: number;
}) {
  if (rows.length === 0) {
    return <div className="empty">No filled blocks yet.</div>;
  }

  return (
    <div className="table">
      {rows.map((row) => (
        <div className="table-row" key={row.categoryId}>
          <div>
            <strong>{row.categoryName}</strong>
            <div className="bar">
              <span
                style={{
                  width: `${totalMinutes === 0 ? 0 : (row.minutes / totalMinutes) * 100}%`,
                }}
              />
            </div>
          </div>
          <span>{formatMinutes(row.minutes)}</span>
          <span>{row.percent}%</span>
        </div>
      ))}
    </div>
  );
}

function AuditReportView({
  report,
  onExport,
  onUpdateValue,
  onRenameCategory,
  onMergeCategories,
  onReorderCategory,
}: {
  report: SummaryState['auditReport'];
  onExport: () => Promise<string | null>;
  onUpdateValue: (input: {
    categoryId: string;
    valueTier?: CategoryValueTier;
    hourlyRate?: number;
  }) => Promise<void>;
  onRenameCategory: (input: { categoryId: string; name: string }) => Promise<void>;
  onMergeCategories: (input: {
    sourceCategoryId: string;
    targetCategoryId: string;
  }) => Promise<void>;
  onReorderCategory: (input: {
    sourceCategoryId: string;
    targetCategoryId: string;
    position: 'before' | 'after';
  }) => Promise<void>;
}) {
  const [sortBy, setSortBy] = useState<'order' | 'time' | 'tier' | 'name'>('order');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const pointerDragRef = useRef<ReportDragState | null>(null);
  const [dropTarget, setDropTarget] = useState<ReportDropTarget | null>(null);
  const dropTargetRef = useRef<ReportDropTarget | null>(null);
  const rows = useMemo(() => {
    return [...report.rows].sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'tier') {
        comparison = tierScore(a.valueTier) - tierScore(b.valueTier);
      } else if (sortBy === 'name') {
        comparison = a.categoryName.localeCompare(b.categoryName);
      } else if (sortBy === 'time') {
        comparison = a.minutes - b.minutes;
      } else {
        comparison = a.sortOrder - b.sortOrder || b.minutes - a.minutes;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [report.rows, sortBy, sortDirection]);

  const toggleSort = (nextSortBy: ReportSortColumn) => {
    if (sortBy === nextSortBy) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(nextSortBy);
    setSortDirection(nextSortBy === 'name' ? 'asc' : 'desc');
  };

  const finishDrop = async (
    sourceCategoryId: string,
    target: ReportDropTarget | null,
  ) => {
    if (!target || sourceCategoryId === target.categoryId) {
      return;
    }

    const targetRow = rows.find((row) => row.categoryId === target.categoryId);
    if (!targetRow) {
      return;
    }

    if (target.action === 'merge') {
      const confirmed = window.confirm(`Merge with ${targetRow.categoryName}?`);
      if (!confirmed) {
        return;
      }

      await onMergeCategories({
        sourceCategoryId,
        targetCategoryId: target.categoryId,
      });
      return;
    }

    await onReorderCategory({
      sourceCategoryId,
      targetCategoryId: target.categoryId,
      position: target.action,
    });
  };

  const clearActiveDrag = () => {
    pointerDragRef.current = null;
    dropTargetRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
  };

  const updateActiveDrag = (clientX: number, clientY: number) => {
    const activeDrag = pointerDragRef.current;
    if (!activeDrag) {
      return;
    }

    const moved =
      Math.abs(clientX - activeDrag.startX) > 3 ||
      Math.abs(clientY - activeDrag.startY) > 3;
    if (!moved && !activeDrag.isDragging) {
      return;
    }

    if (!activeDrag.isDragging) {
      setSortBy('order');
      setSortDirection('asc');
      activeDrag.isDragging = true;
    }

    const nextTarget = getReportDropTarget(clientX, clientY, activeDrag.categoryId);
    dropTargetRef.current = nextTarget;
    setDropTarget(nextTarget);
  };

  const endActiveDrag = async (clientX: number, clientY: number) => {
    const activeDrag = pointerDragRef.current;
    if (!activeDrag) {
      return;
    }

    const target =
      getReportDropTarget(clientX, clientY, activeDrag.categoryId) ??
      dropTargetRef.current;
    const sourceCategoryId = activeDrag.categoryId;
    const shouldFinishDrop = activeDrag.isDragging;
    clearActiveDrag();
    if (shouldFinishDrop) {
      await finishDrop(sourceCategoryId, target);
    }
  };

  useEffect(() => {
    if (!draggingId) {
      return undefined;
    }

    const onWindowPointerMove = (event: PointerEvent) => {
      updateActiveDrag(event.clientX, event.clientY);
    };
    const onWindowPointerUp = (event: PointerEvent) => {
      void endActiveDrag(event.clientX, event.clientY);
    };

    window.addEventListener('pointermove', onWindowPointerMove, true);
    window.addEventListener('pointerup', onWindowPointerUp, true);
    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove, true);
      window.removeEventListener('pointerup', onWindowPointerUp, true);
    };
  }, [draggingId]);

  if (rows.length === 0) {
    return <div className="empty">No filled blocks yet.</div>;
  }

  return (
    <div className="audit-report">
      <div className="report-toolbar">
        <div className="report-metric">
          <span>Total time</span>
          <strong>{formatMinutes(report.totalMinutes)}</strong>
        </div>
        <button onClick={() => setSortBy('order')}>Custom Order</button>
        <button onClick={() => onExport()}>Export Report CSV</button>
      </div>

      <div className="scope-total-grid">
        {report.scopeTotals.map((scopeTotal) => (
          <div className="scope-total" key={scopeTotal.scope}>
            <span>{scopeTotal.scope}</span>
            <strong>{formatMinutes(scopeTotal.minutes)}</strong>
            <small>{scopeTotal.percent}%</small>
          </div>
        ))}
      </div>

      <CategoryCleanupTools
        rows={report.rows}
        onRenameCategory={onRenameCategory}
        onMergeCategories={onMergeCategories}
      />

      <div className="report-chart">
        <div className="report-header-row">
          <span />
          <button
            className={`report-sort-button ${sortBy === 'name' ? 'active' : ''}`}
            onClick={() => toggleSort('name')}
            title={`Category is ${sortDescription(sortBy, sortDirection, 'name')}`}
          >
            <span>Category</span>
            <SortIcon column="name" direction={sortDirection} sortBy={sortBy} />
          </button>
          <button
            className={`report-sort-button ${sortBy === 'time' ? 'active' : ''}`}
            onClick={() => toggleSort('time')}
            title={`Time is ${sortDescription(sortBy, sortDirection, 'time')}`}
          >
            <span>Time</span>
            <SortIcon column="time" direction={sortDirection} sortBy={sortBy} />
          </button>
          <button
            className={`report-sort-button ${sortBy === 'tier' ? 'active' : ''}`}
            onClick={() => toggleSort('tier')}
            title={`Dollar tier is ${sortDescription(sortBy, sortDirection, 'tier')}`}
          >
            <span>$</span>
            <SortIcon column="tier" direction={sortDirection} sortBy={sortBy} />
          </button>
        </div>
        {rows.map((row) => (
          <div
            className={`report-row ${
              dropTarget?.categoryId === row.categoryId
                ? `drop-${dropTarget.action}`
                : ''
            }`}
            data-report-row-id={row.categoryId}
            key={row.categoryId}
          >
            <button
              aria-label={`Drag ${row.categoryName}`}
              className="drag-handle"
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                const nextDrag = {
                  categoryId: row.categoryId,
                  startX: event.clientX,
                  startY: event.clientY,
                  isDragging: false,
                };
                pointerDragRef.current = nextDrag;
                dropTargetRef.current = null;
                setDropTarget(null);
                setDraggingId(row.categoryId);
              }}
              onPointerMove={(event) => {
                updateActiveDrag(event.clientX, event.clientY);
              }}
              onPointerUp={async (event) => {
                const activeDrag = pointerDragRef.current;
                if (!activeDrag || activeDrag.categoryId !== row.categoryId) {
                  return;
                }

                event.preventDefault();
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }

                await endActiveDrag(event.clientX, event.clientY);
              }}
              onPointerCancel={() => {
                clearActiveDrag();
              }}
              title="Drag to reorder. Drop on the middle of another row to merge."
              type="button"
            >
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </button>
            <div className="report-label">
              <strong>{row.categoryName}</strong>
              <span>
                {row.scope} · {formatMinutes(row.minutes)} · {row.percent}%
              </span>
            </div>
            <div className="report-bar-track">
              <span
                className={`report-bar scope-${row.scope.toLowerCase()}`}
                style={{
                  width: `${report.totalMinutes === 0 ? 0 : (row.minutes / report.totalMinutes) * 100}%`,
                }}
              />
            </div>
            <div className="tier-button-row" aria-label={`Value tier for ${row.categoryName}`}>
              {valueTierOptions.map((option) => (
                <button
                  className={row.valueTier === option.value ? 'selected' : ''}
                  key={option.value}
                  onClick={() =>
                    onUpdateValue({
                      categoryId: row.categoryId,
                      valueTier:
                        row.valueTier === option.value ? undefined : option.value,
                    })
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
            {dropTarget?.categoryId === row.categoryId &&
            dropTarget.action === 'merge' &&
            draggingId !== row.categoryId ? (
              <div className="merge-tooltip">Merge with {row.categoryName}?</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryCleanupTools({
  rows,
  onRenameCategory,
  onMergeCategories,
}: {
  rows: SummaryState['auditReport']['rows'];
  onRenameCategory: (input: { categoryId: string; name: string }) => Promise<void>;
  onMergeCategories: (input: {
    sourceCategoryId: string;
    targetCategoryId: string;
  }) => Promise<void>;
}) {
  const [renameCategoryId, setRenameCategoryId] = useState(rows[0]?.categoryId ?? '');
  const [renameValue, setRenameValue] = useState(rows[0]?.categoryName ?? '');
  const [sourceCategoryId, setSourceCategoryId] = useState(rows[0]?.categoryId ?? '');
  const [targetCategoryId, setTargetCategoryId] = useState(rows[1]?.categoryId ?? '');

  useEffect(() => {
    if (!rows.some((row) => row.categoryId === renameCategoryId)) {
      setRenameCategoryId(rows[0]?.categoryId ?? '');
      setRenameValue(rows[0]?.categoryName ?? '');
    }

    if (!rows.some((row) => row.categoryId === sourceCategoryId)) {
      setSourceCategoryId(rows[0]?.categoryId ?? '');
    }

    if (!rows.some((row) => row.categoryId === targetCategoryId)) {
      setTargetCategoryId(
        rows.find((row) => row.categoryId !== sourceCategoryId)?.categoryId ?? '',
      );
    }

    if (targetCategoryId === sourceCategoryId) {
      setTargetCategoryId(
        rows.find((row) => row.categoryId !== sourceCategoryId)?.categoryId ?? '',
      );
    }
  }, [rows, renameCategoryId, sourceCategoryId, targetCategoryId]);

  if (rows.length === 0) {
    return null;
  }

  return (
    <details className="category-tools">
      <summary>Category cleanup</summary>
      <div className="category-tool-grid">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            await onRenameCategory({
              categoryId: renameCategoryId,
              name: renameValue,
            });
          }}
        >
          <label>
            Rename
            <select
              value={renameCategoryId}
              onChange={(event) => {
                const category = rows.find(
                  (row) => row.categoryId === event.target.value,
                );
                setRenameCategoryId(event.target.value);
                setRenameValue(category?.categoryName ?? '');
              }}
            >
              {rows.map((row) => (
                <option key={row.categoryId} value={row.categoryId}>
                  {row.categoryName}
                </option>
              ))}
            </select>
          </label>
          <label>
            New name
            <input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
            />
          </label>
          <button className="primary" type="submit">
            Rename Category
          </button>
        </form>

        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!sourceCategoryId || !targetCategoryId) {
              return;
            }

            await onMergeCategories({
              sourceCategoryId,
              targetCategoryId,
            });
          }}
        >
          <label>
            Merge from
            <select
              value={sourceCategoryId}
              onChange={(event) => setSourceCategoryId(event.target.value)}
            >
              {rows.map((row) => (
                <option key={row.categoryId} value={row.categoryId}>
                  {row.categoryName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Into
            <select
              value={targetCategoryId}
              onChange={(event) => setTargetCategoryId(event.target.value)}
            >
              {rows
                .filter((row) => row.categoryId !== sourceCategoryId)
                .map((row) => (
                  <option key={row.categoryId} value={row.categoryId}>
                    {row.categoryName}
                  </option>
                ))}
            </select>
          </label>
          <button disabled={rows.length < 2} type="submit">
            Merge Categories
          </button>
        </form>
      </div>
    </details>
  );
}

function DailyReviewList({
  dayReviews,
}: {
  dayReviews: SummaryState['dayReviews'];
}) {
  if (dayReviews.length === 0) {
    return <div className="empty">No daily activity yet.</div>;
  }

  return (
    <div className="daily-review-list">
      {dayReviews.map((day) => (
        <details className="daily-review-card" key={day.date} open>
          <summary>
            <div>
              <strong>{day.date}</strong>
              <span>
                {day.entryCount} entries
                {day.pendingCount > 0 ? `, ${day.pendingCount} missed` : ''}
              </span>
            </div>
            <strong>{formatMinutes(day.totalMinutes)}</strong>
          </summary>

          <div className="daily-review-grid">
            <div>
              <h3>Categories</h3>
              <SummaryTable rows={day.rows} totalMinutes={day.totalMinutes} />
            </div>
            <div>
              <h3>Entries</h3>
              {day.entries.length === 0 ? (
                <div className="empty">No entries for this day.</div>
              ) : (
                <div className="compact-list">
                  {day.entries.map((entry) => (
                    <div key={entry.id}>
                      <strong>{entry.label}</strong>
                      <span>
                        {formatTime(entry.startAt)} to {formatTime(entry.endAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3>Missed</h3>
              {day.pendingBlocks.length === 0 ? (
                <div className="empty">No missed blocks.</div>
              ) : (
                <div className="compact-list">
                  {day.pendingBlocks.map((block) => (
                    <div key={block.id}>
                      <strong>{formatTime(block.startAt)}</strong>
                      <span>to {formatTime(block.endAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

function PendingBlocksTable({
  pendingBlocks,
  previousFilledLabel,
  onFill,
  onSkip,
  onDelete,
}: {
  pendingBlocks: SummaryState['pendingBlocks'];
  previousFilledLabel: string | null;
  onFill: (blockIds: string[], label: string) => Promise<void>;
  onSkip: (blockIds: string[]) => Promise<void>;
  onDelete: (blockIds: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [label, setLabel] = useState('');
  const lastSelectedBlockId = useRef<string | null>(null);

  if (pendingBlocks.length === 0) {
    return <div className="empty">No missed blocks.</div>;
  }

  const selectedSet = new Set(selected);
  const allSelected =
    pendingBlocks.length > 0 && selected.length === pendingBlocks.length;
  const toggleSelected = (
    blockId: string,
    checked: boolean,
    shiftKey: boolean,
  ) => {
    const orderedIds = pendingBlocks.map((block) => block.id);
    setSelected((current) =>
      updateRangeSelection({
        orderedIds,
        selectedIds: current,
        clickedId: blockId,
        anchorId: lastSelectedBlockId.current,
        checked,
        shiftKey,
      }),
    );
    lastSelectedBlockId.current = blockId;
  };
  const selectedCount = selected.length;

  return (
    <>
      <div className="pending-toolbar">
        <label className="select-all">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event) => {
              lastSelectedBlockId.current = null;
              setSelected(
                event.target.checked
                  ? pendingBlocks.map((block) => block.id)
                  : [],
              );
            }}
          />
          <span>Select all</span>
        </label>
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Fill selected with..."
        />
        <button
          className="primary"
          disabled={selectedCount === 0 || label.trim().length === 0}
          onClick={async () => {
            await onFill(selected, label);
            setSelected([]);
            lastSelectedBlockId.current = null;
            setLabel('');
          }}
        >
          Fill Selected
        </button>
        <button
          disabled={selectedCount === 0 || !previousFilledLabel}
          onClick={async () => {
            if (previousFilledLabel) {
              await onFill(selected, previousFilledLabel);
              setSelected([]);
              lastSelectedBlockId.current = null;
            }
          }}
        >
          Same as Previous
        </button>
        <button
          disabled={selectedCount === 0}
          onClick={async () => {
            const confirmed = window.confirm(
              `Skip ${selectedCount} selected block${
                selectedCount === 1 ? '' : 's'
              }?`,
            );
            if (confirmed) {
              await onSkip(selected);
              setSelected([]);
              lastSelectedBlockId.current = null;
            }
          }}
        >
          Skip Selected
        </button>
        <button
          className="danger"
          disabled={selectedCount === 0}
          onClick={async () => {
            const confirmed = window.confirm(
              `Delete ${selectedCount} selected block${
                selectedCount === 1 ? '' : 's'
              }?`,
            );
            if (confirmed) {
              await onDelete(selected);
              setSelected([]);
              lastSelectedBlockId.current = null;
            }
          }}
        >
          Delete Selected
        </button>
      </div>

      <div className="pending-list">
        {pendingBlocks.map((block) => (
          <div className="pending-row" key={block.id}>
            <input
              aria-label={`Select block ${block.date}`}
              checked={selectedSet.has(block.id)}
              type="checkbox"
              onChange={(event) => {
                const nativeEvent = event.nativeEvent as Event & {
                  shiftKey?: boolean;
                };
                toggleSelected(
                  block.id,
                  event.target.checked,
                  Boolean(nativeEvent.shiftKey),
                );
              }}
            />
            <div>
              <strong>{block.date}</strong>
              <span>
                {formatTime(block.startAt)} to {formatTime(block.endAt)}
              </span>
            </div>
            <span>{formatMinutes(block.minutes)}</span>
            <button
              onClick={async () => {
                if (previousFilledLabel) {
                  await onFill([block.id], previousFilledLabel);
                }
              }}
              disabled={!previousFilledLabel}
            >
              Same
            </button>
            <button onClick={() => onSkip([block.id])}>Skip</button>
            <button className="danger" onClick={() => onDelete([block.id])}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function EntryTable({
  entries,
  onDelete,
  onUpdate,
}: {
  entries: SummaryState['entries'];
  onDelete: (entryIds: string[]) => Promise<void>;
  onUpdate: (entryId: string, label: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  if (entries.length === 0) {
    return <div className="empty">No entries yet.</div>;
  }

  const selectedSet = new Set(selected);
  const allSelected = entries.length > 0 && selected.length === entries.length;
  const toggleSelected = (entryId: string) => {
    setSelected((current) =>
      current.includes(entryId)
        ? current.filter((id) => id !== entryId)
        : [...current, entryId],
    );
  };

  return (
    <>
      <div className="entry-toolbar">
        <label className="select-all">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event) =>
              setSelected(event.target.checked ? entries.map((entry) => entry.id) : [])
            }
          />
          <span>Select all</span>
        </label>
        <button
          className="danger"
          disabled={selected.length === 0}
          onClick={async () => {
            const confirmed = window.confirm(
              `Delete ${selected.length} selected entr${
                selected.length === 1 ? 'y' : 'ies'
              }?`,
            );
            if (confirmed) {
              await onDelete(selected);
              setSelected([]);
            }
          }}
        >
          Delete Selected
        </button>
      </div>

      <div className="entry-list">
        {entries.map((entry) => (
          <div className="entry-row" key={entry.id}>
            <input
              aria-label={`Select ${entry.label}`}
              checked={selectedSet.has(entry.id)}
              type="checkbox"
              onChange={() => toggleSelected(entry.id)}
            />
            <div>
              {editingId === entry.id ? (
                <form
                  className="inline-edit"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    await onUpdate(entry.id, draft);
                    setEditingId(null);
                    setDraft('');
                  }}
                >
                  <input
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <button type="submit">Save</button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setDraft('');
                    }}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <strong>{entry.label}</strong>
              )}
              <span>
                {entry.date} · {formatTime(entry.startAt)} to{' '}
                {formatTime(entry.endAt)}
              </span>
            </div>
            <span>{entry.categoryName}</span>
            <span>{formatMinutes(entry.minutes)}</span>
            <button
              onClick={() => {
                setEditingId(entry.id);
                setDraft(entry.label);
              }}
            >
              Edit
            </button>
            <button
              className="danger"
              onClick={async () => {
                const confirmed = window.confirm(
                  `Delete "${entry.label}" from ${entry.date}?`,
                );
                if (confirmed) {
                  await onDelete([entry.id]);
                  setSelected((current) =>
                    current.filter((id) => id !== entry.id),
                  );
                }
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function ManualEntryForm({
  onAdd,
}: {
  onAdd: (input: {
    date: string;
    startTime: string;
    endTime: string;
    label: string;
  }) => Promise<void>;
}) {
  const now = new Date();
  const [date, setDate] = useState(toLocalInputDate(now));
  const [startTime, setStartTime] = useState(toLocalInputTime(addMinutes(now, -15)));
  const [endTime, setEndTime] = useState(toLocalInputTime(now));
  const [label, setLabel] = useState('');

  return (
    <form
      className="manual-entry-form"
      onSubmit={async (event) => {
        event.preventDefault();
        await onAdd({ date, startTime, endTime, label });
        setLabel('');
      }}
    >
      <label>
        Date
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <label>
        Start
        <input
          type="time"
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
        />
      </label>
      <label>
        End
        <input
          type="time"
          value={endTime}
          onChange={(event) => setEndTime(event.target.value)}
        />
      </label>
      <label>
        Label
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="What were you doing?"
        />
      </label>
      <button className="primary" type="submit">
        Add Past Slot
      </button>
    </form>
  );
}

function ArchiveList({
  archives,
  onLoad,
}: {
  archives: ArchiveInfo[];
  onLoad: (fileName: string) => Promise<void>;
}) {
  if (archives.length === 0) {
    return <div className="empty">No archived audits yet.</div>;
  }

  return (
    <div className="archive-list">
      {archives.map((archive) => (
        <div className="archive-row" key={archive.fileName}>
          <div>
            <strong>{formatDate(archive.createdAt)}</strong>
            <span>{archive.fileName}</span>
          </div>
          <span>{archive.entryCount} entries</span>
          <button onClick={() => onLoad(archive.fileName)}>Load</button>
        </div>
      ))}
    </div>
  );
}

function formatBlock(block: TimeBlock): string {
  return `${formatTime(block.startAt)} to ${formatTime(block.endAt)}`;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) {
    return `${remainder}m`;
  }

  if (remainder === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainder}m`;
}

function tierScore(value: CategoryValueTier | undefined): number {
  if (value === '$$$$') {
    return 4;
  }

  if (value === '$$$') {
    return 3;
  }

  if (value === '$$') {
    return 2;
  }

  if (value === '$') {
    return 1;
  }

  return 0;
}

function SortIcon({
  sortBy,
  direction,
  column,
}: {
  sortBy: 'order' | 'time' | 'tier' | 'name';
  direction: 'asc' | 'desc';
  column: ReportSortColumn;
}) {
  const state =
    sortBy !== column ? 'none' : direction === 'asc' ? 'ascending' : 'descending';

  return (
    <span aria-hidden="true" className={`sort-icon ${state}`}>
      <span className="sort-chevron up" />
      <span className="sort-chevron down" />
    </span>
  );
}

function sortDescription(
  sortBy: 'order' | 'time' | 'tier' | 'name',
  direction: 'asc' | 'desc',
  column: ReportSortColumn,
): string {
  if (sortBy !== column) {
    return 'not sorted';
  }

  return direction === 'asc' ? 'sorted ascending' : 'sorted descending';
}

function mergeSuggestionKey(suggestion: MergeSuggestion): string {
  return `${suggestion.canonical}:${suggestion.labels.join('|')}`;
}

function getReportDropTarget(
  clientX: number,
  clientY: number,
  sourceCategoryId: string,
): { categoryId: string; action: 'before' | 'after' | 'merge' } | null {
  const rowElement = document
    .elementsFromPoint(clientX, clientY)
    .map((element) => element.closest('[data-report-row-id]') as HTMLElement | null)
    .find((element): element is HTMLElement => Boolean(element));

  const categoryId = rowElement?.dataset.reportRowId;
  if (!rowElement || !categoryId || categoryId === sourceCategoryId) {
    return null;
  }

  const rect = rowElement.getBoundingClientRect();
  const position = (clientY - rect.top) / rect.height;
  const action = position < 0.3 ? 'before' : position > 0.7 ? 'after' : 'merge';
  return { categoryId, action };
}

function addMinutes(date: Date, minutes: number): Date {
  const output = new Date(date);
  output.setMinutes(output.getMinutes() + minutes);
  return output;
}

function toLocalInputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toLocalInputTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
