# BBYT - Time Audit

A local-first Mac app for tracking your day in 15-minute blocks and reviewing where your time went.

The app runs from the menu bar, stores data locally on your Mac, and can export your audit data to CSV or JSON.

## Download

Download the latest Apple Silicon Mac build from the Releases page:

[Download BBYT - Time Audit](https://github.com/jamisonpereira/bbyt-time-audit/releases/latest)

Choose the `.dmg` file for `darwin-arm64`, open it, and drag `BBYT - Time Audit.app` into Applications.

If the `.dmg` is unavailable for a release, use the `.zip` fallback: unzip it and move `BBYT - Time Audit.app` into your Applications folder.

## First Launch On macOS

This MVP is not signed or notarized yet, so macOS may show a warning the first time you open it.

If that happens:

1. Open Finder.
2. Go to Applications.
3. Right-click `BBYT - Time Audit.app`.
4. Choose Open.
5. Confirm you want to open it.

After that first launch, it should open normally.

## Updates

The app checks GitHub Releases for newer versions. If an update is available, it will show an update option and open the latest release page.

Updates are manual for now:

1. Download the newest `.dmg` from the Releases page.
2. Open the `.dmg`.
3. Replace the old `BBYT - Time Audit.app` in Applications.

## Privacy

Your time audit data is stored locally on your Mac. The app does not require an account or a hosted backend.

If you use the optional AI merge suggestions, you are responsible for the API endpoint and key you configure in the app settings.

## Development

Install dependencies:

```bash
npm install
```

Run the app locally:

```bash
npm start
```

Run checks:

```bash
npm run lint
npm run test:store
npm run test:ai-merge
npm run test:release-updates
```

Build the Mac release artifact:

```bash
npm run make
```

Release maintenance notes live in [docs/release.md](docs/release.md).
