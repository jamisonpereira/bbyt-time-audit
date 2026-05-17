const assert = require('node:assert/strict');

async function main() {
  const {
    compareVersions,
    normalizeReleaseTag,
    parseLatestRelease,
  } = await import('../dist-test/release-updates/releaseUpdates.mjs');

  assert.equal(normalizeReleaseTag('v0.1.1'), '0.1.1');
  assert.equal(normalizeReleaseTag('0.1.1'), '0.1.1');
  assert.equal(compareVersions('0.1.1', '0.1.0'), 1);
  assert.equal(compareVersions('0.1.0', '0.1.0'), 0);
  assert.equal(compareVersions('0.1.0', '0.1.1'), -1);
  assert.equal(compareVersions('0.10.0', '0.2.0'), 1);

  const release = parseLatestRelease(
    {
      tag_name: 'v0.1.1',
      html_url: 'https://github.com/jamison/bbyt-time-audit/releases/tag/v0.1.1',
      name: 'BBYT - Time Audit v0.1.1',
      prerelease: false,
      draft: false,
    },
    '0.1.0',
  );

  assert.deepEqual(release, {
    status: 'available',
    currentVersion: '0.1.0',
    latestVersion: '0.1.1',
    releaseName: 'BBYT - Time Audit v0.1.1',
    releaseUrl: 'https://github.com/jamison/bbyt-time-audit/releases/tag/v0.1.1',
  });

  console.log('release update tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
