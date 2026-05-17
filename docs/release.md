# BBYT - Time Audit Release Checklist

## First-Time GitHub Setup

1. Create a public GitHub repo named `bbyt-time-audit`.
2. Add it as the local remote:

   ```bash
   git remote add origin git@github.com:jamisonpereira/bbyt-time-audit.git
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

5. Upload the Apple Silicon DMG from:

   ```text
   out/make/
   ```

6. Upload the Apple Silicon zip fallback from:

   ```text
   out/make/zip/darwin/arm64/
   ```

7. Publish the release.

## Friend Install Notes

Because this app is not signed or notarized, macOS may warn on first launch. If so, right-click the app and choose Open.

Updates are notify-only. When the app says an update is available, open the GitHub Release page, download the newest Apple Silicon DMG, open it, and replace the app in Applications.
