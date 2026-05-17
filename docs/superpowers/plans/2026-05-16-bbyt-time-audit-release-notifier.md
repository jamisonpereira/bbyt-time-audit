# BBYT Time Audit Release Notifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `BBYT - Time Audit` downloadable from public GitHub Releases and notify Apple Silicon Mac users when a newer release is available.

**Architecture:** Keep Electron Forge as the packaging system. Do not add true macOS auto-update because this project will not use an Apple Developer account, code signing, or notarization yet. Add a lightweight GitHub Releases checker in the Electron main process, surface update availability in the tray menu, and open the latest release page for manual download.

**Tech Stack:** Electron Forge, Electron main process, TypeScript, GitHub Releases API, existing tray menu, existing npm packaging scripts.

---

## Decisions

- App display name and packaged product name: `BBYT - Time Audit`.
- Initial MVP version: `0.1.0`.
- Distribution channel: public GitHub repository with public GitHub Releases.
- Target Mac architecture for the friend: Apple Silicon `darwin/arm64`.
- Update behavior: notify only; do not silently download or install.
- Signing/notarization: skipped for now. Friend may need to right-click the app and choose Open the first time.

## GitHub Account Setup For Jamison

- [ ] **Step 1: Create a public GitHub repository**

  In GitHub, create a new public repo. Recommended name:

  ```text
  bbyt-time-audit
  ```

  Recommended settings:

  ```text
  Visibility: Public
  Add README: No
  Add .gitignore: No
  Add license: No
  ```

  Leave those files unchecked because the local app already has its own package files, and the repo currently has no commits.

- [ ] **Step 2: Confirm the final repo URL**

  The implementation needs the exact repo owner and name. Expected shape:

  ```text
  https://github.com/<github-username>/bbyt-time-audit
  ```

  The app will use this API endpoint:

  ```text
  https://api.github.com/repos/<github-username>/bbyt-time-audit/releases/latest
  ```

- [ ] **Step 3: Confirm local GitHub auth**

  Run:

  ```bash
  gh auth status
  ```

  Expected: the command shows an authenticated GitHub account with permission to push to the new repository. If `gh` is not authenticated, run:

  ```bash
  gh auth login
  ```

## File Structure

- Modify `package.json`: set `version` to `0.1.0`, keep `productName` as `BBYT - Time Audit`, add a GitHub `repository` field, and keep packaging scripts.
- Modify `forge.config.ts`: keep ZIP maker for macOS and ensure Forge output remains stable for `darwin/arm64`.
- Modify `src/main.ts`: replace the source-rebuild update menu with a GitHub release notification menu.
- Modify `src/shared/types.ts`: replace local install update types with release update types.
- Modify `src/preload.ts`: expose the new update-check/open-release IPC methods if renderer access is needed.
- Create `src/main/releaseUpdates.ts`: isolate GitHub latest-release fetch, semver comparison, and result shaping.
- Create `tests/releaseUpdates.test.js`: test version comparison and release parsing without making network calls.
- Create `.gitignore`: prevent `node_modules`, `out`, `dist-test`, local env files, logs, and user data exports from being committed.
- Create `docs/release.md`: short release checklist for Jamison.

## Task 1: Repo Hygiene And MVP Version

**Files:**
- Modify: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Set MVP version**

  Change `package.json`:

  ```json
  {
    "name": "jamos-time",
    "productName": "BBYT - Time Audit",
    "version": "0.1.0",
    "description": "A local-first 15-minute time audit app."
  }
  ```

  Keep the package name as `jamos-time` unless Jamison wants the npm/internal identifier changed too. The visible app name comes from `productName`.

- [ ] **Step 2: Add repository metadata after Jamison provides the GitHub repo**

  Add this to `package.json`, replacing `<github-username>`:

  ```json
  {
    "repository": {
      "type": "git",
      "url": "git+https://github.com/<github-username>/bbyt-time-audit.git"
    },
    "bugs": {
      "url": "https://github.com/<github-username>/bbyt-time-audit/issues"
    },
    "homepage": "https://github.com/<github-username>/bbyt-time-audit#readme"
  }
  ```

- [ ] **Step 3: Add `.gitignore`**

  Create `.gitignore`:

  ```gitignore
  node_modules/
  out/
  dist/
  dist-test/
  .vite/
  .env
  .env.*
  *.log
  .DS_Store
  npm-debug.log*
  yarn-debug.log*
  yarn-error.log*
  ```

- [ ] **Step 4: Verify package metadata**

  Run:

  ```bash
  npm pkg get productName version repository
  ```

  Expected: `productName` is `BBYT - Time Audit`, `version` is `0.1.0`, and `repository` points at the public GitHub repo.

## Task 2: Release Update Module

**Files:**
- Create: `src/main/releaseUpdates.ts`
- Test: `tests/releaseUpdates.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write release update tests**

  Create `tests/releaseUpdates.test.js`:

  ```js
  const assert = require('node:assert/strict');
  const {
    compareVersions,
    normalizeReleaseTag,
    parseLatestRelease,
  } = require('../dist-test/release-updates/releaseUpdates.js');

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
  ```

- [ ] **Step 2: Add a test script**

  Add to `package.json` scripts:

  ```json
  {
    "test:release-updates": "vite build --ssr src/main/releaseUpdates.ts --outDir dist-test/release-updates --emptyOutDir && node tests/releaseUpdates.test.js"
  }
  ```

- [ ] **Step 3: Run test to verify it fails before implementation**

  Run:

  ```bash
  npm run test:release-updates
  ```

  Expected: fail because `src/main/releaseUpdates.ts` does not exist yet.

- [ ] **Step 4: Implement release update module**

  Create `src/main/releaseUpdates.ts`:

  ```ts
  export type ReleaseUpdateStatus =
    | 'available'
    | 'current'
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

  export type GitHubLatestRelease = {
    tag_name?: string;
    html_url?: string;
    name?: string | null;
    prerelease?: boolean;
    draft?: boolean;
  };

  export const normalizeReleaseTag = (tag: string): string =>
    tag.trim().replace(/^v/i, '');

  export const compareVersions = (left: string, right: string): number => {
    const leftParts = normalizeReleaseTag(left).split('.').map(Number);
    const rightParts = normalizeReleaseTag(right).split('.').map(Number);
    const length = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < length; index += 1) {
      const leftPart = leftParts[index] ?? 0;
      const rightPart = rightParts[index] ?? 0;
      if (leftPart > rightPart) return 1;
      if (leftPart < rightPart) return -1;
    }

    return 0;
  };

  export const parseLatestRelease = (
    release: GitHubLatestRelease,
    currentVersion: string,
  ): ReleaseUpdateResult => {
    if (release.draft || release.prerelease) {
      return {
        status: 'current',
        currentVersion,
        message: 'Latest release is not a public stable release.',
      };
    }

    if (!release.tag_name || !release.html_url) {
      return {
        status: 'unavailable',
        currentVersion,
        message: 'Latest GitHub release did not include a tag and URL.',
      };
    }

    const latestVersion = normalizeReleaseTag(release.tag_name);
    if (compareVersions(latestVersion, currentVersion) <= 0) {
      return {
        status: 'current',
        currentVersion,
        latestVersion,
        releaseName: release.name ?? release.tag_name,
        releaseUrl: release.html_url,
      };
    }

    return {
      status: 'available',
      currentVersion,
      latestVersion,
      releaseName: release.name ?? release.tag_name,
      releaseUrl: release.html_url,
    };
  };

  export const checkLatestRelease = async (
    repoOwner: string,
    repoName: string,
    currentVersion: string,
    fetchImpl: typeof fetch = fetch,
  ): Promise<ReleaseUpdateResult> => {
    try {
      const response = await fetchImpl(
        `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'BBYT-Time-Audit',
          },
        },
      );

      if (response.status === 404) {
        return {
          status: 'unavailable',
          currentVersion,
          message: 'No public GitHub release has been published yet.',
        };
      }

      if (!response.ok) {
        return {
          status: 'error',
          currentVersion,
          message: `GitHub release check failed with HTTP ${response.status}.`,
        };
      }

      const release = (await response.json()) as GitHubLatestRelease;
      return parseLatestRelease(release, currentVersion);
    } catch (error) {
      return {
        status: 'error',
        currentVersion,
        message:
          error instanceof Error ? error.message : 'Unknown release check error.',
      };
    }
  };
  ```

- [ ] **Step 5: Run tests**

  Run:

  ```bash
  npm run test:release-updates
  ```

  Expected: `release update tests passed`.

## Task 3: Main Process Update Notification

**Files:**
- Modify: `src/main.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/preload.ts`

- [ ] **Step 1: Replace update result types**

  In `src/shared/types.ts`, replace `UpdateInstalledResult` and `UpdateCapabilityResult` with:

  ```ts
  export type ReleaseUpdateStatus =
    | 'available'
    | 'current'
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
  ```

- [ ] **Step 2: Update preload API**

  In `src/preload.ts`, remove `getUpdateCapability` and `updateInstalled`, then expose:

  ```ts
  checkForUpdates: (): Promise<ReleaseUpdateResult> =>
    ipcRenderer.invoke('app:checkForUpdates'),
  openLatestRelease: (): Promise<void> =>
    ipcRenderer.invoke('app:openLatestRelease'),
  ```

- [ ] **Step 3: Replace local rebuild imports in `src/main.ts`**

  Remove unused imports:

  ```ts
  import { execFile } from 'node:child_process';
  import os from 'node:os';
  import { promisify } from 'node:util';
  ```

  Add:

  ```ts
  import { checkLatestRelease } from './main/releaseUpdates';
  import type { ReleaseUpdateResult } from './shared/types';
  ```

- [ ] **Step 4: Add repo constants and cached state**

  In `src/main.ts`, near `appDisplayName`, add:

  ```ts
  const releaseRepoOwner = '<github-username>';
  const releaseRepoName = 'bbyt-time-audit';
  let latestReleaseCheck: ReleaseUpdateResult = {
    status: 'unavailable',
    currentVersion: app.getVersion(),
    message: 'No update check has run yet.',
  };
  ```

- [ ] **Step 5: Add update-check functions**

  In `src/main.ts`, replace `getUpdateCapability` and `updateInstalledApp` with:

  ```ts
  const checkForReleaseUpdate = async (): Promise<ReleaseUpdateResult> => {
    latestReleaseCheck = await checkLatestRelease(
      releaseRepoOwner,
      releaseRepoName,
      app.getVersion(),
    );
    refreshTrayMenu();

    if (latestReleaseCheck.status === 'available') {
      new Notification({
        title: `${appDisplayName} update available`,
        body: `Version ${latestReleaseCheck.latestVersion} is ready to download.`,
      }).show();
    }

    return latestReleaseCheck;
  };

  const openLatestRelease = async (): Promise<void> => {
    if (!latestReleaseCheck.releaseUrl) {
      await checkForReleaseUpdate();
    }

    if (latestReleaseCheck.releaseUrl) {
      await shell.openExternal(latestReleaseCheck.releaseUrl);
      return;
    }

    await shell.openExternal(
      `https://github.com/${releaseRepoOwner}/${releaseRepoName}/releases`,
    );
  };
  ```

  Also add `Notification` to the Electron import list.

- [ ] **Step 6: Replace tray update menu item**

  In `refreshTrayMenu`, remove the `Update Installed App` source-rebuild menu block and add this after `Settings`:

  ```ts
  ...(latestReleaseCheck.status === 'available'
    ? [
        {
          label: `Update Available (${latestReleaseCheck.latestVersion})`,
          click: openLatestRelease,
        },
      ]
    : [
        {
          label: 'Check for Updates',
          click: async () => {
            const result = await checkForReleaseUpdate();
            await dialog.showMessageBox({
              type: result.status === 'error' ? 'error' : 'info',
              message:
                result.status === 'available'
                  ? `Version ${result.latestVersion} is available`
                  : 'No update available',
              detail:
                result.status === 'available'
                  ? 'Opening the GitHub release page so you can download the new version.'
                  : result.message ?? `You are running version ${result.currentVersion}.`,
            });

            if (result.status === 'available') {
              await openLatestRelease();
            }
          },
        },
      ]),
  ```

- [ ] **Step 7: Register IPC handlers**

  In `registerIpc`, replace the old update handlers:

  ```ts
  ipcMain.handle('app:checkForUpdates', () => checkForReleaseUpdate());
  ipcMain.handle('app:openLatestRelease', () => openLatestRelease());
  ```

- [ ] **Step 8: Check once on startup**

  In `app.on('ready')`, after `createTray()`, add:

  ```ts
  setTimeout(() => {
    checkForReleaseUpdate().catch((error) => {
      latestReleaseCheck = {
        status: 'error',
        currentVersion: app.getVersion(),
        message: error instanceof Error ? error.message : 'Update check failed.',
      };
      refreshTrayMenu();
    });
  }, 5000);
  ```

- [ ] **Step 9: Run TypeScript/package validation**

  Run:

  ```bash
  npm run make
  ```

  Expected: Forge creates `out/make/zip/darwin/arm64/BBYT - Time Audit-darwin-arm64-0.1.0.zip`.

## Task 4: Release Checklist Documentation

**Files:**
- Create: `docs/release.md`

- [ ] **Step 1: Add release checklist**

  Create `docs/release.md`:

  ```md
  # BBYT - Time Audit Release Checklist

  ## First-Time GitHub Setup

  1. Create a public GitHub repo named `bbyt-time-audit`.
  2. Add it as the local remote:

     ```bash
     git remote add origin git@github.com:<github-username>/bbyt-time-audit.git
     ```

  3. Push the initial app:

     ```bash
     git add .
     git commit -m "Initial BBYT Time Audit app"
     git branch -M main
     git push -u origin main
     ```

  ## Create A New Release

  1. Bump the version:

     ```bash
     npm version patch
     ```

     For the MVP sequence, this moves from `0.1.0` to `0.1.1`, then `0.1.2`.

  2. Build the Mac artifact:

     ```bash
     npm run make
     ```

  3. Push the version commit and tag:

     ```bash
     git push origin main --follow-tags
     ```

  4. Create a GitHub Release for the new tag.

  5. Upload the Apple Silicon zip from:

     ```text
     out/make/zip/darwin/arm64/
     ```

  6. Publish the release.

  ## Friend Install Notes

  Because this app is not signed or notarized, macOS may warn on first launch. If so, right-click the app and choose Open.

  Updates are notify-only. When the app says an update is available, open the GitHub Release page, download the newest Apple Silicon zip, unzip it, and replace the app in Applications.
  ```

## Task 5: First Public Release

**Files:**
- No code files after Tasks 1-4 are complete.

- [ ] **Step 1: Initialize the local repo if needed**

  The local `jamos-time` folder currently has no commits. Run:

  ```bash
  git status --short
  ```

  Expected: app files are untracked.

- [ ] **Step 2: Add the GitHub remote**

  Replace `<github-username>`:

  ```bash
  git remote add origin git@github.com:<github-username>/bbyt-time-audit.git
  ```

- [ ] **Step 3: Commit the implementation**

  Run:

  ```bash
  git add .
  git commit -m "Prepare BBYT Time Audit public releases"
  git branch -M main
  git push -u origin main
  ```

- [ ] **Step 4: Build the first MVP artifact**

  Run:

  ```bash
  npm run make
  ```

  Expected artifact:

  ```text
  out/make/zip/darwin/arm64/BBYT - Time Audit-darwin-arm64-0.1.0.zip
  ```

- [ ] **Step 5: Create the first GitHub Release**

  In GitHub:

  ```text
  Releases -> Draft a new release
  Tag: v0.1.0
  Target: main
  Title: BBYT - Time Audit v0.1.0
  Attach: out/make/zip/darwin/arm64/BBYT - Time Audit-darwin-arm64-0.1.0.zip
  Publish release
  ```

- [ ] **Step 6: Verify update check behavior**

  After the first release exists, run the app locally:

  ```bash
  npm start
  ```

  Expected: the tray menu has `Check for Updates`, and because local version is `0.1.0`, it reports no update available.

- [ ] **Step 7: Verify future update behavior**

  For the next release:

  ```bash
  npm version patch
  npm run make
  git push origin main --follow-tags
  ```

  Create and publish release `v0.1.1` with the new zip. A user running `0.1.0` should see `Update Available (0.1.1)` in the tray menu and get a macOS notification after startup.

## Self-Review

- Spec coverage: The plan covers public GitHub release setup, app renaming, MVP versioning, no-signing constraints, notify-only update behavior, release documentation, and first release verification.
- Placeholder scan: The only placeholders are `<github-username>` values that cannot be filled until Jamison creates or names the GitHub repository owner.
- Type consistency: `ReleaseUpdateResult` and `ReleaseUpdateStatus` are defined in shared types and mirrored by `releaseUpdates.ts`; IPC names are `app:checkForUpdates` and `app:openLatestRelease`.
