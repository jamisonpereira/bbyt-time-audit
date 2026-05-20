const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
async function main() {
  const { TimeAuditStore } = await import('../dist-test/store/store.mjs');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jamos-time-store-'));
  const dataPath = path.join(tempRoot, 'audit.json');
  const store = new TimeAuditStore(dataPath);

  assert.deepEqual(
    store.getSettings().summarySections.map((section) => [
      section.id,
      section.visible,
    ]),
    [
      ['missedBlocks', true],
      ['categoryTotals', true],
      ['auditReport', true],
      ['dailyTotals', true],
      ['dailyReview', true],
      ['entries', true],
      ['archives', true],
    ],
  );

  const reorderedSettings = store.updateSettings({
    ...store.getSettings(),
    summarySections: [
      { id: 'auditReport', visible: true },
      { id: 'missedBlocks', visible: false },
    ],
  });
  assert.deepEqual(
    reorderedSettings.summarySections.map((section) => [
      section.id,
      section.visible,
    ]),
    [
      ['auditReport', true],
      ['missedBlocks', false],
      ['categoryTotals', true],
      ['dailyTotals', true],
      ['dailyReview', true],
      ['entries', true],
      ['archives', true],
    ],
  );

  store.addManualEntry({
    date: '2026-05-15',
    startTime: '09:00',
    endTime: '09:15',
    label: 'work email',
  });
  store.addManualEntry({
    date: '2026-05-15',
    startTime: '09:15',
    endTime: '09:45',
    label: 'development meeting',
  });
  store.addManualEntry({
    date: '2026-05-16',
    startTime: '10:00',
    endTime: '10:15',
    label: 'work email',
  });

  const summary = store.getSummary();
  assert.equal(summary.days.length, 2);
  assert.equal(summary.dayReviews.length, 2);
  assert.equal(summary.dayReviews[0].date, '2026-05-16');
  assert.equal(summary.dayReviews[0].entryCount, 1);
  assert.equal(summary.dayReviews[1].date, '2026-05-15');
  assert.equal(summary.dayReviews[1].totalMinutes, 45);
  assert.equal(summary.dayReviews[1].entries.length, 2);

  const backupJson = store.createBackupJson();
  const importedPath = path.join(tempRoot, 'imported.json');
  const importedStore = new TimeAuditStore(importedPath);
  importedStore.importBackupJson(backupJson);

  const importedSummary = importedStore.getSummary();
  assert.equal(importedSummary.totalMinutes, 60);
  assert.deepEqual(
    importedSummary.rows.map((row) => [row.categoryName, row.minutes]),
    [
      ['work email', 30],
      ['development meeting', 30],
    ],
  );

  const emailRow = importedSummary.rows.find(
    (row) => row.categoryName === 'work email',
  );
  assert.ok(emailRow);

  const valuedSummary = importedStore.updateCategoryValue({
    categoryId: emailRow.categoryId,
    valueTier: '$$$',
    hourlyRate: 300,
  });
  const valuedReportRow = valuedSummary.auditReport.rows.find(
    (row) => row.categoryName === 'work email',
  );
  assert.ok(valuedReportRow);
  assert.equal(valuedReportRow.valueTier, '$$$');
  assert.equal(valuedReportRow.hourlyRate, 300);
  assert.equal(valuedReportRow.estimatedValue, 150);
  assert.equal(valuedSummary.auditReport.totalEstimatedValue, 150);

  const defaultTierSummary = importedStore.updateCategoryValue({
    categoryId: emailRow.categoryId,
    valueTier: '$$',
  });
  const defaultTierRow = defaultTierSummary.auditReport.rows.find(
    (row) => row.categoryName === 'work email',
  );
  assert.equal(defaultTierRow.hourlyRate, 100);
  assert.equal(defaultTierRow.estimatedValue, 50);
  assert.equal(defaultTierSummary.auditReport.scopeTotals[2].scope, 'Other');
  assert.equal(defaultTierSummary.auditReport.scopeTotals[2].minutes, 60);

  const meetingBeforeMove = defaultTierSummary.rows.find(
    (row) => row.categoryName === 'development meeting',
  );
  assert.ok(meetingBeforeMove);
  const movedSummary = importedStore.reorderCategory({
    sourceCategoryId: meetingBeforeMove.categoryId,
    targetCategoryId: emailRow.categoryId,
    position: 'before',
  });
  assert.equal(movedSummary.auditReport.rows[0].categoryName, 'development meeting');

  const renamedSummary = importedStore.renameCategory({
    categoryId: emailRow.categoryId,
    name: 'Work - Email / Admin',
  });
  assert.ok(
    renamedSummary.auditReport.rows.find(
      (row) => row.categoryName === 'Work - Email / Admin',
    ),
  );
  assert.equal(renamedSummary.auditReport.scopeTotals[0].scope, 'Work');
  assert.equal(renamedSummary.auditReport.scopeTotals[0].minutes, 30);

  const meetingRow = renamedSummary.rows.find(
    (row) => row.categoryName === 'development meeting',
  );
  assert.ok(meetingRow);

  const mergedSummary = importedStore.mergeCategories({
    sourceCategoryId: meetingRow.categoryId,
    targetCategoryId: emailRow.categoryId,
  });
  assert.equal(mergedSummary.rows.length, 1);
  assert.equal(mergedSummary.rows[0].categoryName, 'Work - Email / Admin');
  assert.equal(mergedSummary.rows[0].minutes, 60);

  const reportCsv = importedStore.exportAuditReportCsv();
  assert.match(
    reportCsv,
    /"category","scope","minutes","hours","percent","value_tier"/,
  );
  assert.match(reportCsv, /Work - Email \/ Admin/);

  const aiStore = new TimeAuditStore(path.join(tempRoot, 'ai-merge.json'));
  aiStore.addManualEntry({
    date: '2026-05-16',
    startTime: '09:00',
    endTime: '09:15',
    label: 'work email',
  });
  aiStore.addManualEntry({
    date: '2026-05-16',
    startTime: '09:15',
    endTime: '09:30',
    label: 'read emails',
  });
  aiStore.addManualEntry({
    date: '2026-05-16',
    startTime: '09:30',
    endTime: '09:45',
    label: 'sales call',
  });
  aiStore.addManualEntry({
    date: '2026-05-16',
    startTime: '09:45',
    endTime: '10:00',
    label: 'sales meeting',
  });

  const selectivelyMerged = aiStore.applyMergeSuggestions([
    {
      canonical: 'Work - Email / Admin',
      labels: ['work email', 'read emails'],
    },
  ]);
  assert.equal(selectivelyMerged.canUndoMerge, true);
  assert.deepEqual(
    selectivelyMerged.rows.map((row) => row.categoryName).sort(),
    ['Work - Email / Admin', 'sales call', 'sales meeting'],
  );

  const undoneMerge = aiStore.undoLastMerge();
  assert.equal(undoneMerge.canUndoMerge, false);
  assert.deepEqual(
    undoneMerge.rows.map((row) => row.categoryName).sort(),
    ['read emails', 'sales call', 'sales meeting', 'work email'],
  );

  assert.throws(
    () => importedStore.importBackupJson('{"version":1,"entries":[]}'),
    /Invalid backup/,
  );

  fs.rmSync(tempRoot, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
