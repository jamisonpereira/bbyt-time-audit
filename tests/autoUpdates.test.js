const assert = require('node:assert/strict');

async function main() {
  const {
    automaticUpdateRepo,
    createAutoUpdateOptions,
    createDownloadingUpdateDialog,
    isAutomaticUpdateBusy,
    shouldUseAutomaticUpdates,
  } = await import('../dist-test/auto-updates/autoUpdates.mjs');

  assert.equal(automaticUpdateRepo, 'jamisonpereira/bbyt-time-audit');

  assert.equal(
    shouldUseAutomaticUpdates({ isPackaged: true, platform: 'darwin' }),
    true,
  );
  assert.equal(
    shouldUseAutomaticUpdates({ isPackaged: false, platform: 'darwin' }),
    false,
  );
  assert.equal(
    shouldUseAutomaticUpdates({ isPackaged: true, platform: 'linux' }),
    false,
  );

  const options = createAutoUpdateOptions();
  assert.equal(options.updateSource.repo, automaticUpdateRepo);
  assert.equal(options.updateInterval, '1 hour');
  assert.equal(options.notifyUser, false);

  const dialog = createDownloadingUpdateDialog('BBYT - Time Audit');
  assert.equal(dialog.type, 'info');
  assert.deepEqual(dialog.buttons, ['OK']);
  assert.equal(dialog.message, 'Update found');
  assert.match(dialog.detail, /Downloading the update now/);
  assert.match(dialog.detail, /prompted to restart/);

  assert.equal(isAutomaticUpdateBusy('idle'), false);
  assert.equal(isAutomaticUpdateBusy('checking'), true);
  assert.equal(isAutomaticUpdateBusy('downloading'), true);
  assert.equal(isAutomaticUpdateBusy('downloaded'), false);

  console.log('auto update tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
