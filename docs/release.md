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

## One-Time Signing And Notarization Setup

The release build uses the Developer ID certificate:

```text
Developer ID Application: Jamison Pereira (75Q9KX77JX)
```

Store Apple notarization credentials in your local keychain before making signed releases:

```bash
xcrun notarytool store-credentials "bbyt-time-audit-notary" \
  --apple-id "jamison.pereira@gmail.com" \
  --team-id "75Q9KX77JX" \
  --password "<app-specific-password>"
```

Do not commit the app-specific password. If it has been exposed, revoke it at appleid.apple.com and create a replacement.

## Create A New Release

1. Bump the version:

   ```bash
   npm version patch
   ```

   For the MVP sequence, this moves from `0.1.0` to `0.1.1`, then `0.1.2`.

2. Build the Mac artifact:

   ```bash
   npm run make:signed
   ```

   Signed release artifacts are copied to:

   ```text
   out/signed-release/
   ```

3. Push the version commit and tag:

   ```bash
   git push origin main --follow-tags
   ```

4. Create a GitHub Release for the new tag.

5. Upload the Apple Silicon DMG from:

   ```text
   out/signed-release/
   ```

6. Upload the Apple Silicon zip fallback from:

   ```text
   out/signed-release/
   ```

7. Publish the release.

## Friend Install Notes

Because this app is not signed or notarized, macOS may warn on first launch. On some Macs, it may say the app is damaged and should be moved to the Trash.

If that happens, remove the download quarantine flag after copying the app into Applications:

```bash
xattr -dr com.apple.quarantine "/Applications/BBYT - Time Audit.app"
```

Then right-click the app in Applications and choose Open.

Updates are notify-only. When the app says an update is available, open the GitHub Release page, download the newest Apple Silicon DMG, open it, and replace the app in Applications.
