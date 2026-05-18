#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="/private/tmp/bbyt-time-audit-release"
ARTIFACT_DIR="${ROOT_DIR}/out/signed-release"
PROFILE="${APPLE_NOTARY_KEYCHAIN_PROFILE:-bbyt-time-audit-notary}"
SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-Developer ID Application: Jamison Pereira (75Q9KX77JX)}"

if [[ -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]]; then
  echo "Refusing to build a signed release from a dirty working tree."
  echo "Commit or stash local changes first."
  exit 1
fi

rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}" "${ARTIFACT_DIR}"

git -C "${ROOT_DIR}" archive HEAD | tar -x -C "${WORK_DIR}"

pushd "${WORK_DIR}" >/dev/null
npm ci
APPLE_NOTARY_KEYCHAIN_PROFILE="${PROFILE}" npm run make

while IFS= read -r dmg_path; do
  echo "Signing DMG: ${dmg_path}"
  codesign --force --sign "${SIGNING_IDENTITY}" "${dmg_path}"

  echo "Notarizing DMG: ${dmg_path}"
  xcrun notarytool submit "${dmg_path}" \
    --keychain-profile "${PROFILE}" \
    --wait

  echo "Stapling DMG notarization ticket: ${dmg_path}"
  xcrun stapler staple "${dmg_path}"
  xcrun stapler validate "${dmg_path}"
  spctl --assess --type open --context context:primary-signature --verbose=4 "${dmg_path}"
done < <(find out/make -maxdepth 5 -type f -name "*.dmg" -print)
popd >/dev/null

rm -rf "${ARTIFACT_DIR:?}/"*
find "${WORK_DIR}/out/make" -maxdepth 5 -type f \( -name "*.dmg" -o -name "*.zip" \) -exec cp {} "${ARTIFACT_DIR}/" \;

echo "Signed release artifacts copied to ${ARTIFACT_DIR}:"
find "${ARTIFACT_DIR}" -maxdepth 1 -type f -print
